import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {backup} from 'node:sqlite';
import {openStore,createCompany} from '../store.mjs';
import {saveSource,markSourceFailure,readSource} from '../source.mjs';
import {buildDailyReports,runDeliveryTick} from '../reports.mjs';

test('source failure preserves last-known facts but does not advertise a successful check',()=>{
 const db=openStore(':memory:');const now=new Date('2026-10-22T08:00:00Z');
 const feed={notices:[{notice_id:'synthetic-notice',title:'Last-known public source fact'}],last_successful_check:now.toISOString(),run:{status:'ok'}};
 const aiReport={status:'ready',source_checked_at:now.toISOString(),entries:[]};
 saveSource(db,{feed,aiReport},now);
 assert.equal(readSource(db).feed.run.status,'ok');
 markSourceFailure(db,new Date('2026-10-22T08:11:00Z'));
 assert.equal(readSource(db).feed.last_successful_check,now.toISOString());assert.equal(readSource(db).feed.run.status,'error');
 assert.deepEqual(readSource(db).feed.notices,feed.notices);assert.deepEqual(readSource(db).aiReport,aiReport);
 assert.equal(db.prepare('SELECT last_fetch_at FROM source_cache WHERE id=1').get().last_fetch_at,'2026-10-22T08:11:00.000Z');
 saveSource(db,{feed:{...feed,last_successful_check:'2026-10-22T08:15:00.000Z'},aiReport:null},new Date('2026-10-22T08:15:00Z'));
 assert.equal(readSource(db).feed.run.status,'ok');assert.equal(db.prepare('SELECT last_error FROM source_cache WHERE id=1').get().last_error,null);
 db.close();
});

test('daily reports and private work survive closing the store and restoring a consistent backup',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'humanplus-restore-'));const file=join(dir,'original.sqlite'),copy=join(dir,'restore.sqlite');
 try{
  let db=openStore(file);db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('owner','owner@example.test','Owner','not-a-live-password','2026-10-22T07:00:00Z');
  const company=createCompany(db,{name:'Private restore fixture',userId:'owner'});
  db.prepare('INSERT INTO workspaces(id,company_id,tender_id,title,buyer,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run('workspace',company,'source-id','Public tender','Public buyer','Private restore proof','2026-10-22T07:00:00Z','2026-10-22T07:00:00Z');
  const now=new Date('2026-10-22T08:00:00Z');buildDailyReports(db,{now,feed:{notices:[],last_successful_check:now.toISOString(),run:{status:'ok'}}});runDeliveryTick(db,{now});
  await backup(db,copy);db.close();db=openStore(copy);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.equal(db.prepare('SELECT notes FROM workspaces WHERE company_id=?').get(company).notes,'Private restore proof');
  assert.equal(db.prepare('SELECT count(*) AS n FROM reports').get().n,1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM notification_deliveries').get().n,1);
  assert.equal(runDeliveryTick(db,{now}).length,0);db.close();
 }finally{await rm(dir,{recursive:true,force:true});}
});
