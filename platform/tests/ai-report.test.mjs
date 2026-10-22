import test from 'node:test';
import assert from 'node:assert/strict';
import {generateAIReport,candidates,dateValue,procedure,requestPayload,validateResponse,sourceIsFresh,localDate,MODEL,MAX_INPUT_BYTES,MAX_RESPONSE_BYTES,REQUEST_TIMEOUT_MS} from '../ai-report.mjs';

const now=new Date('2026-10-22T07:55:00Z');
const profile={name:'HumanPlus public healthcare interests',timezone:'Europe/Tirane',sectors:[{category:'Medicines'},{category:'Medical equipment'}],private_company_document:'MUST NOT LEAVE'};
const notice=(id='100',extra={})=>({notice_id:id,title:'Public medical equipment notice',buyer:'Public healthcare buyer',procedure_key:'2026/657-26-7777-1-2-1',published_iso:'2026-10-21',evidence_classification:'tender_notice',deadline_displayed:'30.10.2026 12:00',fingerprint:'fingerprint-'+id,source_url:'https://e-prokurimi.rks-gov.net/?id='+id,category_sq:'Medical equipment',match_reasons:['Public healthcare CPV'],match_confidence:'Përputhje',cpv_as_published:'33100000',attachments:[],private_company_notes:'MUST NOT LEAVE',...extra});
const feed=(rows=[notice()],extra={})=>({notices:rows,run:{status:'ok'},last_successful_check:'2026-10-22T07:50:00Z',...extra});
const entry=id=>({notice_id:String(id),why_match:'Recorded public healthcare signals merit review.',next_step:'Read the official dossier.',evidence_gaps:['Company eligibility is unverified.']});
const provider=(entries=[entry('100')],extra={})=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({entries})}]}],usage:{input_tokens:100,output_tokens:50,total_tokens:150},...extra});
const response=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
const run=options=>generateAIReport({feed:feed(),profile,apiKey:'synthetic-test-only',now,...options});

