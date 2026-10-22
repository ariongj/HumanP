import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {openStore, createCompany} from '../store.mjs';
import {hashPassword, hash, verifyPassword} from '../auth.mjs';
import {createHandler} from '../api.mjs';
import {buildDailyReports, runDeliveryTick} from '../reports.mjs';

// Synthetic users and notices only. Each test receives a separate database.
const password='Synthetic account password 2026!';
const passwordHash=hashPassword(password);
const instant=new Date('2026-10-22T08:05:00.000Z');
const origin='http://localhost';
const feed={
  run:{status:'ok'},last_successful_check:'2026-10-22T07:50:00.000Z',
  source_url:'https://e-prokurimi.rks-gov.net/',
  notices:[{notice_id:'synthetic-medical-1',title:'Synthetic medical equipment',buyer:'Synthetic public buyer',
    category_sq:'Pajisje mjekësore',evidence_classification:'tender_notice',
    published_iso:'2026-10-21T09:00:00.000Z',deadline_displayed:'30.10.2026 12:00',deadline_timezone:'Europe/Tirane',
    source_url:'https://e-prokurimi.rks-gov.net/synthetic-fixture',fingerprint:'synthetic-fingerprint',gaps:[]}],
};

async function fixture(t,{secure=false}={}) {
  const db=openStore(':memory:');
  for(const [id,email,name] of [
    ['owner-a','owner-a@example.test','Owner A'],['owner-b','owner-b@example.test','Owner B'],
    ['member-a','member-a@example.test','Member A'],['viewer-a','viewer-a@example.test','Viewer A'],
  ]) db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(id,email,name,await passwordHash,instant.toISOString());
  const companyA=createCompany(db,{name:'Synthetic company Alpha',userId:'owner-a'});
  const companyB=createCompany(db,{name:'Synthetic company Beta',userId:'owner-b'});
  db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(companyA,'member-a','member','active');
  db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(companyA,'viewer-a','viewer','active');
  const server=createServer(createHandler({db,origin,secure,now:()=>instant,feedProvider:()=>({feed,aiReport:null})}));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  function client(){
    return {
      cookie:'',csrf:'',
      async request(path,{method='GET',body,headers={},withOrigin=true,withCsrf=true}={}){
        const requestHeaders={...(this.cookie?{cookie:this.cookie}:{}),
          ...(method!=='GET'?{'content-type':'application/json',...(withOrigin?{origin}:{}),...(withCsrf&&this.csrf?{'x-csrf-token':this.csrf}:{})}:{}),...headers};
        const response=await fetch(base+path,{method,headers:requestHeaders,...(body!==undefined?{body:JSON.stringify(body)}:{})});
        const setCookie=response.headers.get('set-cookie');if(setCookie)this.cookie=setCookie.split(';')[0];
        const data=await response.json();return {status:response.status,data,headers:response.headers};
      },
      async me(){const response=await this.request('/api/me');if(response.status===200)this.csrf=response.data.csrf;return response;},
      async login(email,secret=password){
        const response=await this.request('/api/login',{method:'POST',body:{email,password:secret}});
        if(response.status===200)await this.me();return response;
      },
    };
  }
  async function signedIn(name){const c=client();assert.equal((await c.login(`${name}@example.test`)).status,200);return c;}
  async function newWorkspace(c){const r=await c.request('/api/workspaces',{method:'POST',body:{tenderId:feed.notices[0].notice_id}});assert.ok([200,201].includes(r.status));return r.data;}
  async function invite(c,email,role='member'){
    const r=await c.request('/api/invitations',{method:'POST',body:{email,role}});assert.equal(r.status,201);
    return new URL(r.data.inviteUrl).hash.slice('#invite='.length);
  }
  return {db,companyA,companyB,client,signedIn,newWorkspace,invite};
}

test('private API requires authentication and rejects fabricated session cookies',async t=>{
  const f=await fixture(t),c=f.client();
  assert.equal((await c.request('/api/health')).status,200);
  for(const path of ['/api/me','/api/members','/api/workspaces','/api/opportunities','/api/reports','/api/notifications','/api/audit']) {
    const response=await c.request(path);assert.equal(response.status,401,path);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.doesNotMatch(JSON.stringify(response.data),/Synthetic|owner-a@example/);
  }
  c.cookie='hp_session=forged-session';assert.equal((await c.request('/api/me')).status,401);
  assert.equal((await c.login('missing@example.test')).status,401);
  assert.equal((await c.login('owner-a@example.test','Incorrect password')).status,401);
});

