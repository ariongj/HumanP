import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore,createCompany} from '../store.mjs';
import {readSource} from '../source.mjs';
import {buildDailyReports,runDeliveryTick,listReports} from '../reports.mjs';
import {generateAIReport} from '../ai-report.mjs';
import {initializeCollection,claimCollection,ownsLease,persistCollection,finishCollection,collectionStatus,runCollection,localClock} from '../collection-job.mjs';

const at=value=>new Date(value);
const due=at('2026-10-22T07:00:00Z'); // 09:00 Kosovo, before the autumn DST change.
const iso=now=>now.toISOString();
const row={notice_id:'100',title:'Synthetic laboratory reagents',buyer:'Synthetic public hospital',
  category_sq:'Laborator dhe diagnostikë',procedure_key:'2026/657-26-3468-2-1-1',evidence_classification:'tender_notice',
  published_iso:'2026-10-21',deadline_displayed:'30.10.2026 12:00',deadline_timezone:'Europe/Tirane',
  source_url:'https://e-prokurimi.rks-gov.net/SPIN_PROD/application/ipn/DocumentManagement/DokumentPodaciFrm.aspx?id=100',fingerprint:'synthetic-100',gaps:[]};
const source=(now,status='ok')=>({notices:[{...row}],last_successful_check:iso(now),run:{status},source_url:'https://e-prokurimi.rks-gov.net/'});
const state=now=>({records:{100:{...row}},events:[],runs:[],last_successful_check:iso(now)});
function result(now,extra={}){return {state:state(now),feed:source(now),...extra};}
const noAI=async()=>({status:'unavailable',reason:'Synthetic offline test; no API key used.'});
function database(t){const db=openStore(':memory:');initializeCollection(db);t.after(()=>db.close());return db;}
function files(t){const dir=mkdtempSync(join(tmpdir(),'humanplus-collection-')),path=join(dir,'test.sqlite');const connections=[];
 const connect=()=>{const db=openStore(path);connections.push(db);return db;};t.after(()=>{for(const db of connections)try{db.close();}catch{}rmSync(dir,{recursive:true,force:true});});return {connect,path};}
function owner(db){db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('owner','owner@example.test','Synthetic owner','not-a-live-password',iso(due));return createCompany(db,{name:'Synthetic healthcare company',userId:'owner'});}

test('09:00 claim is atomic across connections; force does not bypass an active lease',t=>{
  const f=files(t),a=f.connect(),b=f.connect();initializeCollection(a);
  assert.equal(claimCollection(a,{now:at('2026-10-22T06:59:59Z')}),null);
  const first=claimCollection(a,{now:due});assert(first);assert.equal(first.attempts,1);
  assert.equal(claimCollection(b,{now:due}),null);assert.equal(claimCollection(b,{now:due,force:true}),null);
  assert.equal(ownsLease(a,first.token,due),true);assert.equal(ownsLease(b,'forged-token',due),false);
  assert.equal(collectionStatus(b,due).status,'running');
  assert.equal(b.prepare('SELECT attempts FROM collection_job WHERE id=1').get().attempts,1);
});

test('a crashed worker loses its lease after 25 minutes and cannot overwrite its replacement',t=>{
  const f=files(t),old=f.connect(),replacement=f.connect();const yesterday=at('2026-10-21T07:00:00Z');
  initializeCollection(old,{state:state(yesterday),feed:source(yesterday)});const lost=claimCollection(old,{now:due});
  const expired=at('2026-10-22T07:25:00Z');assert.equal(ownsLease(old,lost.token,expired),false);assert.equal(collectionStatus(replacement,expired).status,'interrupted');
  assert.equal(persistCollection(old,lost.token,result(due),expired),false);
  const next=claimCollection(replacement,{now:expired});assert(next);assert.notEqual(next.token,lost.token);assert.equal(next.attempts,2);
  assert.equal(persistCollection(old,lost.token,result(due),expired),false);
  assert.equal(finishCollection(old,lost.token,{status:'ok'},expired),false);
  assert.equal(readSource(replacement).feed.last_successful_check,iso(yesterday));
  assert.equal(persistCollection(replacement,next.token,result(expired),expired),true);
  assert.equal(finishCollection(replacement,next.token,{status:'ok',attempts:2},expired),true);
  assert.equal(readSource(old).feed.last_successful_check,iso(expired));
  assert.equal(collectionStatus(old,expired).status,'ok');
});

