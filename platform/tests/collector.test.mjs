import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BASE,LISTING,parseListing,parseNotice,classify,classifyRecords,collect,fetchPortalHTML} from '../collector.mjs';
const profile=JSON.parse(readFileSync(new URL('../../monitor/profile.json',import.meta.url),'utf8'));
const now=new Date('2026-10-19T08:00:00Z');
function listing(ids=['100'],title='Test notice') {return '<h1>On-line njoftimet 19.10.2026</h1><h2>PlusMinusB05 Njoftim per Kontrat</h2>'+ids.map(id=>`<a class="DetailsBtn" href="DokumentPodaciFrm.aspx?id=${id}"></a><a href="DokumentPodaciFrm.aspx?id=${id}">1. ${title}</a>`).join('');}
function detail(deadline='12.11.2026 13:00',overrides={}) {const fields={Naslov:'Test notice',BrojObjave:'2026/220/70100-26-1234-1-1-1/B05-1',Narucitelj:'QENDRA KLINIKE UNIVERSITARE E KOSOVES',VrstaObjave:'B05 Njoftim per Kontrat',Cpv:'33000000-0 Medical equipment',ProcijenjenaVrijednost:'10,000.00',RokZaDostavuVrijeme:deadline,...overrides};return Object.entries(fields).map(([k,v])=>`<span id="uiDokumentPodaci_ui${k}">${v}</span>`).join('')+'<input id="uiDokumentPodaci_uiDatumObjave_textBox" value="19.10.2026">';}
const source=url=>Promise.resolve(url===LISTING?listing():detail());

test('listing deduplicates paired links, decodes nested HTML and requires dated publication groups',()=>{
 const {records,dates}=parseListing(listing(['100','101'],'Furnizim me <b>barna</b> &amp; pajisje'));assert.equal(Object.keys(records).length,2);assert.deepEqual(dates,['2026-10-19']);assert.equal(records['100'].listed_title,'Furnizim me barna & pajisje');
 assert.throws(()=>parseListing('<h1>Sign in</h1>'),/empty/);assert.throws(()=>parseListing('<a href="DokumentPodaciFrm.aspx?id=1">Title</a>'),/outside/);assert.throws(()=>parseListing(listing().replace('19.10.2026','31.02.2026')),/Invalid/);
 assert.throws(()=>parseListing(listing(['../secret'])),/empty/);
});

test('notice preserves full procedure, source unknowns, attachments and stage; rejects login/schema failures',()=>{
 const listed=parseListing(listing()).records['100'],row=parseNotice(detail()+'<span id="x_lblDocumentFileName">Dosja &amp; Shtojca.pdf</span>',listed);
 assert.equal(row.procedure_key,'2026/220/70100-26-1234-1-1-1');assert.equal(row.published_iso,'2026-10-19');assert.equal(row.estimated_value_currency,null);assert.equal(row.supplier,null);assert.deepEqual(row.attachments,['Dosja & Shtojca.pdf']);assert.equal(row.evidence_classification,'tender_notice');assert.equal(row.source_url,BASE+'DokumentPodaciFrm.aspx?id=100');assert.match(row.deadline_timezone,/Not stated/);
 assert.equal(parseNotice(detail('',{VrstaObjave:'B10 Cancellation'}),listed).evidence_classification,'cancellation_notice');assert.throws(()=>parseNotice('<h1>Sign in</h1>',listed),/metadata missing/);assert.throws(()=>parseNotice(detail(),{notice_id:'100&other=1'}),/numeric/);
});

test('classification preserves healthcare support, uncertain cross-sector labs, exclusions and exact authority identity',()=>{
 assert.equal(classify({title:'Cleaning service',buyer:'SHSKUK',cpv_as_published:'90910000-9'},profile).scope,'institutional_support');assert(classify({title:'Furnizim me barna',buyer:'Komuna'},profile).matched);
 assert.equal(classify({title:'Pajisje laboratorike',buyer:'Fakulteti i inxhinierise'},profile).match_confidence,'Për shqyrtim');assert.equal(classify({title:'Road construction',buyer:'Komuna'},profile).matched,false);
 assert.equal(classify({title:'Cleaning service',buyer:'SHSKUK'},{...profile,excluded_keywords:['cleaning']}).matched,false);
 const tender={notice_id:'1',title:'Barna',buyer:'Komuna',procedure_key:'2026/220/70100-26-1234-1-1-1',published_iso:'2026-10-19',evidence_classification:'tender_notice'},cancel={...tender,notice_id:'2',title:'Cancellation',evidence_classification:'cancellation_notice'},other={...cancel,notice_id:'3',procedure_key:'2026/999/70100-26-1234-1-1-1'};
 const rows=Object.fromEntries([tender,cancel,other].map(r=>[r.notice_id,r]));classifyRecords(rows,profile);assert(rows['2'].matched);assert.deepEqual(rows['2'].match_reasons,['Procedurë e njëjtë me njoftimin 1']);assert.equal(rows['3'].matched,false);
});

