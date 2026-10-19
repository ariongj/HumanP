import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeMonitoredNotices,monitorFreshness,noticeState} from '../lib/procurement-monitor';
import {createEntityScope} from '../lib/entity-scope';
import {buildReport,reportHTML} from '../lib/reports';
const notice={notice_id:'1',year:2026,title:'Equipment',published_iso:'2026-10-19',deadline_displayed:'12.11.2026 13:00',procedure_key:'2026/220/70100-26-1234-1-1-1',evidence_classification:'tender_notice',category_sq:'Equipment'};
test('live updates merge by notice ID, preserve archived evidence, and join shared scope',()=>{
 const archived={...notice,deadline_displayed:'01.11.2026 13:00',category_sq:'Lab',supplier:'Verified supplier'};
 const data={notices:[archived],lots:[{notice_id:'1'}]};const before=JSON.stringify(data);
 const merged=mergeMonitoredNotices(data,[{...notice,supplier:null},{...notice,notice_id:'2',category_sq:'Medicines'}]);
 assert.equal(merged.notices.length,2);assert.equal(merged.notices[0].category_sq,'Lab');assert.equal(merged.notices[0].supplier,'Verified supplier');
 assert.equal(merged.notices[0].deadline_displayed,notice.deadline_displayed);assert.deepEqual(merged.notices[0].archived_snapshot_notice,archived);assert.equal(JSON.stringify(data),before);
 const scope=createEntityScope({medical:merged},{year:'2026',categories:['Lab'],brand:'',suppliers:[]});
 assert.equal(scope.filterDataset('medical',merged).notices.length,1);
 assert.equal(createEntityScope({medical:merged},{year:'2024',brand:'',suppliers:[]}).filterDataset('medical',merged).notices.length,0);
});
test('closing notices override a future deadline and authority prefixes cannot cross-link',()=>{
 assert.equal(noticeState(notice,[notice],'2026-10-19'),'Afat i ardhshëm · verifiko');
 const cancelled={...notice,notice_id:'2',published_iso:'2026-10-20',evidence_classification:'cancellation_notice'};
 assert.equal(noticeState(notice,[notice,cancelled],'2026-10-19'),'Anulim · verifiko lotet');
 assert.equal(noticeState(notice,[notice,{...cancelled,procedure_key:'2026/999/70100-26-1234-1-1-1'}],'2026-10-19'),'Afat i ardhshëm · verifiko');
 assert.equal(noticeState(notice,[notice],'2026-11-13'),'Afat i kaluar');
 assert.equal(noticeState({...notice,deadline_displayed:null},[{...notice,deadline_displayed:null}],'2026-10-19'),'Status për verifikim');
 assert.equal(monitorFreshness(null),'Pa kontroll të plotë');assert.equal(monitorFreshness('2026-10-17T10:00:00Z',Date.parse('2026-10-19T10:00:00Z')),'Kontrolli është vonuar');
});
test('medical report includes monitored notices and source timestamps without summing unknown values',()=>{
 const row={...notice,last_checked_at:'2026-10-19T18:00:00Z',estimated_value_displayed:'725,000.00',estimated_value_currency:null,match_reasons:['FPP/CPV: 33000000'],source_url:'https://e-prokurimi.rks-gov.net/example'};
 const report=buildReport('medical',{medical:{notices:[row]}},'2026','', '',{entities:{year:'2026',brand:'',suppliers:[],categories:['Equipment']}});
 assert.equal(report.sections[0].rows.length,1);assert.equal(report.sections[0].chart[0].value,1);assert(!('total' in report.sections[0]));
 assert(report.sourceDate.includes(row.last_checked_at));assert(reportHTML(report).includes(row.source_url));
 assert.equal(buildReport('medical',{medical:{notices:[row]}},'2024').sections[0].rows.length,0);
});
test('medical supplements with only notice IDs inherit the notice scope without admitting unrelated gaps',()=>{
 const medical={notices:[notice,{...notice,notice_id:'2',category_sq:'Medicines',procedure_key:'2026/999/70100-26-1234-1-1-1'}],statusUpdates:[{notice_id:'1',affected_lot:'II'},{notice_id:'2',affected_lot:'I'}],downloadGaps:[{notice_id:'1',status:'login_required'},{notice_id:'missing',status:'unknown'}]};
 const scope=createEntityScope({medical},{year:'2026',categories:['Equipment'],brand:'',suppliers:[]});
 assert.deepEqual(scope.filterDataset('medical',medical).statusUpdates,[medical.statusUpdates[0]]);
 assert.deepEqual(scope.filterDataset('medical',medical).downloadGaps,[medical.downloadGaps[0]]);
});