test('persisted state and source bootstrap are inserted only once across process restarts',t=>{
  const f=files(t);let db=f.connect();const yesterday=at('2026-10-21T07:00:00Z');
  initializeCollection(db,{state:state(yesterday),feed:source(yesterday),aiReport:{status:'ready',marker:'seed'}});
  const claim=claimCollection(db,{now:due});persistCollection(db,claim.token,result(due),due);finishCollection(db,claim.token,{status:'ok'},due);db.close();
  db=f.connect();initializeCollection(db,{state:{records:{},events:[],runs:[]},feed:{notices:[],run:{status:'error'}},aiReport:{status:'error'}});
  assert.equal(JSON.parse(db.prepare('SELECT state_json FROM collection_job WHERE id=1').get().state_json).last_successful_check,iso(due));
  assert.equal(readSource(db).feed.last_successful_check,iso(due));assert.equal(readSource(db).feed.notices.length,1);assert.equal(readSource(db).aiReport.marker,'seed');
  assert.equal(claimCollection(db,{now:at('2026-10-22T08:00:00Z')}),null,'successful date is not recollected after a restart');
  const tomorrow=claimCollection(db,{now:at('2026-10-23T07:00:00Z')});assert(tomorrow);assert.equal(tomorrow.attempts,1);
});

test('collection follows 09:00 Kosovo across DST and reports follow at 10:00 without duplicate inbox entries',async t=>{
  const db=database(t);const company=owner(db);
  for(const [day,collectionHour,reportHour] of [['24','07','08'],['25','08','09']]){
    const collectionAt=at(`2026-10-${day}T${collectionHour}:00:00Z`),reportAt=at(`2026-10-${day}T${reportHour}:00:00Z`);
    assert.equal(localClock(collectionAt).time,'09:00');assert.equal(localClock(reportAt).time,'10:00');
    assert.equal(claimCollection(db,{now:new Date(collectionAt.getTime()-1000)}),null);
    const collected=await runCollection(db,{now:()=>collectionAt,collectFn:async()=>result(collectionAt),aiFn:noAI,apiKey:null});assert.equal(collected.status,'ok');
    assert.equal(buildDailyReports(db,{now:new Date(reportAt.getTime()-1000),...readSource(db)}).length,0);
    const reports=buildDailyReports(db,{now:reportAt,...readSource(db)});assert.equal(reports.length,1);assert.equal(reports[0].status,'ready');assert.equal(reports[0].report_date,`2026-10-${day}`);
    assert.equal(runDeliveryTick(db,{now:reportAt}).length,1);assert.equal(runDeliveryTick(db,{now:new Date(reportAt.getTime()+60000)}).length,0);
    assert.equal((await runCollection(db,{now:()=>reportAt,collectFn:async()=>{throw new Error('must not recollect');},aiFn:noAI})).status,'skipped');
  }
  assert.equal(listReports(db,company).length,2);assert.equal(db.prepare('SELECT count(*) AS n FROM notification_deliveries').get().n,2);
});

