import {readFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import {id, transaction, audit, createCompany} from './store.mjs';
import {hashPassword, verifyPassword, token, hash, rateLimit} from './auth.mjs';
import {listReports} from './reports.mjs';
import {collectionStatus} from './collection-job.mjs';
const publicRoot=fileURLToPath(new URL('./public/',import.meta.url));
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const text=(value,max=200,required=true)=>{
  if(typeof value!=='string'||value.length>max||(required&&!value.trim())) fail(400,'Check the required fields and their length.');
  return value.trim();
};
const email=value=>{const v=text(value,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))fail(400,'Enter a valid email address.');return v;};
const sectors=['healthcare','it','construction','other'];
const sector=value=>sectors.includes(value)?value:fail(400,'Choose a supported sector.');
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));}
async function body(req){
  if(!String(req.headers['content-type']||'').startsWith('application/json'))fail(415,'Send JSON.');
  let value=''; for await(const chunk of req){value+=chunk;if(Buffer.byteLength(value)>32768)fail(413,'Request is too large.');}
  try{const parsed=JSON.parse(value||'{}');if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail(400,'Invalid request.');return parsed;}catch(e){fail(400,'Invalid JSON request.');}
}
function noticesFrom(feed){return Array.isArray(feed?.notices)?feed.notices:[];}
export function createHandler({db,origin,feedProvider=()=>({feed:null,aiReport:null}),secure=true,now=()=>new Date()}) {
  const cookieName=secure?'__Host-hp_session':'hp_session';
  const cookie=(value,maxAge)=>`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?'; Secure':''}`;
  const timestamp=()=>now().toISOString();
  function session(req){
    const raw=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if(!raw)fail(401,'Sign in to continue.');
    const s=db.prepare(`SELECT s.*,u.email,u.name,m.role FROM sessions s JOIN users u ON u.id=s.user_id JOIN memberships m ON m.user_id=s.user_id AND m.company_id=s.company_id AND m.status='active' WHERE s.hash=? AND s.expires_at>?`).get(hash(raw),timestamp());
    if(!s)fail(401,'Your session expired or your access was removed. Sign in again.');return s;
  }
  function owner(s){if(s.role!=='owner')fail(403,'Only a company owner can do this.');}
  function writer(s){if(s.role==='viewer')fail(403,'Your account has read-only access.');}
  function activeMember(companyId,userId){if(userId===null||userId===undefined||userId==='')return null;const m=db.prepare("SELECT user_id FROM memberships WHERE company_id=? AND user_id=? AND status='active'").get(companyId,userId);if(!m)fail(400,'Choose an active member of this company.');return m.user_id;}
  function workspace(s,workspaceId){
    const w=db.prepare('SELECT * FROM workspaces WHERE id=? AND company_id=?').get(workspaceId,s.company_id);if(!w)fail(404,'Workspace not found.');
    w.tasks=db.prepare('SELECT * FROM tasks WHERE workspace_id=? AND company_id=? ORDER BY rowid').all(workspaceId,s.company_id).map(t=>({...t,done:!!t.done}));
    w.comments=db.prepare('SELECT c.id,c.body,c.created_at,u.name AS author_name FROM comments c JOIN users u ON u.id=c.author_id WHERE c.workspace_id=? AND c.company_id=? ORDER BY c.created_at').all(workspaceId,s.company_id);return w;
  }
  function startSession(res,userId,companyId){
    const raw=token(); db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(timestamp());
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?)').run(hash(raw),userId,companyId,token(),new Date(now().getTime()+12*3600000).toISOString());
    res.setHeader('Set-Cookie',cookie(raw,12*3600));
  }
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
    try{
      const url=new URL(req.url,origin);const path=url.pathname;const method=req.method;
      if(path==='/api/health'&&method==='GET')return json(res,200,{status:'ok',service:'HumanPlus company workspace',version:'0.1.0'});
      if(path==='/archive.html'&&(method==='GET'||method==='HEAD')){
        const location=process.env.HP_ARCHIVE_PATH||fileURLToPath(new URL('./archive.html',import.meta.url));
        const info=await stat(location);res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Length',info.size);
        // The encrypted archive carries its own restrictive hash-based CSP.
        res.removeHeader('Content-Security-Policy');
        if(method==='HEAD'){res.end();return;}await pipeline(createReadStream(location),res);return;
      }
      if(!path.startsWith('/api/')){
        if(method!=='GET'&&method!=='HEAD')fail(405,'Method not allowed.');
        const asset={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css'}[path];
        if(!asset)fail(404,'Not found.');
        const bytes=await readFile(publicRoot+asset);res.setHeader('Content-Type',asset.endsWith('.js')?'text/javascript; charset=utf-8':asset.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(method==='HEAD'?undefined:bytes);return;
      }
      const mutation=!['GET','HEAD'].includes(method);
      if(mutation&&req.headers.origin!==origin)fail(403,'Request origin is not allowed.');
      const input=mutation?await body(req):{};
      if(path==='/api/login'&&method==='POST'){
        const address=email(input.email);
        rateLimit(db,'login-email:'+address,12,15*60000,now().getTime());
        rateLimit(db,'login-ip:'+req.socket.remoteAddress,60,15*60000,now().getTime());
        const u=db.prepare('SELECT * FROM users WHERE email=?').get(address);
        const dummy='scrypt:9cc4774a8fb63c6ea3ac60c5777d984e:'+ '0'.repeat(128);
        const valid=await verifyPassword(input.password,u?.password_hash||dummy);
        if(!valid||!u)fail(401,'Email or password is incorrect.');
        const m=db.prepare("SELECT * FROM memberships WHERE user_id=? AND status='active' ORDER BY company_id LIMIT 1").get(u.id);
        if(!m)fail(401,'Email or password is incorrect.');
        startSession(res,u.id,m.company_id);audit(db,m.company_id,u.id,'session.created');return json(res,200,{ok:true});
      }
      if(path==='/api/accept-invitation'&&method==='POST'){
        rateLimit(db,'invite-ip:'+req.socket.remoteAddress,30,15*60000,now().getTime());
        const invite=db.prepare('SELECT * FROM invitations WHERE hash=? AND expires_at>? AND used_at IS NULL').get(hash(text(input.token,100)),timestamp());
        if(!invite)fail(400,'This invitation has expired or has already been used.');
        const existing=db.prepare('SELECT * FROM users WHERE email=?').get(invite.email);
        if(existing&&!await verifyPassword(input.password,existing.password_hash))fail(401,'Use your existing account password to accept this invitation.');
        const name=text(input.name,100);const passwordHash=existing?.password_hash||await hashPassword(input.password);const userId=existing?.id||id();
        transaction(db,()=>{
          const used=db.prepare('UPDATE invitations SET used_at=? WHERE hash=? AND used_at IS NULL AND expires_at>?').run(timestamp(),invite.hash,timestamp());
          if(used.changes!==1)fail(400,'Invitation has already been used.');
          if(!existing)db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(userId,invite.email,name,passwordHash,timestamp());
          const prior=db.prepare('SELECT role,status FROM memberships WHERE company_id=? AND user_id=?').get(invite.company_id,userId);
          if(prior?.role==='owner')fail(409,'An owner account cannot be changed by an invitation.');
          db.prepare("INSERT INTO memberships VALUES (?,?,?,'active') ON CONFLICT(company_id,user_id) DO UPDATE SET role=excluded.role,status='active'").run(invite.company_id,userId,invite.role);
          audit(db,invite.company_id,userId,'invitation.accepted');
        });
        startSession(res,userId,invite.company_id);return json(res,200,{ok:true});
      }
      const s=session(req);
      if(mutation&&req.headers['x-csrf-token']!==s.csrf)fail(403,'Refresh the page and try again.');
      if(mutation)rateLimit(db,'write:'+s.user_id,150,60000,now().getTime());
      if(path==='/api/me'&&method==='GET'){
        const company=db.prepare('SELECT * FROM companies WHERE id=?').get(s.company_id);company.interests=JSON.parse(company.interests_json);delete company.interests_json;
        const companies=db.prepare("SELECT c.id,c.name,m.role FROM companies c JOIN memberships m ON m.company_id=c.id WHERE m.user_id=? AND m.status='active' ORDER BY c.name").all(s.user_id);
        return json(res,200,{user:{id:s.user_id,email:s.email,name:s.name},company,role:s.role,csrf:s.csrf,companies});
      }
      if(path==='/api/logout'&&method==='POST'){db.prepare('DELETE FROM sessions WHERE hash=?').run(s.hash);res.setHeader('Set-Cookie',cookie('',0));return json(res,200,{ok:true});}
      if(path==='/api/password'&&method==='POST'){
        rateLimit(db,'password:'+s.user_id,8,15*60000,now().getTime());
        const u=db.prepare('SELECT password_hash FROM users WHERE id=?').get(s.user_id);
        if(!await verifyPassword(input.currentPassword,u.password_hash))fail(401,'Current password is incorrect.');
        const next=await hashPassword(input.newPassword);
        transaction(db,()=>{db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(next,s.user_id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(s.user_id);audit(db,s.company_id,s.user_id,'password.changed');});
        res.setHeader('Set-Cookie',cookie('',0));return json(res,200,{ok:true});
      }
      if(path==='/api/switch-company'&&method==='POST'){
        const m=db.prepare("SELECT company_id FROM memberships WHERE user_id=? AND company_id=? AND status='active'").get(s.user_id,text(input.companyId,100));
        if(!m)fail(404,'Company not found.');db.prepare('UPDATE sessions SET company_id=?,csrf=? WHERE hash=?').run(m.company_id,token(),s.hash);return json(res,200,{ok:true});
      }
      if(path==='/api/companies'&&method==='POST'){
        owner(s);rateLimit(db,'company:'+s.user_id,5,86400000,now().getTime());
        const companyId=createCompany(db,{name:text(input.name,160),sector:sector(input.sector),userId:s.user_id});
        db.prepare('UPDATE sessions SET company_id=?,csrf=? WHERE hash=?').run(companyId,token(),s.hash);return json(res,201,{ok:true,companyId});
      }
      if(path==='/api/company'&&method==='PATCH'){
        owner(s);if(!Array.isArray(input.interests)||input.interests.length>30)fail(400,'Use up to 30 interest keywords.');
        const interests=input.interests.map(x=>text(x,100));
        db.prepare('UPDATE companies SET name=?,sector=?,interests_json=? WHERE id=?').run(text(input.name,160),sector(input.sector),JSON.stringify(interests),s.company_id);
        audit(db,s.company_id,s.user_id,'company.updated');return json(res,200,{ok:true});
      }
      if(path==='/api/members'&&method==='GET'){
        const members=db.prepare('SELECT u.id,u.email,u.name,m.role,m.status FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.company_id=? ORDER BY u.name').all(s.company_id);return json(res,200,{members});
      }
      if(path==='/api/invitations'&&method==='POST'){
        owner(s);const address=email(input.email);if(!['member','viewer'].includes(input.role))fail(400,'Choose member or viewer.');
        const current=db.prepare('SELECT m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=? AND u.email=?').get(s.company_id,address);if(current?.role==='owner')fail(400,'This owner is already a member.');
        const raw=token();const expiresAt=new Date(now().getTime()+72*3600000).toISOString();
        transaction(db,()=>{db.prepare('DELETE FROM invitations WHERE company_id=? AND email=? AND used_at IS NULL').run(s.company_id,address);db.prepare('INSERT INTO invitations VALUES (?,?,?,?,?,NULL)').run(hash(raw),s.company_id,address,input.role,expiresAt);audit(db,s.company_id,s.user_id,'invitation.created');});
        return json(res,201,{inviteUrl:origin+'/#invite='+raw,expiresAt});
      }
      const memberMatch=path.match(/^\/api\/members\/([^/]+)$/);
      if(memberMatch&&method==='PATCH'){
        owner(s);if(!['active','revoked'].includes(input.status))fail(400,'Invalid status.');
        const target=db.prepare('SELECT * FROM memberships WHERE company_id=? AND user_id=?').get(s.company_id,memberMatch[1]);
        if(!target)fail(404,'Member not found.');if(target.role==='owner')fail(400,'Owner access cannot be revoked here.');
        transaction(db,()=>{db.prepare('UPDATE memberships SET status=? WHERE company_id=? AND user_id=?').run(input.status,s.company_id,target.user_id);if(input.status==='revoked'){
          db.prepare('DELETE FROM sessions WHERE company_id=? AND user_id=?').run(s.company_id,target.user_id);
          db.prepare('DELETE FROM invitations WHERE company_id=? AND email=(SELECT email FROM users WHERE id=?)').run(s.company_id,target.user_id);
        }audit(db,s.company_id,s.user_id,'member.'+input.status,target.user_id);});return json(res,200,{ok:true});
      }
      if(path==='/api/opportunities'&&method==='GET'){
        const {feed,aiReport}=feedProvider();const company=db.prepare('SELECT * FROM companies WHERE id=?').get(s.company_id);const terms=JSON.parse(company.interests_json).map(x=>x.toLowerCase());
        const notices=company.sector==='healthcare'?noticesFrom(feed).filter(n=>!terms.length||terms.some(t=>(n.title+' '+n.buyer+' '+n.category_sq).toLowerCase().includes(t))).map(n=>({id:n.notice_id,title:n.title||n.listed_title,buyer:n.buyer,deadline:n.deadline_displayed||null,url:n.source_url,category:n.category_sq,score:null,reasons:n.match_reasons||[],classification:n.evidence_classification,requirements:n.gaps||'Check the official tender dossier.'})):[];
        return json(res,200,{sourceCheckedAt:feed?.last_successful_check||null,sourceStatus:feed?.run?.status||'unavailable',collection:collectionStatus(db,now()),aiStatus:aiReport?.status||'unavailable',aiSourceCheckedAt:aiReport?.source_checked_at||null,coverageNote:company.sector==='healthcare'?(feed?.coverage_note||'Healthcare notices from the official Kosovo portal. Metadata only; verify eligibility in the dossier.'):'This pilot source covers healthcare. Coverage for your sector is not connected yet.',notices});
      }
      if(path==='/api/workspaces'&&method==='GET')return json(res,200,{workspaces:db.prepare('SELECT id FROM workspaces WHERE company_id=? ORDER BY updated_at DESC').all(s.company_id).map(w=>workspace(s,w.id))});
      if(path==='/api/workspaces'&&method==='POST'){
        writer(s);const tenderId=text(input.tenderId,100);const n=noticesFrom(feedProvider().feed).find(n=>n.notice_id===tenderId);if(!n)fail(404,'Source notice not found.');
        const existing=db.prepare('SELECT id FROM workspaces WHERE company_id=? AND tender_id=?').get(s.company_id,tenderId);if(existing)return json(res,200,workspace(s,existing.id));
        const workspaceId=id();db.prepare('INSERT INTO workspaces(id,company_id,tender_id,title,buyer,owner_id,deadline,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(workspaceId,s.company_id,tenderId,n.title||n.listed_title||'Untitled notice',n.buyer||'',s.user_id,n.deadline_displayed||null,timestamp(),timestamp());audit(db,s.company_id,s.user_id,'workspace.created',workspaceId);return json(res,201,workspace(s,workspaceId));
      }
      const wm=path.match(/^\/api\/workspaces\/([^/]+)(?:\/(tasks|comments)(?:\/([^/]+))?)?$/);
      if(wm){
        const w=workspace(s,wm[1]);
        if(method==='GET'&&!wm[2])return json(res,200,w);
        writer(s);
        if(method==='PATCH'&&!wm[2]){
          if(!Number.isInteger(input.version)||input.version!==w.version)fail(409,'Someone else changed this tender. Reload it before saving.');
          const status=input.status??w.status;if(!['watching','reviewing','preparing','submitted','won','lost'].includes(status))fail(400,'Invalid tender stage.');
          const ownerId=input.ownerId===undefined?w.owner_id:activeMember(s.company_id,input.ownerId);const notes=input.notes===undefined?w.notes:text(input.notes,10000,false);
          const result=db.prepare('UPDATE workspaces SET status=?,owner_id=?,notes=?,version=version+1,updated_at=? WHERE id=? AND company_id=? AND version=?').run(status,ownerId,notes,timestamp(),w.id,s.company_id,input.version);
          if(result.changes!==1)fail(409,'Someone else changed this tender. Reload it before saving.');audit(db,s.company_id,s.user_id,'workspace.updated',w.id);return json(res,200,workspace(s,w.id));
        }
        if(method==='POST'&&wm[2]==='tasks'&&!wm[3]){
          db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,0)').run(id(),s.company_id,w.id,text(input.title,300),activeMember(s.company_id,input.assigneeId));audit(db,s.company_id,s.user_id,'task.created',w.id);return json(res,201,workspace(s,w.id));
        }
        if(method==='PATCH'&&wm[2]==='tasks'&&wm[3]){
          if(typeof input.done!=='boolean')fail(400,'Invalid task state.');const result=db.prepare('UPDATE tasks SET done=? WHERE id=? AND workspace_id=? AND company_id=?').run(input.done?1:0,wm[3],w.id,s.company_id);if(!result.changes)fail(404,'Task not found.');audit(db,s.company_id,s.user_id,'task.updated',w.id);return json(res,200,workspace(s,w.id));
        }
        if(method==='POST'&&wm[2]==='comments'&&!wm[3]){
          db.prepare('INSERT INTO comments VALUES (?,?,?,?,?,?)').run(id(),s.company_id,w.id,s.user_id,text(input.body,4000),timestamp());audit(db,s.company_id,s.user_id,'comment.created',w.id);return json(res,201,workspace(s,w.id));
        }
      }
      if(path==='/api/reports'&&method==='GET'){
        const preferences=db.prepare('SELECT enabled,timezone,local_time FROM report_preferences WHERE company_id=?').get(s.company_id);
        const reports=listReports(db,s.company_id);
        const receipt=db.prepare('SELECT MAX(delivered_at) AS lastDeliveredAt,COUNT(*) AS deliveryCount FROM notification_deliveries WHERE company_id=? AND user_id=?').get(s.company_id,s.user_id);
        return json(res,200,{reports,preferences:{...preferences,enabled:!!preferences.enabled},delivery:{channel:'panel',chatgptConnected:false,...receipt}});
      }
      if(path==='/api/report-preferences'&&method==='PATCH'){
        owner(s);if(typeof input.enabled!=='boolean')fail(400,'Invalid report preference.');db.prepare('UPDATE report_preferences SET enabled=? WHERE company_id=?').run(input.enabled?1:0,s.company_id);audit(db,s.company_id,s.user_id,'reports.preference_updated');return json(res,200,{ok:true});
      }
      if(path==='/api/notifications'&&method==='GET'){
        const notifications=db.prepare("SELECT d.id,d.delivered_at,d.read_at,r.report_date,r.status,r.body_json FROM notification_deliveries d JOIN reports r ON r.id=d.report_id AND r.company_id=d.company_id JOIN memberships m ON m.company_id=d.company_id AND m.user_id=d.user_id AND m.status='active' WHERE d.company_id=? AND d.user_id=? ORDER BY d.delivered_at DESC LIMIT 100").all(s.company_id,s.user_id).map(n=>({...n,body:JSON.parse(n.body_json),body_json:undefined}));return json(res,200,{notifications});
      }
      if(path==='/api/audit'&&method==='GET'){owner(s);return json(res,200,{events:db.prepare('SELECT action,entity_id,created_at FROM audit_events WHERE company_id=? ORDER BY created_at DESC LIMIT 100').all(s.company_id)});}
      fail(404,'Not found.');
    }catch(error){
      const status=error.status||500;if(status===500)console.error('Request failed:',error.code||error.name);
      if(!res.headersSent)json(res,status,{error:status===500?'The request could not be completed. Please try again.':error.message});else res.end();
    }
  };
}
