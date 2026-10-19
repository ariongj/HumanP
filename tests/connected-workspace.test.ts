import test from 'node:test';import assert from 'node:assert/strict';
import {filterColumns,parseColumnFilters} from '../lib/column-filters';
import {tableLayout,moveColumn} from '../lib/table-layout';
import {connectedRecords,procedureKey} from '../lib/record-links';
import {filterMarket} from '../lib/domain';
import {buildReport} from '../lib/reports';
test('column filters intersect, preserve zero, distinguish missing and reject malformed numeric comparisons',()=>{
 const rows=[{buyer:'A',amount:0,year:2024},{buyer:'AB',amount:10,year:'2024'},{buyer:'A',amount:null,year:2025}];
 assert.equal(filterColumns(rows,{buyer:{op:'equals',value:'a'},amount:{op:'gte',value:'0'}}).length,1);
 assert.equal(filterColumns(rows,{amount:{op:'missing',value:''}}).length,1);assert.equal(filterColumns(rows,{amount:{op:'present',value:''}}).length,2);
 assert.equal(filterColumns(rows,{year:{op:'equals',value:'2024'},amount:{op:'lte',value:'5'}})[0].amount,0);
 assert.equal(filterColumns(rows,{amount:{op:'gte',value:'oops'}}).length,0);assert.equal(filterColumns(rows,parseColumnFilters('{bad')).length,0);
 assert.equal(parseColumnFilters('{"x":{"op":"bogus","value":"x"}}'),null);assert.equal(filterColumns(rows,{}),rows);
});
test('market, report chart, source rows and serialized export filters describe the same population',()=>{
 const records=[{row_key:'a',buyer:'A',category:'Lab',year:'2024',reported_value:'5'},{row_key:'b',buyer:'B',category:'Lab',year:'2024',reported_value:'20'},{row_key:'c',buyer:'B',category:'Other',year:'2025',reported_value:'30'}];
 const columns={reported_value:{op:'gte' as const,value:'10'}},filters={year:'2024',columns:JSON.stringify(columns)};
 assert.deepEqual(filterMarket(records,filters).map(r=>r.row_key),['b']);
 const report=buildReport('market',{market:{records}},'2024','','',{columnFilters:{market:columns}});
 assert.deepEqual(report.sections[0].rows.map(r=>r.row_key),['b']);assert.equal(report.sections[0].chart[0].value,1);
 assert.equal(buildReport('market',{market:{records}},'2024','','',{market:{buyer:'A'}}).sections[0].rows[0].row_key,'a');
});
test('table layout rejects corrupt persisted settings, adapts to schema changes and keeps one visible column',()=>{
 const layout=tableLayout({order:['old','b','b'],hidden:['a','b'],widths:{a:5,b:240,old:300},sort:{key:'old'},group:'old'},['a','b']);
 assert.deepEqual(layout.order,['b','a']);assert.equal(layout.hidden.length,1);assert.deepEqual(layout.widths,{b:240});assert.equal(layout.sort.key,'');assert.equal(layout.group,'');
 assert.deepEqual(moveColumn(['a','b'],'b',-1),['b','a']);assert.deepEqual(moveColumn(['a','b'],'a',-1),['a','b']);
 assert.deepEqual(tableLayout(null,['a','b','c'],['b']).hidden,['a','c']);
});
test('connections use procedure identifiers, keep award rows unique across populations, and never infer a manufacturer',()=>{
 const row={brand:'Known',model:'AU480',procurement_id:'220-70001-0731-24-1234-1-2-1'};
 assert.equal(procedureKey(row),row.procurement_id);assert.equal(procedureKey({procurement_code:'2024/'+row.procurement_id+'/B08-10'}),procedureKey(row));assert.equal(procedureKey({title:'0731-24-1234-1-2-1'}),'');
 const award={row_key:'a',reference:row.procurement_id};
 const groups=connectedRecords(row,{market:{records:[award],nationalRecords2024:[award,{row_key:'b',reference:award.reference}],brandMentions2024:[{reference:award.reference,brand_or_model_as_published:'AU480'}]},products:{records:[row,{brand:'Other',model:'AU480'}]},medical:{notices:[{notice_id:'n',procedure_key:'2024/'+award.reference}],lots:[]}});
 assert.equal(groups.find(g=>g.id==='procedure')?.rows.length,2);assert.equal(groups.find(g=>g.id==='products')?.rows.length,1);assert.equal(groups.find(g=>g.id==='mentions')?.rows.length,1);assert.equal(groups.find(g=>g.id==='medical-notices')?.rows.length,1);
 assert.equal(connectedRecords({model:'AU480'},{products:{records:[row]}}).length,0);
 assert.equal(connectedRecords(row,{market:{records:[{row_key:'different-authority',reference:'220-70020-0731-24-1234-1-2-1'}]}}).length,0);
});
test('entity and source-document links are explicit, preserve consortium names and separate budget bases',()=>{
 const row={buyer:'Hospital A',supplier:'A + B',source_document:'documents/source.pdf'};
 const groups=connectedRecords(row,{market:{records:[{buyer:'Hospital A',supplier:'A',row_key:'a'},{buyer:'Hospital B',supplier:'A + B',row_key:'b'}]},budget:{central_budget:[{organization:'Hospital A',total:100}],execution_2023:[{organization:'Hospital A',row_type:'organization_total',payments_eur:90}]},documents:{records:[{path:'documents/source.pdf',name:'source.pdf'},{path:'documents/other.pdf'}]}});
 assert.equal(groups.find(g=>g.id==='supplier')?.rows[0].row_key,'b');assert.equal(groups.find(g=>g.id==='documents')?.rows.length,1);assert.equal(groups.filter(g=>g.id.startsWith('budget-')).length,2);
});