test('single source-bound request follows persisted claim and preserves exact context fingerprints',async()=>{
 const events=[],correction=notice('101',{published_iso:'2026-10-22',evidence_classification:'correction_notice',deadline_displayed:'29.10.2026 15:00'});
 const result=await run({feed:feed([notice(),correction]),onAttempt:async attempt=>{events.push('persisted');assert.equal(attempt.status,'attempted');assert.equal(attempt.last_api_attempt_date,'2026-10-22');},fetcher:async(url,options)=>{
   events.push('called');assert.equal(events[0],'persisted');assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert(options.signal instanceof AbortSignal);
   const payload=JSON.parse(options.body);assert.equal(payload.model,MODEL);assert.equal(payload.store,false);assert.equal(payload.max_output_tokens,5000);assert.equal(payload.tools,undefined);assert.equal(payload.text.format.strict,true);assert(Buffer.byteLength(options.body)<=MAX_INPUT_BYTES);assert(!options.body.includes('MUST NOT LEAVE'));
   assert.equal(JSON.parse(payload.input[1].content).notices[0].effective_deadline,'2026-10-29');return response(provider());
 }});
 assert.deepEqual(events,['persisted','called']);assert.equal(result.status,'ready');assert.deepEqual(result.entries[0].context_fingerprints,{'100':'fingerprint-100','101':'fingerprint-101'});assert.equal(result.entries[0].fingerprint,'fingerprint-100');assert.equal(result.source_checked_at,'2026-10-22T07:50:00Z');assert.deepEqual(result.usage,{input_tokens:100,output_tokens:50,total_tokens:150});assert(!JSON.stringify(result).includes('synthetic-test-only'));assert.equal(REQUEST_TIMEOUT_MS,180000);
});
test('latest closing notice suppresses the exact procedure; unrelated authority prefixes never merge',()=>{
 const rows=[notice(),notice('101',{evidence_classification:'award_notice',published_iso:'2026-10-22'}),notice('200',{procedure_key:'2026/657-26-8888-1-2-1',deadline_displayed:'28.10.2026 12:00'})];
 assert.deepEqual(candidates(feed(rows),'2026-10-22').map(r=>r.notice_id),['200']);
 assert.equal(procedure({notice_id:'7',procedure_key:'657'}),'notice:7');assert.equal(procedure({notice_id:'8',reference:'ocds-uhzcmx-657-26-8888-1-2-1/B05'}),'657-26-8888-1-2-1');
});
test('candidate cap, calendar validation, unknown and elapsed deadlines',()=>{
 assert.equal(dateValue('31.02.2026'),null);assert.equal(dateValue('29.02.2028'),'2028-02-29');assert.equal(dateValue('10/11/2026'),null);
 const rows=Array.from({length:12},(_,i)=>notice(String(i+1),{procedure_key:'',deadline_displayed:'30.10.2026'}));
 assert.equal(candidates(feed(rows),'2026-10-22').length,8);assert.equal(candidates(feed([notice('50',{deadline_displayed:'21.10.2026'}),notice('51',{procedure_key:'',deadline_displayed:null})]),'2026-10-22').length,0);
});
test('freshness requires same Kosovo day, complete collection, bounded age, no future or duplicate IDs',async()=>{
 const bad=[feed([],{run:{status:'partial'}}),feed([],{last_successful_check:'2026-10-22T01:54:59Z'}),feed([],{last_successful_check:'2026-10-22T07:56:00Z'}),feed([],{last_successful_check:'2026-10-22T07:50:00'}),feed([],{last_successful_check:'invalid'}),feed([notice(),notice()]),feed([{notice_id:{malformed:1}}]),feed([],{last_successful_check:'2026-10-21T21:59:59Z'})];
 for(const source of bad){assert.equal(sourceIsFresh(source,now),false);const r=await run({feed:source,fetcher:()=>assert.fail('No call for an unverified source')});assert.equal(r.status,'source_unavailable');assert.deepEqual(r.entries,[]);}
 assert.equal(sourceIsFresh(feed([],{last_successful_check:'2026-10-22T01:55:00Z'}),now),true);
});
test('same local-day claim prevents a second API call for success, timeout and interrupted attempts',async()=>{
 for(const status of ['ready','failed','attempted']){const previous={status,last_api_attempt_date:'2026-10-22',generated_at:'2026-10-22T07:51:00Z',entries:[]};assert.equal(await run({previous,fetcher:()=>assert.fail('Duplicate paid request')}),previous);}
 // Midnight UTC is not the local-day boundary; CET/CEST dates determine claims.
 assert.equal(localDate(new Date('2026-10-24T22:30:00Z')),'2026-10-25');assert.equal(localDate(new Date('2026-10-25T23:30:00Z')),'2026-10-26');
 const clock=new Date('2026-10-24T22:30:00Z'),source=feed([notice()],{last_successful_check:'2026-10-24T22:25:00Z'}),previous={status:'attempted',last_api_attempt_date:'2026-10-25'};
 assert.equal(await run({now:clock,feed:source,previous,fetcher:()=>assert.fail('Local-day duplicate')}),previous);
});
test('missing key clears AI output but preserves daily usage claim across disable/enable',async()=>{
 const previous={status:'ready',last_api_attempt_date:'2026-10-22',entries:[entry('100')]};
 const disabled=await run({apiKey:'',previous,fetcher:()=>assert.fail('No key')});assert.equal(disabled.status,'not_configured');assert.deepEqual(disabled.entries,[]);assert.equal(disabled.generated_at,null);assert.equal(disabled.last_api_attempt_date,'2026-10-22');
 assert.equal(await run({previous:disabled,fetcher:()=>assert.fail('Do not bypass daily claim')}),disabled);
});
test('rejected or failed durable claim never reaches the provider',async()=>{
 const no=await run({onAttempt:async()=>false,fetcher:()=>assert.fail('Claim was not acquired')});assert.equal(no.status,'attempted');assert.match(no.note,/No API request made/);
 await assert.rejects(run({onAttempt:async()=>{throw new Error('persistence unavailable');},fetcher:()=>assert.fail('Claim was not saved')}),/persistence unavailable/);
});
test('no candidates, invalid fingerprints and oversized public input do not claim or call',async()=>{
 for(const [source,status] of [[feed([]),'no_candidates'],[feed([notice('100',{fingerprint:null})]),'source_unavailable'],[feed([notice('100',{title:'x'.repeat(MAX_INPUT_BYTES)})]),'input_limit']]) {
  const r=await run({feed:source,onAttempt:()=>assert.fail('Not a paid attempt'),fetcher:()=>assert.fail('No API call')});assert.equal(r.status,status);
 }
 assert.throws(()=>requestPayload([notice()],{name:'bad',sectors:[null]}),/invalid_source_profile/);
});
test('model output rejects missing, duplicate, invented IDs, extra fields and invalid content',()=>{
 const rows=candidates(feed([notice(),notice('200',{procedure_key:''})]),'2026-10-22');
 const cases=[provider([entry('100')]),provider([entry('100'),entry('100')]),provider([entry('100'),entry('999')]),provider([{...entry('100'),invented_price:123},entry('200')]),provider([{...entry('100'),why_match:' '},entry('200')]),provider([{...entry('100'),evidence_gaps:[]},entry('200')]),provider([{...entry('100'),next_step:'x'.repeat(1801)},entry('200')]),provider([entry('100'),entry('200')],{status:'incomplete'})];
 for(const value of cases)assert.throws(()=>validateResponse(value,rows));
 const result=validateResponse(provider([entry('200'),entry('100')]),rows);assert.equal(result.length,2);assert.equal(result[0].fingerprint,'fingerprint-200');
});
test('HTTP rejection, timeout, oversized body and invalid response record one safe failure without retries',async()=>{
 const cases=[async()=>new Response('private provider error',{status:429}),async()=>{throw Object.assign(new Error('secret credential in transport error'),{name:'TimeoutError'});},async()=>new Response('x'.repeat(MAX_RESPONSE_BYTES+1)),async()=>response(provider([entry('999')]))];
 for(const impl of cases){let calls=0;const r=await run({fetcher:async(...args)=>{calls++;return impl(...args);}});assert.equal(calls,1);assert.equal(r.status,'failed');assert.equal(r.last_api_attempt_date,'2026-10-22');assert.equal(r.entries.length,0);assert(!JSON.stringify(r).includes('secret credential'));assert(!JSON.stringify(r).includes('private provider error'));}
});
test('usage metadata cannot inject nonnumeric provider output into persisted report',async()=>{
 const r=await run({fetcher:async()=>response(provider(undefined,{usage:{input_tokens:-1,output_tokens:'private text',total_tokens:123}}))});
 assert.equal(r.status,'ready');assert.deepEqual(r.usage,{input_tokens:null,output_tokens:null,total_tokens:123});
});
test('request aborts at the 180-second bound and does not retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let calls=0;
 const pending=run({fetcher:async(_url,{signal})=>{calls++;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true}));}});
 t.mock.timers.tick(REQUEST_TIMEOUT_MS);
 const result=await pending;assert.equal(calls,1);assert.equal(result.status,'failed');assert.match(result.note,/api_timeout/);assert.equal(result.last_api_attempt_date,'2026-10-22');
});
