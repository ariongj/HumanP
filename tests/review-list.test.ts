import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReviewList,reviewKey,textMatches} from '../lib/review-list';
test('review keys keep product and procurement identities separate from their related notice',()=>{
 assert.equal(reviewKey({row_key:'award-1',notice_id:'12'}),'market:award-1');
 assert.equal(reviewKey({id:'model-1',brand:'Example',notice_id:'12'}),'product:model-1');
 assert.equal(reviewKey({notice_id:'12'}),'notice:12');
 assert.equal(reviewKey({name:'Source document',path:'documents/12.pdf'}),'document:documents/12.pdf');
 assert.equal(reviewKey({title:'No stable identity'}),null);
});
test('saved reviews accept only valid statuses and dates and discard persisted source text',()=>{
 assert.deepEqual(parseReviewList('invalid'),{});assert.deepEqual(parseReviewList('[]'),{});
 const valid={stage:'followup',savedAt:'2026-11-03T10:00:00Z'};
 assert.deepEqual(parseReviewList(JSON.stringify({'notice:12':{...valid,title:'Do not retain source text',password:'not-real'},'bad:1':valid,'product:3':{...valid,stage:'__proto__'},'document:x':{...valid,savedAt:'not a date'}})),{'notice:12':valid});
});
test('global search matches accents and multiple words across fields',()=>{
 const row={title:'Pajisje mjekësore',buyer:'Spitali i Prishtinës'};
 assert.equal(textMatches(row,['title','buyer'],'prishtines pajisje'),true);
 assert.equal(textMatches(row,['title','buyer'],'mjekesore'),true);
 assert.equal(textMatches(row,['title','buyer'],'laborator prishtine'),false);
});