test('production session cookie has host, secure, HTTP-only and strict same-site protections',async t=>{
  const f=await fixture(t,{secure:true}),c=f.client();const response=await c.login('owner-a@example.test');
  assert.equal(response.status,200);const cookie=response.headers.get('set-cookie');
  assert.match(cookie,/^__Host-hp_session=[A-Za-z0-9_-]+;/);
  for(const protection of ['Path=/','HttpOnly','SameSite=Strict','Secure'])assert.ok(cookie.split('; ').includes(protection),protection);
  assert.doesNotMatch(cookie,/Domain=/i);assert.equal(response.headers.get('strict-transport-security'),'max-age=31536000');
  const raw=c.cookie.split('=')[1],row=f.db.prepare('SELECT * FROM sessions').get();
  assert.equal(row.hash,hash(raw));assert.notEqual(row.hash,raw);assert.notEqual(row.csrf,raw);
});

test('mutations require both allowed origin and current CSRF token',async t=>{
  const f=await fixture(t),c=await f.signedIn('owner-a');const body={tenderId:feed.notices[0].notice_id};
  assert.equal((await c.request('/api/workspaces',{method:'POST',body,withOrigin:false})).status,403);
  assert.equal((await c.request('/api/workspaces',{method:'POST',body,headers:{origin:'https://attacker.example'}})).status,403);
  assert.equal((await c.request('/api/workspaces',{method:'POST',body,withCsrf:false})).status,403);
  assert.equal((await c.request('/api/workspaces',{method:'POST',body,headers:{'x-csrf-token':'incorrect'}})).status,403);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM workspaces').get().n,0);
  const anonymous=f.client();assert.equal((await anonymous.request('/api/login',{method:'POST',body:{email:'owner-a@example.test',password},headers:{origin:'null'}})).status,403);
  assert.equal((await c.request('/api/workspaces',{method:'POST',body})).status,201);
});

test('companies can work on the same public notice without sharing private workspaces',async t=>{
  const f=await fixture(t),a=await f.signedIn('owner-a'),b=await f.signedIn('owner-b');
  const wa=await f.newWorkspace(a),wb=await f.newWorkspace(b);assert.notEqual(wa.id,wb.id);
  assert.equal(wa.company_id,f.companyA);assert.equal(wb.company_id,f.companyB);
  assert.equal((await f.newWorkspace(a)).id,wa.id,'duplicate creation is idempotent within a company');
  assert.equal((await a.request(`/api/workspaces/${wa.id}`,{method:'PATCH',body:{version:1,notes:'Private Alpha decision'}})).status,200);
  assert.equal((await b.request(`/api/workspaces/${wa.id}`)).status,404);
  for(const [path,method,body] of [
    [`/api/workspaces/${wa.id}`,'PATCH',{version:2,notes:'Cross-company overwrite'}],
    [`/api/workspaces/${wa.id}/tasks`,'POST',{title:'Injected task'}],
    [`/api/workspaces/${wa.id}/comments`,'POST',{body:'Injected comment'}],
  ])assert.equal((await b.request(path,{method,body})).status,404,path);
  const bList=await b.request(`/api/workspaces?companyId=${f.companyA}`);
  assert.deepEqual(bList.data.workspaces.map(w=>w.id),[wb.id]);assert.doesNotMatch(JSON.stringify(bList.data),/Private Alpha decision/);
  const spoof=await a.request('/api/workspaces',{method:'POST',body:{tenderId:feed.notices[0].notice_id,companyId:f.companyB}});
  assert.equal(spoof.data.id,wa.id);assert.equal((await a.request(`/api/workspaces/${wa.id}`)).data.notes,'Private Alpha decision');
});

