import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureReportSchema,buildDailyReports,listReports,runDeliveryTick} from '../reports.mjs';

const at=value=>new Date(value), due=at('2026-10-22T08:00:00Z');
function database(file=':memory:') {
 const db=new DatabaseSync(file);db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY,name TEXT NOT NULL,sector TEXT NOT NULL,interests_json TEXT DEFAULT '[]',created_at TEXT);
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT);
 CREATE TABLE IF NOT EXISTS memberships(company_id TEXT,user_id TEXT,role TEXT,status TEXT,PRIMARY KEY(company_id,user_id));
 CREATE TABLE IF NOT EXISTS report_preferences(company_id TEXT PRIMARY KEY,enabled INTEGER DEFAULT 1,timezone TEXT DEFAULT 'Europe/Tirane',local_time TEXT DEFAULT '10:00');`);ensureReportSchema(db);return db;
}
function company(db,id,sector='healthcare',keywords=[]) {
 db.prepare('INSERT INTO companies(id,name,sector,interests_json,created_at) VALUES(?,?,?,?,?)').run(id,id+' company',sector,JSON.stringify(keywords),due.toISOString());
 db.prepare('INSERT INTO report_preferences(company_id) VALUES(?)').run(id);
}
function member(db,companyId,userId,status='active') {
 db.prepare('INSERT OR IGNORE INTO users(id,email) VALUES(?,?)').run(userId,userId+'@example.test');
 db.prepare('INSERT INTO memberships VALUES(?,?,?,?)').run(companyId,userId,'member',status);
}
const official=id=>'https://e-prokurimi.rks-gov.net/SPIN_PROD/application/ipn/DocumentManagement/DokumentPodaciFrm.aspx?id='+id;
function notice(id='100',extra={}) {return {notice_id:id,procedure_key:'2026/657-26-3468-2-1-1',title:'Laboratory reagents',buyer:'Public hospital',category_sq:'Laborator dhe diagnostikë',published_iso:'2026-10-21',evidence_classification:'tender_notice',deadline_displayed:'30.10.2026 12:00',deadline_timezone:'Europe/Tirane',source_url:official(id),fingerprint:'fingerprint-'+id,gaps:['Full dossier not downloaded.'],...extra};}
function feed(now=due,notices=[notice()]) {return {last_successful_check:new Date(now.getTime()-300000).toISOString(),run:{status:'ok'},source_url:official('list'),coverage_note:'Healthcare metadata only; ten publication dates.',notices};}
function ai(source,row=source.notices[0],extra={}) {return {status:'ready',generated_at:due.toISOString(),source_checked_at:source.last_successful_check,entries:[{notice_id:row.notice_id,fingerprint:row.fingerprint,context_fingerprints:Object.fromEntries(source.notices.map(r=>[r.notice_id,r.fingerprint])),why_match:'Verified source-profile interpretation',next_step:'Read the dossier',evidence_gaps:['Eligibility unknown'],...extra}]};}

test('report is available at local10:00, catches up later, and durable unique keys survive restart',()=>{
 const directory=mkdtempSync(join(tmpdir(),'humanplus-report-')),file=join(directory,'reports.sqlite');let db=database(file);
 try {
  company(db,'a');member(db,'a','u1');
  assert.equal(buildDailyReports(db,{now:at('2026-10-22T07:59:59Z'),feed:feed()}).length,0);
  const first=buildDailyReports(db,{now:due,feed:feed()})[0];assert.equal(first.report_date,'2026-10-22');assert.equal(first.status,'ready');
  assert.equal(runDeliveryTick(db,{now:due}).length,1);db.close();db=database(file);
  assert.equal(buildDailyReports(db,{now:at('2026-10-22T11:00:00Z'),feed:feed()})[0].id,first.id);
  assert.equal(runDeliveryTick(db,{now:at('2026-10-22T11:00:00Z')}).length,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM reports').get().n,1);assert.equal(db.prepare('SELECT count(*) AS n FROM notification_deliveries').get().n,1);
 } finally {db.close();rmSync(directory,{recursive:true,force:true});}
});

test('Kosovo10:00 follows Europe/Tirane DST on October24 and25 without duplicate reports',()=>{
 const db=database();try {company(db,'a');member(db,'a','u');
 for(const [day,utcHour] of [['24','08'],['25','09']]) {
  const now=at(`2026-10-${day}T${utcHour}:00:00Z`),before=new Date(now.getTime()-1000);
  assert.equal(buildDailyReports(db,{now:before,feed:feed(before)}).length,0);
  const rs=buildDailyReports(db,{now,feed:feed(now)});assert.equal(rs.length,1);assert.equal(rs[0].report_date,`2026-10-${day}`);assert.equal(runDeliveryTick(db,{now}).length,1);
  assert.equal(runDeliveryTick(db,{now:new Date(now.getTime()+3600000)}).length,0);
 }
 assert.equal(listReports(db,'a').length,2);
 } finally {db.close();}
});

test('stale, failed, future, invalid, previous-local-day and duplicate feeds produce explicit outage',()=>{
 const cases=[{...feed(),last_successful_check:'2026-10-22T01:59:59Z'}, {...feed(),run:{status:'partial'}}, {...feed(),last_successful_check:'2026-10-22T08:01:00Z'}, {...feed(),last_successful_check:'invalid'}, {...feed(),last_successful_check:'2026-10-21T21:59:59Z'}, {...feed(),notices:[notice(),notice()]}];
 for(const source of cases) {const db=database();try {company(db,'a');const r=buildDailyReports(db,{now:due,feed:source})[0];assert.equal(r.status,'source_unavailable');assert.equal(r.counts.actionable,null);assert.equal(r.opportunities.length,0);assert.match(r.summary,/unavailable/);}finally{db.close();}}
 const db=database();try{company(db,'a');assert.equal(buildDailyReports(db,{now:due,feed:{...feed(),last_successful_check:'2026-10-22T02:00:00Z'}})[0].status,'ready');}finally{db.close();}
});

test('same-day outage recovers in place without duplicate delivery; ready report is immutable for the day',()=>{
 const db=database();try{company(db,'a');member(db,'a','u');
 const outage=buildDailyReports(db,{now:due,feed:{...feed(),run:{status:'failed'}}})[0];assert.equal(runDeliveryTick(db,{now:due}).length,1);
 const later=new Date(due.getTime()+600000),recovered=buildDailyReports(db,{now:later,feed:feed(later)})[0];
 assert.equal(recovered.id,outage.id);assert.equal(recovered.revision,2);assert.equal(recovered.generated_at,outage.generated_at);assert.equal(recovered.updated_at,later.toISOString());assert.equal(recovered.status,'ready');assert.equal(runDeliveryTick(db,{now:later}).length,0);
 assert.equal(buildDailyReports(db,{now:later,feed:{...feed(later),notices:[]}})[0].revision,2);assert.equal(listReports(db,'a')[0].opportunities.length,1);
 }finally{db.close();}
});

test('company interests isolate matching and healthcare feed never claims coverage of another sector',()=>{
 const db=database();try{company(db,'lab','healthcare',['laboratory','unmatched']);company(db,'dental','healthcare',['dental']);company(db,'construction','construction',['laboratory']);company(db,'pharma','pharmaceuticals');
 const reports=buildDailyReports(db,{now:due,feed:feed()});const byId=Object.fromEntries(reports.map(r=>[r.company_id,r]));
 assert.equal(byId.lab.counts.actionable,1);assert.equal(byId.dental.status,'no_matches');assert.equal(byId.pharma.status,'no_matches');assert.equal(byId.construction.status,'insufficient_coverage');assert.equal(byId.construction.counts.actionable,null);
 assert.equal(listReports(db,'lab').length,1);assert.equal(listReports(db,'lab')[0].company_id,'lab');assert.deepEqual(listReports(db,"lab' OR 1=1 --"),[]);
 }finally{db.close();}
});

test('inbox delivery targets active company members, respects disabled preferences, and rejects cross-tenant FKs',()=>{
 const db=database();try{company(db,'a');company(db,'b');member(db,'a','active');member(db,'a','revoked','revoked');member(db,'b','other');
 const reports=buildDailyReports(db,{now:due,feed:feed()});db.prepare("UPDATE memberships SET status='revoked' WHERE user_id='active'").run();
 let delivered=runDeliveryTick(db,{now:due});assert.deepEqual(delivered.map(r=>r.user_id),['other']);
 db.prepare("UPDATE memberships SET status='active' WHERE user_id='active'").run();db.prepare("UPDATE report_preferences SET enabled=0 WHERE company_id='a'").run();assert.equal(runDeliveryTick(db,{now:due}).length,0);
 db.prepare("UPDATE report_preferences SET enabled=1 WHERE company_id='a'").run();assert.equal(runDeliveryTick(db,{now:due}).length,1);
 const a=reports.find(r=>r.company_id==='a');assert.throws(()=>db.prepare("INSERT INTO notification_deliveries(id,company_id,user_id,report_id,channel,status,created_at,delivered_at) VALUES('wrong','b','other',?,'in_app','delivered','now','now')").run(a.id),/FOREIGN KEY/);
 // API's active membership join removes historical deliveries after revocation.
 db.prepare("UPDATE memberships SET status='revoked' WHERE user_id='active'").run();assert.equal(db.prepare("SELECT d.id FROM notification_deliveries d JOIN memberships m ON m.company_id=d.company_id AND m.user_id=d.user_id AND m.status='active' WHERE d.user_id='active'").all().length,0);
 }finally{db.close();}
});

test('later closing notices suppress candidates despite keyword filters and corrections supply latest deadline',()=>{
 const db=database();try{company(db,'a','healthcare',['laboratory']);
 const closed=notice('101',{title:'Award without interest keyword',published_iso:'2026-10-22',evidence_classification:'award_notice'});
 const other=notice('200',{procedure_key:'2026/657-26-7777-1-2-1',deadline_displayed:'31.10.2026 12:00'}),correction=notice('201',{procedure_key:other.procedure_key,title:'Correction',published_iso:'2026-10-22',evidence_classification:'correction_notice',deadline_displayed:'29.10.2026 14:00'});
 const r=buildDailyReports(db,{now:due,feed:feed(due,[notice(),closed,other,correction])})[0];assert.equal(r.opportunities.length,1);assert.equal(r.opportunities[0].notice_id,'200');assert.equal(r.opportunities[0].deadline_date,'2026-10-29');assert.equal(r.opportunities[0].deadline_source_url,official('201'));assert.equal(r.opportunities[0].requirements,null);assert(r.opportunities[0].evidence_gaps.length);
 }finally{db.close();}
});

test('expired, impossible dates and missing/unsafe links never enter actionable list; unknowns remain explicit',()=>{
 const db=database();try{company(db,'a');
 const sources=[notice('1',{deadline_displayed:'22.10.2026 09:59'}),notice('2',{procedure_key:'',deadline_displayed:'31.02.2027 10:00'}),notice('3',{procedure_key:'',source_url:'javascript:alert(1)'}),notice('4',{procedure_key:'',deadline_displayed:'29.10.2026',deadline_timezone:null})];
 const r=buildDailyReports(db,{now:due,feed:feed(due,sources)})[0];assert.equal(r.opportunities.length,1);const row=r.opportunities[0];assert.equal(row.notice_id,'4');assert.equal(row.deadline_timezone,null);assert.equal(row.deadline_time,null);assert.match(row.evidence_gaps.join(' '),/timezone is unspecified/);assert.equal(r.counts.requires_status_review,2);
 }finally{db.close();}
});

test('AI requires source check plus exact tender and complete related-context fingerprints',()=>{
 const source=feed(),valid=ai(source);
 const variants=[valid,{...valid,source_checked_at:'2026-10-21T08:00:00Z'},ai(source,source.notices[0],{fingerprint:'stale'}),ai(source,source.notices[0],{context_fingerprints:{}}),ai(source,source.notices[0],{context_fingerprints:null}),{...valid,entries:{malformed:true}}];
 variants.forEach((aiReport,i)=>{const db=database();try{company(db,'a');const r=buildDailyReports(db,{now:due,feed:source,aiReport})[0];assert.equal(Boolean(r.opportunities[0].ai_interpretation),i===0);}finally{db.close();}});
 const db=database();try{company(db,'a');const correction=notice('101',{published_iso:'2026-10-22',evidence_classification:'correction_notice'});const changed=feed(due,[notice(),correction]);const r=buildDailyReports(db,{now:due,feed:changed,aiReport:valid})[0];assert.equal(r.opportunities[0].ai_interpretation,null);}finally{db.close();}
});

test('real feed unknown-timezone sentinel and string evidence gaps preserve a candidate with explicit limitations',()=>{
 const db=database();try{company(db,'a');
 const source=feed(due,[notice('100',{deadline_displayed:'22.10.2026 12:00',deadline_timezone:'Not stated on portal metadata; verify in tender dossier',gaps:'Tender dossier requires authentication; requirements were not extracted.'})]);
 const report=buildDailyReports(db,{now:due,feed:source})[0];
 assert.equal(report.status,'ready');assert.equal(report.counts.requires_status_review,0);assert.equal(report.opportunities.length,1);
 const candidate=report.opportunities[0];assert.equal(candidate.deadline_timezone,null);assert.equal(candidate.status,'open_candidate_verify_dossier');
 assert(candidate.evidence_gaps.includes('Tender dossier requires authentication; requirements were not extracted.'));
 assert(candidate.evidence_gaps.some(g=>g.includes('timezone is unspecified')&&g.includes('assumes Europe/Tirane')));
 assert.equal(candidate.requirements,null);
 }finally{db.close();}
});

test('disabled or invalid schedules do not silently deliver at another time; catch-up remains same local day',()=>{
 const db=database();try{company(db,'disabled');company(db,'invalid');company(db,'a');member(db,'a','u');
 db.prepare("UPDATE report_preferences SET enabled=0 WHERE company_id='disabled'").run();db.prepare("UPDATE report_preferences SET timezone='Not/AZone' WHERE company_id='invalid'").run();
 assert.equal(buildDailyReports(db,{now:due,feed:feed()}).length,1);assert.equal(runDeliveryTick(db,{now:at('2026-10-23T08:00:00Z')}).length,0);
 assert.throws(()=>buildDailyReports(db,{now:new Date('invalid'),feed:feed()}),/Invalid report clock/);
 }finally{db.close();}
});

test('AI arriving after daily delivery enriches the stable report once without duplicate inbox delivery',()=>{
 const db=database();try{company(db,'a');member(db,'a','u');const source=feed();
 const original=buildDailyReports(db,{now:due,feed:source})[0],delivery=runDeliveryTick(db,{now:due})[0];
 assert.equal(original.ai_status,'pending');assert.equal(original.ai_verified_count,0);assert.equal(original.opportunities[0].ai_interpretation,null);
 const later=at('2026-10-22T08:03:00Z'),analysis={...ai(source),generated_at:later.toISOString()};
 const enriched=buildDailyReports(db,{now:later,feed:source,aiReport:analysis})[0];
 assert.equal(enriched.id,original.id);assert.equal(enriched.generated_at,original.generated_at);assert.equal(enriched.updated_at,later.toISOString());assert.equal(enriched.revision,2);
 assert.equal(enriched.ai_status,'verified');assert.equal(enriched.ai_verified_count,1);assert.equal(enriched.ai_generated_at,analysis.generated_at);assert.equal(enriched.opportunities[0].ai_interpretation.why_match,'Verified source-profile interpretation');
 assert(enriched.opportunities[0].evidence_gaps.includes('Eligibility unknown'));assert.deepEqual(enriched.counts,original.counts);assert.equal(enriched.summary,original.summary);
 assert.equal(runDeliveryTick(db,{now:later}).length,0);assert.equal(db.prepare('SELECT id FROM notification_deliveries').get().id,delivery.id);
 const again=buildDailyReports(db,{now:at('2026-10-22T08:04:00Z'),feed:source,aiReport:{...analysis,generated_at:'2026-10-22T08:04:00Z'}})[0];
 assert.equal(again.revision,2);assert.equal(again.updated_at,later.toISOString());assert.equal(again.ai_generated_at,analysis.generated_at);
 }finally{db.close();}
});

test('same-day enrichment rejects stale, changed-source and mismatched-context AI and does not revise older days',()=>{
 const db=database();try{company(db,'a');const source=feed(),original=buildDailyReports(db,{now:due,feed:source})[0],later=at('2026-10-22T08:03:00Z');
 const cases=[
  {feed:source,aiReport:{...ai(source),source_checked_at:'2026-10-21T08:00:00Z'}},
  {feed:feed(later),aiReport:ai(feed(later))},
  {feed:source,aiReport:ai(source,source.notices[0],{fingerprint:'stale'})},
  {feed:source,aiReport:ai(source,source.notices[0],{context_fingerprints:{}})},
  {feed:{...source,run:{status:'partial'}},aiReport:ai(source)},
  {feed:source,aiReport:ai(source),now:at('2026-10-22T14:00:01Z')},
 ];
 for(const input of cases){const unchanged=buildDailyReports(db,{now:later,...input})[0];assert.equal(unchanged.revision,1);assert.equal(unchanged.opportunities[0].ai_interpretation,null);}
 const tomorrow=at('2026-10-23T08:00:00Z');buildDailyReports(db,{now:tomorrow,feed:feed(tomorrow),aiReport:ai(source)});
 const old=listReports(db,'a').find(r=>r.id===original.id);assert.equal(old.revision,1);assert.equal(old.updated_at,original.updated_at);assert.equal(old.opportunities[0].ai_interpretation,null);
 }finally{db.close();}
});

test('partial AI enrichment adds only newly verified existing candidates; no-match reports never gain rows',()=>{
 const db=database();try{company(db,'a');company(db,'none','healthcare',['dental']);
 const one=notice('100'),two=notice('200',{procedure_key:'2026/657-26-7777-1-2-1'}),source=feed(due,[one,two]);
 const firstAI=ai(source,one,{context_fingerprints:{100:one.fingerprint}}),initial=buildDailyReports(db,{now:due,feed:source,aiReport:firstAI});
 assert.equal(initial.find(r=>r.company_id==='a').ai_verified_count,1);assert.equal(initial.find(r=>r.company_id==='none').status,'no_matches');
 const extra=ai(source,two,{context_fingerprints:{200:two.fingerprint}}).entries[0],later=at('2026-10-22T08:03:00Z'),fullAI={...firstAI,generated_at:later.toISOString(),entries:[{...firstAI.entries[0],why_match:'Changed text must not overwrite an existing verified interpretation'},extra]};
 const enriched=buildDailyReports(db,{now:later,feed:source,aiReport:fullAI});
 const a=enriched.find(r=>r.company_id==='a');assert.equal(a.revision,2);assert.equal(a.ai_verified_count,2);assert.equal(a.opportunities.find(r=>r.notice_id==='100').ai_interpretation.why_match,'Verified source-profile interpretation');
 const none=enriched.find(r=>r.company_id==='none');assert.equal(none.revision,1);assert.deepEqual(none.opportunities,[]);assert.equal(none.status,'no_matches');
 assert.equal(buildDailyReports(db,{now:later,feed:source,aiReport:fullAI}).find(r=>r.company_id==='a').revision,2);
 }finally{db.close();}
});