test('fingerprints and event IDs exactly match Python default-spaced UTF-8 canonical JSON, including Unicode',async()=>{
 const first=await collect({profile,fetchHTML:source,now});
 assert.equal(first.state.records['100'].fingerprint,'c405d42760b3b4a9796f1428bf523c80695d28055439f365cb7eb394f054c310');assert.equal(first.feed.events[0].id,'02f58cb730f42f9202320a843d93bd2093a42a5fc3b75042fb1462c3075b9651');assert.equal(first.feed.last_successful_check,'2026-10-19T08:00:00+00:00');
 const unicode=await collect({profile,fetchHTML:async url=>url===LISTING?listing():detail(undefined,{Naslov:'Ilaçe për shëndetësi 𝄞'}),now});
 assert.equal(unicode.state.records['100'].fingerprint,'8e4423b2f6a5dc2f3dd8f73e8602b9fb54fa4c8135cbcd884f8792f6c489cb03');
});

test('retries are idempotent, changed deadline produces one receipt, prior state is not mutated',async()=>{
 const first=await collect({profile,fetchHTML:source,now}),snapshot=JSON.stringify(first.state);
 const same=await collect({state:first.state,profile,fetchHTML:source,now});assert.equal(JSON.stringify(first.state),snapshot);assert.equal(same.feed.events.length,1);assert.equal(same.feed.run.changed,0);
 const changedSource=async url=>url===LISTING?listing():detail('20.11.2026 13:00');
 const changed=await collect({state:same.state,profile,fetchHTML:changedSource,now});assert.equal(changed.feed.events.length,2);assert.equal(changed.feed.events[1].kind,'changed');assert(changed.feed.events[1].fields.includes('deadline_displayed'));
 const again=await collect({state:changed.state,profile,fetchHTML:changedSource,now});assert.equal(again.feed.events.length,2);assert.equal(again.feed.run.changed,0);
});

test('listing/detail failures retain prior successes and data without claiming an empty success',async()=>{
 const original=await collect({profile,fetchHTML:source,now});
 const failed=await collect({state:original.state,profile,now,fetchHTML:async()=>{throw new Error('source unavailable');}});assert.equal(failed.feed.run.status,'failed');assert.equal(failed.feed.last_successful_check,original.feed.last_successful_check);assert.equal(failed.feed.notices.length,1);
 const partial=await collect({profile,now,fetchHTML:async url=>{if(url===LISTING)return listing(['100','101']);if(url.endsWith('101'))throw new Error('detail unavailable');return detail();}});assert.equal(partial.feed.run.status,'partial');assert.equal(partial.feed.last_successful_check,null);assert.equal(partial.feed.run.listed,2);assert.equal(partial.feed.run.checked,1);assert.equal(partial.feed.notices.length,1);
});

test('all new metadata is fetched, matched old open/recent notices refresh, unchanged unmatched notices skip, changed titles refresh',async()=>{
 const road=detail('',{Naslov:'Road construction',Narucitelj:'Komuna',Cpv:'45000000-1 Construction'});
 const old=await collect({profile,now,fetchHTML:async url=>url===LISTING?listing(['100','101']):url.endsWith('101')?road:detail()});assert.equal(old.state.records['101'].matched,false);
 const calls=[];let active=0,peak=0;
 const next=await collect({state:old.state,profile,now,concurrency:2,fetchHTML:async url=>{calls.push(url);active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2));active--;return url===LISTING?listing(['101','102']):url.endsWith('100')?detail():road;}});
 assert.equal(next.feed.run.checked,2);assert(calls.some(u=>u.endsWith('100')));assert(calls.some(u=>u.endsWith('102')));assert(!calls.some(u=>u.endsWith('101')));assert(peak<=2);
 const refreshed=[];await collect({state:next.state,profile,now,fetchHTML:async url=>{refreshed.push(url);return url===LISTING?listing(['101'],'Changed title'):url.endsWith('101')?road:detail();}});assert(refreshed.some(u=>u.endsWith('101')));
});