test('partial collection retains the previous successful timestamp and schedules a bounded retry',async t=>{
  const db=database(t),yesterday=at('2026-10-21T07:00:00Z');
  const previousAI={status:'ready',source_checked_at:iso(yesterday),entries:[]};
  // A first initializer may precede seed availability; source and collector state
  // are seeded together here before any collection has run.
  db.prepare('DELETE FROM collection_job').run();initializeCollection(db,{state:state(yesterday),feed:source(yesterday),aiReport:previousAI});
  let aiCalls=0;
  const partial={state:{...state(yesterday),records:{100:{...row},101:{...row,notice_id:'101'}}},feed:{...source(yesterday,'partial'),notices:[{...row},{...row,notice_id:'101'}]}};
  const outcome=await runCollection(db,{now:()=>due,collectFn:async()=>partial,aiFn:async()=>{aiCalls++;return {status:'ready'};}});
  assert.equal(outcome.status,'partial');assert.equal(aiCalls,0);
  assert.equal(readSource(db).feed.last_successful_check,iso(yesterday));assert.equal(readSource(db).feed.run.status,'partial');assert.equal(readSource(db).feed.notices.length,2);assert.deepEqual(readSource(db).aiReport,previousAI);
  const status=collectionStatus(db,due);assert.equal(status.nextRetryAt,'2026-10-22T07:15:00.000Z');assert.equal(status.attempts,1);
  assert.equal(claimCollection(db,{now:at('2026-10-22T07:14:59Z')}),null);assert(claimCollection(db,{now:at('2026-10-22T07:15:00Z')}));
});

test('failed collection preserves cached facts and durable attempt count through restart',async t=>{
  const f=files(t);let db=f.connect();const yesterday=at('2026-10-21T07:00:00Z');
  initializeCollection(db,{state:state(yesterday),feed:source(yesterday)});
  const failure=await runCollection(db,{now:()=>due,collectFn:async()=>{throw new Error('synthetic outage');},aiFn:noAI});assert.equal(failure.status,'error');
  assert.equal(readSource(db).feed.last_successful_check,iso(yesterday));assert.deepEqual(readSource(db).feed.notices,[row]);assert.equal(readSource(db).feed.run.status,'error');db.close();
  db=f.connect();initializeCollection(db);assert.equal(collectionStatus(db,due).attempts,1);assert.equal(collectionStatus(db,due).status,'error');
  assert.equal(claimCollection(db,{now:at('2026-10-22T07:14:59Z')}),null);assert.equal(claimCollection(db,{now:at('2026-10-22T07:15:00Z')}).attempts,2);
});

test('retry backoff is 15, 30, 60 then 120 minutes and never exceeds twelve attempts per local date',t=>{
  const db=database(t);let now=due;
  for(let attempt=1;attempt<=8;attempt++){
    const claim=claimCollection(db,{now});assert(claim,`attempt ${attempt}`);assert.equal(claim.attempts,attempt);
    assert.equal(finishCollection(db,claim.token,{status:'error',attempts:claim.attempts},now),true);
    const next=at(collectionStatus(db,now).nextRetryAt),expected=Math.min(120,15*2**Math.min(attempt-1,3));assert.equal(next-now,expected*60000);
    assert.equal(claimCollection(db,{now:new Date(next.getTime()-1)}),null);now=next;
  }
  // The real maximum-delay schedule can cross midnight before all twelve. Set
  // an exhausted same-date receipt to verify the independent daily ceiling.
  db.prepare('UPDATE collection_job SET attempt_date=?,attempts=12,next_retry_at=NULL WHERE id=1').run('2026-10-22');
  assert.equal(claimCollection(db,{now:at('2026-10-22T21:00:00Z')}),null);
  assert.equal(claimCollection(db,{now:at('2026-10-23T07:00:00Z')}).attempts,1);
});

test('overlapping workers cannot both collect while one awaits a slow source',async t=>{
  const f=files(t),a=f.connect(),b=f.connect();initializeCollection(a);
  let release,entered;const began=new Promise(resolve=>entered=resolve),blocked=new Promise(resolve=>release=resolve);let calls=0;
  const first=runCollection(a,{now:()=>due,collectFn:async()=>{calls++;entered();await blocked;return result(due);},aiFn:noAI});await began;
  const second=await runCollection(b,{now:()=>due,collectFn:async()=>{calls++;return result(due);},aiFn:noAI});assert.equal(second.status,'skipped');assert.equal(calls,1);
  release();assert.equal((await first).status,'ok');assert.equal(collectionStatus(b,due).attempts,1);
});

