import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyFilters,filterNotices,filterProducts,filterWorkspaces,relationships,deadlineDay,sortNotices,normalize} from '../public/scope.js';
const products=[{id:'p1',name:'AU480',brand:'Beckman',supplier:'Supplier A'},{id:'p2',name:'cobas e411',brand:'Roche',supplier:'Supplier B'}];
const notices=[{id:'1',title:'Reagents for AU480',buyer:'Hospital A',category:'Laboratory',year:2026,deadline:'30.10.2026',classification:'tender_notice'},{id:'2',title:'Medical supplies',buyer:'Hospital B',category:'Consumables',year:2024,deadline:null,classification:'award_notice'},{id:'3',title:'AU4800 servicing',buyer:'Hospital A',category:'Laboratory',year:2026,deadline:'01.10.2026',classification:'tender_notice'}];
const links=[{notice_id:'2',product_id:'p2',reason:'Team verified a dossier reference'}];
const workspaces=[{id:'w1',tender_id:'1',status:'preparing',owner_id:'alice'},{id:'w2',tender_id:'2',status:'won',owner_id:null},{id:'w3',tender_id:'older',status:'watching'}];
const context={products,links,workspaces,now:new Date('2026-10-28T09:00:00Z')};
const scope=f=>filterNotices(notices,{...emptyFilters(),...f},context);
test('brand and supplier follow evidence, never broad buyer or partial model matches',()=>{
 assert.deepEqual(scope({brand:'Beckman'}).map(n=>n.id),['1']);
 assert.deepEqual(scope({supplier:'Supplier B'}).map(n=>n.id),['2']);
 assert.equal(relationships(notices[2],products,links).length,0);
 assert.equal(scope({brand:'Beckman',supplier:'Supplier B'}).length,0);
 assert.equal(relationships({id:'x',title:'AU480',procedure:'2026/123-26-7/B05'},[{id:'p',name:'Other',procurement_id:'123-26-7'}],[])[0].basis,'Same procedure');
});
test('year, category, buyer, owner, stage, type and query intersect consistently',()=>{
 assert.deepEqual(scope({year:'2024',category:'Consumables',buyer:'Hospital B',kind:'award_notice',stage:'won',owner:'unassigned'}).map(n=>n.id),['2']);
 assert.deepEqual(scope({q:'réagents',owner:'alice',stage:'preparing'}).map(n=>n.id),['1']);
 assert.equal(scope({year:'2024',category:'Laboratory'}).length,0);
 assert.deepEqual(scope({stage:'unsaved'}).map(n=>n.id),['3']);
 assert.equal(normalize('mjekësor'),'mjekesor');
});
test('deadline filters use Kosovo calendar days and exclude invalid dates',()=>{
 assert.deepEqual(scope({due:'week'}).map(n=>n.id),['1']);
 assert.deepEqual(scope({due:'unknown'}).map(n=>n.id),['2']);
 assert.deepEqual(scope({due:'expired'}).map(n=>n.id),['3']);
 assert.equal(deadlineDay('31.02.2026'),null);
 assert.deepEqual(sortNotices(notices).map(n=>n.id),['3','1','2']);
});
test('library and pipeline use same visible notice IDs; clearing restores unlinked history',()=>{
 const filters={...emptyFilters(),year:'2024'},visible=scope(filters);
 assert.deepEqual(filterProducts(products,filters,visible,notices,links).map(p=>p.id),['p2']);
 assert.deepEqual(filterWorkspaces(workspaces,visible,filters).map(w=>w.id),['w2']);
 assert.equal(filterProducts(products,emptyFilters(),notices,notices,links).length,2);
 assert.equal(filterWorkspaces(workspaces,notices,emptyFilters()).length,3);
});