test('profile changes reclassify accumulated records and emit one new-match receipt',async()=>{
 const excluded={...profile,excluded_keywords:['test notice']},first=await collect({profile:excluded,fetchHTML:source,now});assert.equal(first.feed.notices.length,0);
 const next=await collect({state:first.state,profile,fetchHTML:source,now});assert.equal(next.feed.notices.length,1);assert.deepEqual(next.feed.events.map(e=>e.kind),['new_match']);
 const again=await collect({state:next.state,profile,fetchHTML:source,now});assert.equal(again.feed.events.length,1);
});

test('missing publication window is an explicit gap without advancing last complete success',async()=>{
 const old='2026-09-01T10:00:00+00:00',result=await collect({state:{records:{},events:[],runs:[],last_successful_check:old},profile,fetchHTML:source,now});assert.equal(result.feed.last_successful_check,old);assert.equal(result.feed.run.status,'partial');assert.equal(result.feed.run.errors[0].kind,'coverage_gap');
});

test('overall time budget bounds ignored request signals and stalled progress handlers',async()=>{
 const started=Date.now();const stalled=await collect({profile,now,deadlineMs:20,fetchHTML:async url=>url===LISTING?listing():new Promise(()=>{})});assert(Date.now()-started<1000);assert.equal(stalled.feed.run.status,'failed');assert.equal(stalled.feed.last_successful_check,null);
 const progress=await collect({profile,now,deadlineMs:20,fetchHTML:source,onProgress:()=>new Promise(()=>{})});assert.equal(progress.feed.run.status,'failed');assert(progress.feed.run.errors.some(e=>e.kind==='collection_deadline'));
});

test('fetch retries only up to twice, bounded timeouts and strict URL/redirect allowlist',async()=>{
 let attempts=0;const html=await fetchPortalHTML(LISTING,{retryDelayMs:0,fetchImpl:async()=>{attempts++;return new Response(attempts<3?'temporary':'<html>ok</html>',{status:attempts<3?503:200});}});assert.equal(attempts,3);assert.equal(html,'<html>ok</html>');
 attempts=0;await assert.rejects(fetchPortalHTML(LISTING,{retryDelayMs:0,fetchImpl:async()=>{attempts++;return new Response('down',{status:503});}}),/HTTP 503/);assert.equal(attempts,3);
 let forbiddenCalls=0;for(const url of ['http://e-prokurimi.rks-gov.net/','https://example.test/','https://e-prokurimi.rks-gov.net/secret',BASE+'DokumentPodaciFrm.aspx?id=100&x=1'])await assert.rejects(fetchPortalHTML(url,{fetchImpl:async()=>{forbiddenCalls++;}}));assert.equal(forbiddenCalls,0);
 const redirects=[];await assert.rejects(fetchPortalHTML(LISTING,{fetchImpl:async url=>{redirects.push(url);return new Response(null,{status:302,headers:{location:'https://example.test/stolen'}});}}),/allowlisted/);assert.equal(redirects.length,1);
 const timeoutStart=Date.now();await assert.rejects(fetchPortalHTML(LISTING,{timeoutMs:5,retryDelayMs:0,fetchImpl:()=>new Promise(()=>{})}),/deadline/);assert(Date.now()-timeoutStart<1000);
});

test('fetch response cap applies to advertised and actual streamed bytes; BOM decoding matches Python utf-8-sig',async()=>{
 let calls=0;await assert.rejects(fetchPortalHTML(LISTING,{fetchImpl:async()=>{calls++;return new Response('x',{headers:{'content-length':'12000001'}});}}),/12MB/);assert.equal(calls,1);
 await assert.rejects(fetchPortalHTML(LISTING,{fetchImpl:async()=>new Response(new Uint8Array(12_000_001))}),/12MB/);
 assert.equal(await fetchPortalHTML(LISTING,{fetchImpl:async()=>new Response(new Uint8Array([0xef,0xbb,0xbf,65]))}),'A');
});
