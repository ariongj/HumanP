import test from 'node:test';import assert from 'node:assert/strict';
import {createEntityScope,emptyEntitySelection} from '../lib/entity-scope';
import {buildReport,reportHTML} from '../lib/reports';
import {filterMarket,csv} from '../lib/domain';
const procedure='220-70001-0731-24-1234-1-2-1';
const data={products:{records:[{id:'p',brand:'Roche',supplier:'Supplier A',procurement_id:procedure,year:2024},{id:'q',brand:'Other',supplier:'Supplier B',procurement_id:procedure},{id:'no-procedure',brand:'Roche'}]},market:{records:[{row_key:'a',reference:procedure,supplier:'Supplier A',buyer:'Hospital',category:'Lab',year:'2024'},{row_key:'b',reference:procedure,supplier:'Supplier B',buyer:'Hospital',category:'Lab',year:'2024'},{row_key:'collision',reference:'220-70020-0731-24-1234-1-2-1',supplier:'Supplier A',buyer:'Elsewhere',category:'Lab',year:'2024'},{row_key:'consortium',supplier:'Supplier A + Supplier B'}],nationalRecords2024:[{row_key:'n',reference:procedure,supplier:'Supplier A'}],brandMentions2024:[{reference:procedure,brand_or_model_as_published:'Model X | Roche',supplier:'Supplier A'}]},medical:{notices:[{notice_id:'notice',procurement_code:'2024/'+procedure+'/B08-55',source_document:'documents/source.pdf'}],products:[{brand_explicit:'Roche',procurement_code:procedure}],requirements:[{notice_id:'notice',procurement_code:procedure}]}};
test('brand scope joins full procedures across populations and medical evidence without inferring other product brands',()=>{
 const scope=createEntityScope(data,{brand:'Roche',suppliers:[]});
 assert.deepEqual(scope.filterDataset('products',data.products).records.map((r:any)=>r.id),['p','no-procedure']);
 assert.deepEqual(scope.filterDataset('market',data.market).records.map((r:any)=>r.row_key),['a','b']);
 assert.equal(scope.filterDataset('market',data.market).nationalRecords2024.length,1);
 assert.equal(scope.filterDataset('medical',data.medical).notices.length,1);
 assert.equal(scope.filterDataset('medical',data.medical).requirements.length,1);
 assert.equal(scope.filterDataset('documents',{records:[{path:'documents/source.pdf'},{path:'documents/unrelated.pdf'}]}).records.length,1);
 assert.equal(scope.filterDataset('budget',{central_budget:[{organization:'Hospital',total:50},{organization:'Other',total:100}]}).central_budget.length,1);
});
test('supplier-only and brand AND supplier scope retain exact names and never allocate consortium records',()=>{
 const supplier=createEntityScope(data,{brand:'',suppliers:['supplier a']});
 assert.deepEqual(supplier.filterDataset('market',data.market).records.map((r:any)=>r.row_key),['a','collision']);
 assert.deepEqual(supplier.filterDataset('products',data.products).records.map((r:any)=>r.id),['p']);
 const both=createEntityScope(data,{brand:'Roche',suppliers:['Supplier A']});
 assert.deepEqual(both.filterDataset('market',data.market).records.map((r:any)=>r.row_key),['a']);
 assert.deepEqual(both.filterDataset('products',data.products).records.map((r:any)=>r.id),['p']);
 assert.equal(both.filterDataset('medical',data.medical).requirements.length,1);
 assert.equal(createEntityScope(data,{brand:'Roche',suppliers:['Unknown']}).filterDataset('market',data.market).records.length,0);
});
test('scope preserves source data, alternatives and missing relationships; reset restores all original rows',()=>{
 const scoped=createEntityScope(data,{brand:'Unknown',suppliers:[]});assert.equal(scoped.filterDataset('products',data.products).records.length,0);
 assert.equal(scoped.filterDataset('medicines',{records:[{manufacturer:'Roche'}]}).records.length,0);
 assert.equal(createEntityScope(data,emptyEntitySelection).filterDataset('market',data.market),data.market);
 assert.equal(data.market.records.length,4);assert.equal(data.products.records.length,3);
 assert.equal(createEntityScope(data,{brand:'Model X',suppliers:[]}).filterDataset('products',data.products).records.length,0);
});
test('charts, report rows, HTML/JSON metadata and CSV share the same global/local intersection',()=>{
 const selection={brand:'Roche',suppliers:['Supplier A']},scope=createEntityScope(data,selection),market=scope.filterDataset('market',data.market);
 const report=buildReport('market',{market},'2024','','',{entities:selection});
 assert.equal(report.sections[0].rows.length,1);assert.equal(report.sections[0].chart[0].value,1);assert.deepEqual(report.filters.entities,selection);
 assert.match(reportHTML(report),/Marka në panel: Roche/);assert.match(reportHTML(report),/Operatori në panel: Supplier A/);
 const exported=csv(filterMarket(market.records,{year:'2024'}),['row_key','supplier']);assert.match(exported,/Supplier A/);assert.doesNotMatch(exported,/Supplier B|collision|consortium/);
 assert.equal(buildReport('market',{market},'2025','','',{entities:selection}).sections[0].rows.length,0);
});

