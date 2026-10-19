import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReport,reportHTML} from '../lib/reports';
import {dataIndex} from '../lib/data-index';
import manifest from '../lib/import-manifest.json';
test('data index covers every embedded dataset exactly once',()=>{
 assert.deepEqual(dataIndex.map(d=>'data/'+d.id+'.json').sort(),Object.keys(manifest).filter(k=>k.startsWith('data/')).sort());
 assert.equal(new Set(dataIndex.map(d=>d.id)).size,dataIndex.length);
});
test('reports keep national and health populations separate and reconcile filtered chart and exported rows',()=>{
 const data={market:{records:[{year:'2024',category:'Lab',row_key:'a'},{year:'2025',category:'Lab',row_key:'b'}],nationalRecords2024:[{year:'2024',category:'Lab',row_key:'a'},{year:'2024',category:'Other',row_key:'c'}]}};
 const health=buildReport('market',data,'2024').sections[0],national=buildReport('market',data,'2024','national2024','Other').sections[0];
 assert.deepEqual(health.rows.map(r=>r.row_key),['a']);assert.deepEqual(national.rows.map(r=>r.row_key),['c']);assert.equal(national.chart.reduce((n,r)=>n+r.value,0),national.rows.length);
 assert.equal(buildReport('market',data,'2025','national2024').sections[0].rows.length,0);
});
test('budget reports never combine payments with allocations or parent and child totals',()=>{
 const data={budget:{central_budget:[{year:'2024',total:100}],municipal_budget:[{year:'2024',total:50}],execution_2023:[{year:'2024',row_type:'organization_total',payments_eur:80},{year:'2024',row_type:'economic_category',payments_eur:80}],audited_execution_2024:[{year:'2024',row_type:'organization_total',payments_eur:82}]}};
 assert.deepEqual(buildReport('budget',data,'2024').sections.map(s=>s.total),[100,50,80,82]);assert(buildReport('budget',data,'2025').sections.every(s=>s.total===null&&s.rows.length===0));assert.deepEqual(buildReport('budget',data,'').sections.map(s=>s.total),[100,50,80,82]);
});
test('product reports preserve missing years, review labels and source evidence without aggregating lot prices',()=>{
 const products={records:[{brand:'A',year:2024,model:'One',reported_procurement_value:100},{brand:'A (to verify)',year:null,model:'Two',reported_procurement_value:100}]};
 assert.equal(buildReport('products',{products},'').sections[0].rows.length,2);assert.equal(buildReport('products',{products},'2024').sections[0].rows.length,1);
 const section=buildReport('products',{products},'unknown').sections[0];assert.equal(section.rows[0].brand,'A (to verify)');assert(!('total' in section));
 assert.equal(buildReport('products',{products},'','', 'A').sections[0].rows.length,1);
});
test('downloadable report includes all rows beyond pagination and escapes source HTML',()=>{
 const report=buildReport('products',{products:{records:Array.from({length:25},(_,i)=>({brand:'<script>alert(1)</script>',model:'Model '+i,manufacturer_source:'https://example.test/?a=1&b=2'}))}},'');
 const html=reportHTML(report);assert(html.includes('Model 24'));assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert(!html.includes('<script>'));assert(html.includes('default-src \'none\''));assert(html.includes('a=1&amp;b=2'));
});