test('late source completion cannot overwrite a newer worker after lease expiry',async t=>{
  const f=files(t),a=f.connect(),b=f.connect();initializeCollection(a);let now=due,release,entered;
  const began=new Promise(resolve=>entered=resolve),blocked=new Promise(resolve=>release=resolve);
  const old=runCollection(a,{now:()=>now,collectFn:async()=>{entered();await blocked;return result(due);},aiFn:noAI});await began;
  now=at('2026-10-22T07:26:00Z');const next=await runCollection(b,{now:()=>now,collectFn:async()=>result(now),aiFn:noAI});assert.equal(next.status,'ok');
  release();assert.equal((await old).status,'lease_lost');assert.equal(readSource(a).feed.last_successful_check,iso(now));assert.equal(collectionStatus(a,now).status,'ok');
});

test('AI attempt receipt is committed before network work and retained when that work fails',async t=>{
  const f=files(t),a=f.connect(),b=f.connect();initializeCollection(a);let claims=0;
  const attempt={status:'attempted',attempted_at:iso(due),source_checked_at:iso(due),request_fingerprint:'synthetic-request'};
  const outcome=await runCollection(a,{now:()=>due,collectFn:async()=>result(due),apiKey:'synthetic-never-sent',aiFn:async({onAttempt})=>{
    assert.equal(onAttempt(attempt),true);claims++;
    assert.deepEqual(readSource(b).aiReport,attempt,'second connection sees the committed charge guard before the request');
    throw new Error('synthetic AI transport failure');
  }});
  assert.equal(outcome.status,'ok');assert.equal(outcome.ai_status,'error');assert.equal(claims,1);assert.deepEqual(readSource(b).aiReport,attempt);
  assert.equal((await runCollection(b,{now:()=>at('2026-10-22T08:00:00Z'),collectFn:async()=>{throw new Error('must not run');},aiFn:noAI})).status,'skipped');
  const retry=await runCollection(b,{now:()=>at('2026-10-22T08:00:00Z'),force:true,collectFn:async()=>result(due),aiFn:async({previous})=>{assert.deepEqual(previous,attempt);return previous;}});
  assert.equal(retry.status,'ok');assert.equal(claims,1);
});

test('expired AI worker cannot claim a request or replace a newer AI result',async t=>{
  const f=files(t),a=f.connect(),b=f.connect();initializeCollection(a);let now=due,release,entered;
  const began=new Promise(resolve=>entered=resolve),blocked=new Promise(resolve=>release=resolve);let oldClaim;
  const first=runCollection(a,{now:()=>now,collectFn:async()=>result(due),aiFn:async({onAttempt})=>{entered();await blocked;oldClaim=onAttempt({status:'attempted',marker:'old'});return {status:'ready',marker:'old'};}});await began;
  now=at('2026-10-22T07:26:00Z');const second=await runCollection(b,{now:()=>now,collectFn:async()=>result(now),aiFn:async()=>({status:'ready',marker:'new'})});assert.equal(second.status,'ok');
  release();assert.equal((await first).status,'lease_lost');assert.equal(oldClaim,false);assert.equal(readSource(a).aiReport.marker,'new');
});

test('real AI daily cost guard survives failed transport, reconnect, and a forced same-day collection',async t=>{
  const f=files(t);let db=f.connect();initializeCollection(db);let calls=0;
  const profile={name:'Synthetic healthcare source profile',timezone:'Europe/Tirane',sectors:[{category:'Laboratory'}]};
  const aiFn=options=>generateAIReport({...options,fetcher:async()=>{calls++;throw new TypeError('synthetic transport failure');}});
  const first=await runCollection(db,{now:()=>due,profile,apiKey:'synthetic-never-sent',collectFn:async()=>result(due),aiFn});
  assert.equal(first.status,'ok');assert.equal(first.ai_status,'failed');assert.equal(calls,1);
  assert.equal(readSource(db).aiReport.last_api_attempt_date,'2026-10-22');db.close();db=f.connect();initializeCollection(db);
  const later=at('2026-10-22T07:15:00Z');
  const retried=await runCollection(db,{now:()=>later,force:true,profile,apiKey:'synthetic-never-sent',collectFn:async()=>result(later),aiFn});
  assert.equal(retried.status,'ok');assert.equal(calls,1,'a process restart or manual source retry must not repeat the paid request');
  assert.equal(readSource(db).aiReport.last_api_attempt_date,'2026-10-22');assert.equal(readSource(db).aiReport.status,'failed');
});