test('tasks, comments and assignees cannot cross company or workspace boundaries',async t=>{
  const f=await fixture(t),a=await f.signedIn('owner-a'),b=await f.signedIn('owner-b');
  const wa=await f.newWorkspace(a),wb=await f.newWorkspace(b);
  assert.equal((await a.request(`/api/workspaces/${wa.id}/tasks`,{method:'POST',body:{title:'Prepare evidence',assigneeId:'owner-b'}})).status,400);
  assert.equal((await a.request(`/api/workspaces/${wa.id}`,{method:'PATCH',body:{version:1,ownerId:'owner-b'}})).status,400);
  const taskResponse=await a.request(`/api/workspaces/${wa.id}/tasks`,{method:'POST',body:{title:'Private Alpha checklist',assigneeId:'member-a'}});
  assert.equal(taskResponse.status,201);const task=taskResponse.data.tasks[0];
  assert.equal((await b.request(`/api/workspaces/${wa.id}/tasks/${task.id}`,{method:'PATCH',body:{done:true}})).status,404);
  assert.equal((await b.request(`/api/workspaces/${wb.id}/tasks/${task.id}`,{method:'PATCH',body:{done:true}})).status,404);
  const comment=await a.request(`/api/workspaces/${wa.id}/comments`,{method:'POST',body:{body:'Private Alpha discussion',companyId:f.companyB,authorId:'owner-b'}});
  assert.equal(comment.status,201);assert.equal(comment.data.comments[0].author_name,'Owner A');
  const own=await b.request(`/api/workspaces/${wb.id}`);assert.deepEqual(own.data.tasks,[]);assert.deepEqual(own.data.comments,[]);
  const complete=await a.request(`/api/workspaces/${wa.id}/tasks/${task.id}`,{method:'PATCH',body:{done:true}});
  assert.equal(complete.status,200);assert.equal(complete.data.tasks[0].done,true);
});

test('company directories, reports, notifications and audit history are isolated',async t=>{
  const f=await fixture(t),a=await f.signedIn('owner-a'),b=await f.signedIn('owner-b');
  buildDailyReports(f.db,{now:instant,feed});runDeliveryTick(f.db,{now:instant});
  const aReports=(await a.request('/api/reports')).data.reports,bReports=(await b.request(`/api/reports?companyId=${f.companyA}`)).data.reports;
  assert.equal(aReports.length,1);assert.equal(bReports.length,1);assert.equal(aReports[0].company_id,f.companyA);assert.equal(bReports[0].company_id,f.companyB);
  assert.notEqual(aReports[0].id,bReports[0].id);assert.doesNotMatch(JSON.stringify(bReports),/Synthetic company Alpha/);
  const directory=(await b.request('/api/members')).data.members;assert.deepEqual(directory.map(m=>m.id),['owner-b']);
  const aInbox=(await a.request('/api/notifications')).data.notifications,bInbox=(await b.request('/api/notifications')).data.notifications;
  assert.equal(aInbox.length,1);assert.equal(bInbox.length,1);assert.equal(aInbox[0].body.company_id,f.companyA);assert.equal(bInbox[0].body.company_id,f.companyB);
  assert.notEqual(aInbox[0].id,bInbox[0].id);
  const wa=await f.newWorkspace(a);const bAudit=await b.request('/api/audit');
  assert.doesNotMatch(JSON.stringify(bAudit.data),new RegExp(wa.id));
  assert.equal((await b.request('/api/reports')).data.delivery.chatgptConnected,false,'do not imply private ChatGPT delivery');
});

test('viewers can read their company data but cannot modify work or owner controls',async t=>{
  const f=await fixture(t),a=await f.signedIn('owner-a'),v=await f.signedIn('viewer-a');const w=await f.newWorkspace(a);
  const created=await a.request(`/api/workspaces/${w.id}/tasks`,{method:'POST',body:{title:'Checklist'}});const taskId=created.data.tasks[0].id;
  for(const path of ['/api/me','/api/members','/api/workspaces','/api/reports',`/api/workspaces/${w.id}`])assert.equal((await v.request(path)).status,200,path);
  for(const [path,method,body] of [
    ['/api/workspaces','POST',{tenderId:feed.notices[0].notice_id}],
    [`/api/workspaces/${w.id}`,'PATCH',{version:1,notes:'Viewer change'}],
    [`/api/workspaces/${w.id}/tasks`,'POST',{title:'Viewer task'}],
    [`/api/workspaces/${w.id}/tasks/${taskId}`,'PATCH',{done:true}],
    [`/api/workspaces/${w.id}/comments`,'POST',{body:'Viewer comment'}],
    ['/api/companies','POST',{name:'Unauthorized company',sector:'healthcare'}],
    ['/api/company','PATCH',{name:'Changed',sector:'healthcare',interests:[]}],
    ['/api/invitations','POST',{email:'outsider@example.test',role:'member'}],
    ['/api/members/member-a','PATCH',{status:'revoked'}],
    ['/api/report-preferences','PATCH',{enabled:false}],
  ])assert.equal((await v.request(path,{method,body})).status,403,path);
  assert.equal((await v.request('/api/audit')).status,403);
  assert.equal((await a.request(`/api/workspaces/${w.id}`)).data.notes,'');
});

