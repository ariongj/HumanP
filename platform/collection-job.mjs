import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {collect} from './collector.mjs';
import {generateAIReport} from './ai-report.mjs';
import {transaction} from './store.mjs';
import {readSource,saveSource,markSourceFailure} from './source.mjs';

export const COLLECTION_TIME='09:00';
export const TIMEZONE='Europe/Tirane';
export function localClock(now){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};
}
export function ensureCollectionSchema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS collection_job (
    id INTEGER PRIMARY KEY CHECK(id=1),state_json TEXT NOT NULL,
    attempt_date TEXT,attempts INTEGER NOT NULL DEFAULT 0,
    last_started_at TEXT,last_finished_at TEXT,last_status TEXT,
    next_retry_at TEXT,lease_token TEXT,lease_until TEXT,progress_json TEXT,last_error TEXT
  )`);
}
export function initializeCollection(db,{state={records:{},events:[],runs:[]},feed=null,aiReport=null}={}){
  ensureCollectionSchema(db);
  transaction(db,()=>{
    db.prepare('INSERT OR IGNORE INTO collection_job(id,state_json) VALUES(1,?)').run(JSON.stringify(state));
    if(feed&&!db.prepare('SELECT id FROM source_cache WHERE id=1').get())saveSource(db,{feed,aiReport});
  });
}
export function loadBootstrap(){
  const read=name=>{try{return JSON.parse(readFileSync(new URL(`./bootstrap/${name}.json`,import.meta.url),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}};
  return {state:read('state')||{records:{},events:[],runs:[]},feed:read('feed'),aiReport:read('ai-report')};
}
export function claimCollection(db,{now=new Date(),force=false}={}){
  ensureCollectionSchema(db);
  return transaction(db,()=>{
    const row=db.prepare('SELECT * FROM collection_job WHERE id=1').get();
    if(!row)throw new Error('Collector must be initialized');
    const clock=localClock(now),state=JSON.parse(row.state_json);
    if(row.lease_token&&Date.parse(row.lease_until)>now.getTime())return null;
    if(!force){
      if(clock.time<COLLECTION_TIME)return null;
      if(state.last_successful_check&&localClock(new Date(state.last_successful_check)).date===clock.date&&row.last_status==='ok')return null;
      if(row.attempt_date===clock.date&&(row.attempts>=12||Date.parse(row.next_retry_at)>now.getTime()))return null;
    }
    const token=randomUUID(),attempts=row.attempt_date===clock.date?row.attempts+1:1;
    db.prepare(`UPDATE collection_job SET attempt_date=?,attempts=?,last_started_at=?,last_finished_at=NULL,last_status='running',next_retry_at=NULL,lease_token=?,lease_until=?,progress_json=NULL,last_error=NULL WHERE id=1`).run(clock.date,attempts,now.toISOString(),token,new Date(now.getTime()+25*60000).toISOString());
    return {token,state,attempts};
  });
}
export function ownsLease(db,token,now=new Date()){
  const row=db.prepare('SELECT lease_token,lease_until FROM collection_job WHERE id=1').get();
  return row?.lease_token===token&&Date.parse(row.lease_until)>now.getTime();
}
export function persistCollection(db,token,result,now=new Date()){
  return transaction(db,()=>{
    if(!ownsLease(db,token,now))return false;
    db.prepare('UPDATE collection_job SET state_json=? WHERE id=1').run(JSON.stringify(result.state));
    saveSource(db,{feed:result.feed,aiReport:readSource(db).aiReport},now);
    return true;
  });
}
export function finishCollection(db,token,{status,error=null,attempts=1},now=new Date()){
  const next=status==='ok'?null:new Date(now.getTime()+Math.min(120,15*2**Math.min(attempts-1,3))*60000).toISOString();
  return db.prepare(`UPDATE collection_job SET last_finished_at=?,last_status=?,next_retry_at=?,lease_token=NULL,lease_until=NULL,last_error=? WHERE id=1 AND lease_token=? AND lease_until>?`).run(now.toISOString(),status,next,error,token,now.toISOString()).changes===1;
}
export function collectionStatus(db,now=new Date()){
  ensureCollectionSchema(db);
  const row=db.prepare('SELECT * FROM collection_job WHERE id=1').get();
  return {provider:'Hostinger · official Kosovo portal',timezone:TIMEZONE,collectionTime:COLLECTION_TIME,reportTime:'10:00',status:row?.last_status==='running'&&Date.parse(row.lease_until)<=now.getTime()?'interrupted':row?.last_status||'pending',lastStartedAt:row?.last_started_at||null,lastFinishedAt:row?.last_finished_at||null,nextRetryAt:row?.next_retry_at||null,attempts:row?.attempts||0,progress:row?.progress_json?JSON.parse(row.progress_json):null,error:row?.last_error||null};
}
export async function runCollection(db,{profile,now=()=>new Date(),force=false,collectFn=collect,aiFn=generateAIReport,apiKey=process.env.OPENAI_API_KEY,fetchHTML}={}){
  const claim=claimCollection(db,{now:now(),force});
  if(!claim)return {status:'skipped'};
  let saved=false;
  try{
    const result=await collectFn({state:claim.state,profile,now:now(),fetchHTML,deadlineMs:20*60000,onProgress:progress=>{
      db.prepare('UPDATE collection_job SET progress_json=? WHERE id=1 AND lease_token=?').run(JSON.stringify(progress),claim.token);
    }});
    if(!persistCollection(db,claim.token,result,now()))return {status:'lease_lost'};
    saved=true;
    let aiStatus='not_run';
    if(result.feed.run?.status==='ok'){
      try{
        const ai=await aiFn({feed:result.feed,profile,previous:readSource(db).aiReport,apiKey,now:now(),onAttempt:attempt=>transaction(db,()=>{
          if(!ownsLease(db,claim.token,now()))return false;
          db.prepare('UPDATE source_cache SET ai_json=? WHERE id=1').run(JSON.stringify(attempt));return true;
        })});
        if(ownsLease(db,claim.token,now()))db.prepare('UPDATE source_cache SET ai_json=? WHERE id=1').run(JSON.stringify(ai));
        aiStatus=ai?.status||'unavailable';
      }catch{aiStatus='error';}
    }
    const status=result.feed.run?.status==='ok'?'ok':'partial';
    const finished=finishCollection(db,claim.token,{status,error:status==='ok'?null:'Some official publications could not be checked; a retry is scheduled.',attempts:claim.attempts},now());
    return {status:finished?status:'lease_lost',source_checked_at:result.feed.last_successful_check,notices:result.feed.notices.length,ai_status:aiStatus};
  }catch{
    transaction(db,()=>{
      if(ownsLease(db,claim.token,now())){
        if(!saved)markSourceFailure(db,now());
        finishCollection(db,claim.token,{status:'error',error:'Official collection did not complete; a retry is scheduled.',attempts:claim.attempts},now());
      }
    });
    return {status:'error'};
  }
}