test('source recovery updates an outage report in place and never duplicates its private delivery',async t=>{
  const db=database(t),company=owner(db),ten=at('2026-10-22T08:00:00Z');
  const outage=buildDailyReports(db,{now:ten,...readSource(db)})[0];assert.equal(outage.status,'source_unavailable');
  const delivery=runDeliveryTick(db,{now:ten})[0];assert(delivery);
  const recoveredAt=at('2026-10-22T08:10:00Z');assert.equal((await runCollection(db,{now:()=>recoveredAt,collectFn:async()=>result(recoveredAt),aiFn:noAI})).status,'ok');
  const recovered=buildDailyReports(db,{now:recoveredAt,...readSource(db)})[0];assert.equal(recovered.id,outage.id);assert.equal(recovered.status,'ready');assert.equal(recovered.revision,2);assert.equal(recovered.opportunities.length,1);
  assert.equal(runDeliveryTick(db,{now:recoveredAt}).length,0);
  const stored=db.prepare('SELECT id,report_id FROM notification_deliveries WHERE company_id=?').all(company);assert.deepEqual(stored.map(x=>({...x})),[{id:delivery.id,report_id:outage.id}]);
  assert.equal(listReports(db,company).length,1);
});

test('AI that finishes after 10:00 enriches the existing report once without duplicate delivery',async t=>{
  const db=database(t),company=owner(db);let now=at('2026-10-22T07:50:00Z'),release,entered;
  const checkedAt=iso(now),began=new Promise(resolve=>entered=resolve),blocked=new Promise(resolve=>release=resolve);
  const generated={status:'ready',source_checked_at:checkedAt,generated_at:'2026-10-22T08:05:00.000Z',entries:[{
    notice_id:'100',fingerprint:row.fingerprint,context_fingerprints:{100:row.fingerprint},
    why_match:'Synthetic public healthcare signals',next_step:'Verify the official dossier',evidence_gaps:['Licences are not verified.'],
  }]};
  const collection=runCollection(db,{now:()=>now,collectFn:async()=>result(now),aiFn:async({onAttempt})=>{
    assert.equal(onAttempt({status:'attempted',last_api_attempt_date:'2026-10-22',source_checked_at:checkedAt}),true);entered();await blocked;return generated;
  }});await began;
  now=at('2026-10-22T08:00:00Z');const first=buildDailyReports(db,{now,...readSource(db)})[0];assert.equal(first.status,'ready');assert.equal(first.opportunities[0].ai_interpretation,null);
  const delivery=runDeliveryTick(db,{now})[0];assert(delivery);
  now=at('2026-10-22T08:05:00Z');release();assert.equal((await collection).status,'ok');
  const mismatch={...generated,entries:generated.entries.map(e=>({...e,context_fingerprints:{}}))};
  assert.equal(buildDailyReports(db,{now,feed:readSource(db).feed,aiReport:mismatch})[0].revision,1,'unverified AI does not revise the report');
  const enriched=buildDailyReports(db,{now,...readSource(db)})[0];assert.equal(enriched.id,first.id);assert.equal(enriched.revision,2);assert.equal(enriched.generated_at,first.generated_at);
  assert.equal(enriched.opportunities[0].ai_interpretation.why_match,generated.entries[0].why_match);assert.equal(enriched.opportunities[0].title,first.opportunities[0].title);
  assert.equal(runDeliveryTick(db,{now}).length,0);assert.equal(buildDailyReports(db,{now,...readSource(db)})[0].revision,2,'identical AI does not create extra revisions');
  assert.equal(listReports(db,company).length,1);assert.deepEqual(db.prepare('SELECT id,report_id FROM notification_deliveries').all().map(x=>({...x})),[{id:delivery.id,report_id:first.id}]);
});