test('members can collaborate but cannot change membership, company or reports settings',async t=>{
  const f=await fixture(t),m=await f.signedIn('member-a');const w=await f.newWorkspace(m);
  assert.equal((await m.request(`/api/workspaces/${w.id}`,{method:'PATCH',body:{version:1,status:'preparing'}})).status,200);
  assert.equal((await m.request(`/api/workspaces/${w.id}/comments`,{method:'POST',body:{body:'Working on this bid'}})).status,201);
  assert.equal((await m.request('/api/invitations',{method:'POST',body:{email:'new@example.test',role:'member'}})).status,403);
  assert.equal((await m.request('/api/report-preferences',{method:'PATCH',body:{enabled:false}})).status,403);
  assert.equal((await m.request('/api/company',{method:'PATCH',body:{name:'Changed',sector:'it',interests:[]}})).status,403);
});

test('new invitations are one use, expire, and cannot grant owner privileges',async t=>{
  const f=await fixture(t),a=await f.signedIn('owner-a');
  assert.equal((await a.request('/api/invitations',{method:'POST',body:{email:'new@example.test',role:'owner'}})).status,400);
  const raw=await f.invite(a,'new@example.test','viewer');const newcomer=f.client();
  const input={token:raw,name:'New synthetic user',password};
  assert.equal((await newcomer.request('/api/accept-invitation',{method:'POST',body:input})).status,200);
  const me=await newcomer.me();assert.equal(me.data.company.id,f.companyA);assert.equal(me.data.role,'viewer');
  assert.equal((await f.client().request('/api/accept-invitation',{method:'POST',body:input})).status,400);
  const expired=await f.invite(a,'expired@example.test');f.db.prepare('UPDATE invitations SET expires_at=? WHERE hash=?').run('2026-10-21T08:00:00.000Z',hash(expired));
  assert.equal((await f.client().request('/api/accept-invitation',{method:'POST',body:{...input,token:expired}})).status,400);
  assert.equal(f.db.prepare('SELECT id FROM users WHERE email=?').get('expired@example.test'),undefined);
});

test('accepting another-company invitation requires the existing password and preserves it',async t=>{
  const f=await fixture(t),a=await f.signedIn('owner-a');const raw=await f.invite(a,'owner-b@example.test','member');
  const b=f.client(),input={token:raw,name:'Attempted rename',password:'Replacement password 2026!'};
  assert.equal((await b.request('/api/accept-invitation',{method:'POST',body:input})).status,401);
  assert.equal(f.db.prepare('SELECT used_at FROM invitations WHERE hash=?').get(hash(raw)).used_at,null);
  assert.equal((await b.request('/api/accept-invitation',{method:'POST',body:{...input,password}})).status,200);
  const me=await b.me();assert.equal(me.data.company.id,f.companyA);assert.equal(me.data.role,'member');assert.equal(me.data.user.name,'Owner B');
  const stored=f.db.prepare('SELECT password_hash FROM users WHERE id=?').get('owner-b').password_hash;
  assert.equal(stored,await passwordHash);assert.equal(await verifyPassword(password,stored),true);
  assert.equal((await f.client().login('owner-b@example.test',input.password)).status,401);
  assert.equal((await f.client().login('owner-b@example.test')).status,200);
});

