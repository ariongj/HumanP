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