test('year and categories intersect across source taxonomies without equating category labels',()=>{
 const source={products:{records:[{id:'p1',brand:'Roche',year:2024,category:'Immunology',procurement_id:procedure},{id:'p2',brand:'Roche',year:2024,category:'Chemistry',procurement_id:procedure},{id:'p3',brand:'Roche',year:2025,category:'Immunology',procurement_id:procedure}]},market:{records:[{row_key:'a',year:'2024',category:'Equipment',reference:procedure},{row_key:'b',year:'2024',category:'Services',reference:procedure},{row_key:'c',year:'2025',category:'Equipment',reference:procedure}]} };
 const fromProduct=createEntityScope(source,{brand:'Roche',suppliers:[],year:'2024',categories:['Immunology']});
 assert.deepEqual(fromProduct.filterDataset('products',source.products).records.map((r:any)=>r.id),['p1']);
 assert.deepEqual(fromProduct.filterDataset('market',source.market).records.map((r:any)=>r.row_key),['a','b']);
 const fromMarket=createEntityScope(source,{brand:'',suppliers:[],year:'2024',categories:['Equipment']});
 assert.deepEqual(fromMarket.filterDataset('market',source.market).records.map((r:any)=>r.row_key),['a']);
 assert.deepEqual(fromMarket.filterDataset('products',source.products).records.map((r:any)=>r.id),['p1','p2']);
 const multiple=createEntityScope(source,{brand:'',suppliers:[],year:'2024',categories:['Immunology','Chemistry']});assert.equal(multiple.filterDataset('products',source.products).records.length,2);
});
test('unknown years stay unknown and registry snapshot years never stand in for product award years',()=>{
 const products={records:[{brand:'A',year:null,source_checked_at:'2026-10-18'},{brand:'A',year:2024}]};
 const source={products};assert.equal(createEntityScope(source,{brand:'',suppliers:[],year:'2026'}).filterDataset('products',products).records.length,0);
 assert.equal(createEntityScope(source,{brand:'',suppliers:[],year:'unknown'}).filterDataset('products',products).records.length,1);
 const s=createEntityScope(source,{brand:'',suppliers:[],year:'2026'});
 assert.equal(s.filterDataset('medicines',{records:[{retrieved_date:'18.10.2026'},{retrieved_date:'2024-10-18'}]}).records.length,1);
 assert.equal(s.filterDataset('wholesalers',{records:[{snapshot_date:'2026-10-15',expiry_date:'2027-01-01'}]}).records.length,1);
});
test('year-only budget scope retains every basis and links documents by evidence year, not packaging date',()=>{
 const budget={central_budget:[{year:'2024',organization:'A',total:50,source_document:'documents/2024.pdf'},{year:'2025',organization:'A',total:60}],supplement:{health_actual_share:[{year:2024,health_cash_eur:40},{year:2025,health_cash_eur:45}],prishtina_project_cash:[{year:'2024'}]}};
 const scope=createEntityScope({budget},{brand:'',suppliers:[],year:'2024'}),filtered=scope.filterDataset('budget',budget);
 assert.equal(filtered.central_budget.length,1);assert.equal(filtered.supplement.health_actual_share.length,1);assert.equal(filtered.supplement.prishtina_project_cash.length,1);
 assert.equal(scope.filterDataset('documents',{records:[{path:'documents/2024.pdf',date:'2026-10-18'},{path:'documents/unrelated.pdf',date:'2024'}]}).records.length,1);
});
test('medical year and category scope reaches evidence without its own category via the full procedure',()=>{
 const source={medical:{notices:[{notice_id:'n',year:2026,category_sq:'Medical lab',procurement_code:procedure}],requirements:[{notice_id:'n',procurement_code:procedure}],lots:[{notice_id:'n',year:2026,procurement_code:procedure}]} };
 const scope=createEntityScope(source,{brand:'',suppliers:[],year:'2026',categories:['Medical lab']});
 assert.equal(scope.filterDataset('medical',source.medical).requirements.length,1);assert.equal(scope.filterDataset('medical',source.medical).lots.length,1);
 assert.equal(createEntityScope(source,{brand:'',suppliers:[],year:'2024',categories:['Medical lab']}).filterDataset('medical',source.medical).requirements.length,0);
});
test('report exports record all four shared dimensions and all-year budgets avoid combined-year totals',()=>{
 const entities={brand:'Roche',suppliers:['Supplier A'],year:'2024',categories:['Lab']};
 const report=buildReport('market',{market:{records:[{year:'2024',category:'Lab'}]}},'2024','','',{entities});
 assert.deepEqual(report.filters.entities,entities);assert.match(reportHTML(report),/Viti në panel: 2024/);assert.match(reportHTML(report),/Kategoria në panel: Lab/);
 const budget=buildReport('budget',{budget:{central_budget:[{year:'2024',organization:'A',total:5},{year:'2025',organization:'A',total:7}]}},'');
 assert.equal(budget.sections[0].rows.length,2);assert.equal(budget.sections[0].total,null);assert.deepEqual(budget.sections[0].chart.map(r=>r.label),['A · 2025','A · 2024']);
});