test('revoking access invalidates existing sessions and unused invitations immediately',async t=>{
  const f=await fixture(t),a=await f.signedIn('owner-a'),m=await f.signedIn('member-a'),m2=await f.signedIn('member-a');
  const pending=await f.invite(a,'member-a@example.test');
  assert.equal((await a.request('/api/members/owner-a',{method:'PATCH',body:{status:'revoked'}})).status,400);
  assert.equal((await a.request('/api/members/owner-b',{method:'PATCH',body:{status:'revoked'}})).status,404);
  assert.equal((await a.request('/api/members/member-a',{method:'PATCH',body:{status:'revoked'}})).status,200);
  for(const c of [m,m2])assert.equal((await c.request('/api/me')).status,401);
  assert.equal((await f.client().login('member-a@example.test')).status,401);
  assert.equal((await f.client().request('/api/accept-invitation',{method:'POST',body:{token:pending,name:'Member A',password}})).status,400);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').get('member-a').n,0);
  assert.equal((await a.request('/api/members/member-a',{method:'PATCH',body:{status:'active'}})).status,200);
  assert.equal((await m.request('/api/me')).status,401,'re-enabling access does not resurrect revoked session');
  assert.equal((await f.client().login('member-a@example.test')).status,200);
});

test('optimistic workspace versions prevent lost updates between collaborators',async t=>{
  const f=await fixture(t),a=await f.signedIn('owner-a'),m=await f.signedIn('member-a');const w=await f.newWorkspace(a);
  const update=await a.request(`/api/workspaces/${w.id}`,{method:'PATCH',body:{version:w.version,notes:'Owner saved',status:'reviewing'}});
  assert.equal(update.status,200);assert.equal(update.data.version,w.version+1);
  const stale=await m.request(`/api/workspaces/${w.id}`,{method:'PATCH',body:{version:w.version,notes:'Stale overwrite',status:'lost'}});
  assert.equal(stale.status,409);
  const actual=(await m.request(`/api/workspaces/${w.id}`)).data;assert.equal(actual.notes,'Owner saved');assert.equal(actual.status,'reviewing');
  assert.equal((await m.request(`/api/workspaces/${w.id}`,{method:'PATCH',body:{version:actual.version,notes:'Member saved after reload'}})).status,200);
});

test('creating and switching company rotates CSRF and blocks unauthorized switches',async t=>{
  const f=await fixture(t),a=await f.signedIn('owner-a');const originalCsrf=a.csrf;
  assert.equal((await a.request('/api/switch-company',{method:'POST',body:{companyId:f.companyB}})).status,404);
  const created=await a.request('/api/companies',{method:'POST',body:{name:'Synthetic third company',sector:'it'}});
  assert.equal(created.status,201);const nextId=created.data.companyId;assert.notEqual(nextId,f.companyA);
  assert.equal((await a.request('/api/logout',{method:'POST',body:{}})).status,403,'old CSRF must not survive company creation');
  const me=await a.me();assert.equal(me.data.company.id,nextId);assert.equal(me.data.role,'owner');assert.notEqual(a.csrf,originalCsrf);
  assert.equal((await a.request('/api/workspaces')).data.workspaces.length,0);
  const beforeSwitch=a.csrf;assert.equal((await a.request('/api/switch-company',{method:'POST',body:{companyId:f.companyA}})).status,200);
  assert.equal((await a.request('/api/report-preferences',{method:'PATCH',body:{enabled:false}})).status,403);
  assert.equal((await a.me()).data.company.id,f.companyA);assert.notEqual(a.csrf,beforeSwitch);
  assert.equal((await a.request('/api/report-preferences',{method:'PATCH',body:{enabled:false}})).status,200);
  assert.equal(f.db.prepare('SELECT enabled FROM report_preferences WHERE company_id=?').get(nextId).enabled,1);
});

test('password changes invalidate every active session and preserve access on wrong current password',async t=>{
  const f=await fixture(t),a=await f.signedIn('owner-a'),another=await f.signedIn('owner-a');
  const nextPassword='Different synthetic password 2026!';
  assert.equal((await a.request('/api/password',{method:'POST',body:{currentPassword:'wrong',newPassword:nextPassword}})).status,401);
  assert.equal((await another.request('/api/me')).status,200);
  const result=await a.request('/api/password',{method:'POST',body:{currentPassword:password,newPassword:nextPassword}});
  assert.equal(result.status,200);assert.match(result.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await a.request('/api/me')).status,401);assert.equal((await another.request('/api/me')).status,401);
  assert.equal((await f.client().login('owner-a@example.test')).status,401);
  assert.equal((await f.client().login('owner-a@example.test',nextPassword)).status,200);
});
