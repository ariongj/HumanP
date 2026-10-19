import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBriefings,dayDistance,briefingExport,briefingHTML,currentAIEntry} from '../lib/agent-briefing';
const tender={notice_id:'1',title:'Laboratory',buyer:'Hospital',category_sq:'Lab',procedure_key:'2026/220-26-1234-1-1-1',published_iso:'2026-10-19',deadline_displayed:'25.10.2026 13:00',evidence_classification:'tender_notice',match_reasons:['CPV 33'],fingerprint:'one'};
test('briefing groups exact procedures, inherits corrected deadlines and links requirements by notice ID',()=>{
 const correction={...tender,notice_id:'2',published_iso:'2026-10-20',deadline_displayed:'02.11.2026 10:00',evidence_classification:'correction_notice'};
 const other={...tender,notice_id:'3',procedure_key:'2026/999/220-26-1234-1-1-1'};
 const requirement={notice_id:'1',requirement_as_published:'Source requirement'},foreign={notice_id:'3',requirement_as_published:'Other authority'};
 const brief=buildBriefings([tender,correction,other],[tender,correction,other],{requirements:[requirement,foreign]},'2026-10-19');
 assert.equal(brief.length,2);const item=brief.find(b=>b.row.notice_id==='1')!;
 assert.equal(item.deadline,'2026-11-02');assert.equal(item.daysLeft,14);assert.equal(item.urgent,false);assert.equal(item.open,true);assert.deepEqual(item.requirements,[requirement]);
 assert.equal(item.deadlineSource?.notice_id,'2');assert.equal(brief[0].row.notice_id,'3');
});
test('briefing never reopens a procedure when filters hide its cancellation and unknown deadlines stay unknown',()=>{
 const cancel={...tender,notice_id:'2',published_iso:'2026-10-21',evidence_classification:'cancellation_notice'};
 const [closed]=buildBriefings([tender],[tender,cancel],{},'2026-10-19');
 assert.equal(closed.open,false);assert.equal(closed.urgent,false);assert(closed.state.includes('verifiko lotet'));
 const unknown={...tender,deadline_displayed:'31.02.2026'};
 assert.equal(buildBriefings([unknown],[unknown],{},'2026-02-01')[0].open,false);
 assert.equal(dayDistance('2026-10-19','2026-10-19'),0);assert.equal(dayDistance('','2026-10-19'),null);
 assert.deepEqual(buildBriefings([],[],{},'2026-10-19'),[]);
});
test('report export includes every selected procedure and source requirements without HTML injection',()=>{
 const row={...tender,title:'<script>alert(1)</script>',source_url:'javascript:alert(1)'};
 const req={notice_id:'1',requirement_category:'License',requirement_as_published:'Published terms',evidence_requested:'Source certificate',source_url:'https://e-prokurimi.rks-gov.net/source'};
 const briefs=buildBriefings([row],[row],{requirements:[req]},'2026-10-19');
 const report=briefingExport(briefs,{date:'2026-10-19',ai_status:'not_configured',filters:{year:'2026'}});
 assert.deepEqual(report.procedures[0].requirements,[req]);assert.equal(report.procedures.length,1);
 const html=briefingHTML(report);assert(!html.includes('<script>'));assert(!html.includes('href="javascript:'));assert(html.includes('Source certificate'));assert(html.includes('not_configured'));
});
test('AI text stays hidden when disabled or when its source fingerprint changed',()=>{
 const entry={notice_id:'1',fingerprint:'one',why_match:'Example'};
 assert.equal(currentAIEntry({status:'not_configured',entries:[entry]},tender),null);
 assert.equal(currentAIEntry({status:'ready',entries:[entry]},{...tender,fingerprint:'two'}),null);
 assert.deepEqual(currentAIEntry({status:'ready',entries:[entry]},tender),entry);
 const contextual={...entry,context_fingerprints:{'1':'one'}};
 assert.deepEqual(currentAIEntry({status:'ready',entries:[contextual]},tender,[tender]),contextual);
 assert.equal(currentAIEntry({status:'ready',entries:[contextual]},tender,[tender,{...tender,notice_id:'2',fingerprint:'correction'}]),null);
});
