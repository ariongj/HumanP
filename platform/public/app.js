import {emptyFilters,normalize,localDay,deadlineDay,relationships,filterNotices,filterProducts,filterWorkspaces,sortNotices} from './scope.js';
'use strict';

// Company work stays in the server API. The browser keeps only the open view.
const root = document.getElementById('app');
const state = {me:null, opportunities:null, workspaces:[], reports:null, members:[], view:'today', workspaceId:null, search:'', status:'', errors:[], catalog:null, filters:emptyFilters(), filtersExpanded:false, page:1, sort:'deadline', libraryQuery:'', libraryMode:'products', loading:false,drafts:{}};
let loadSequence = 0;
let sessionEpoch = 0;
let toastTimer;
const staleRequest = () => Object.assign(new Error(''),{stale:true});
function clearSession(waitingMessage) {
  clearTimeout(filterTimer);
  sessionEpoch++;loadSequence++;
  Object.assign(state,{me:null,opportunities:null,workspaces:[],reports:null,members:[],view:'today',workspaceId:null,search:'',status:'',errors:[],catalog:null,filters:emptyFilters(),filtersExpanded:false,page:1,sort:'deadline',libraryQuery:'',libraryMode:'products',loading:false,drafts:{}});
  document.querySelectorAll('.modal-backdrop').forEach(element=>element.remove());
  clearTimeout(toastTimer);const notification=document.getElementById('toast');notification.hidden=true;notification.textContent='';
  document.title='HumanPlus · Procurement workspace';
  if(waitingMessage)root.replaceChildren(node('main',{id:'main',className:'initial-state',tabindex:'-1'},text('p',waitingMessage)));
}
async function transitionSession(path,body,signedOutMessage) {
  const csrf=state.me?.csrf;
  clearSession('Updating your session…');
  try {
    await api(path,'POST',body,{csrf});
    if(signedOutMessage)renderAuth(false,signedOutMessage);
    else await refreshAll();
  } catch(error) {
    if(error.stale)throw error;
    // A failed mutation may leave the server session valid. Re-read it rather
    // than restoring cached company data or leaving a blank transition screen.
    try {await refreshAll();} catch(recoveryError) {
      if(!recoveryError.stale){clearSession();renderAuth(false,`Connection unavailable: ${error.message}`);}
    }
    toast(error.message);
    throw error;
  }
}
const statuses = {watching:'Watching', reviewing:'Reviewing', preparing:'Preparing', submitted:'Submitted', won:'Won', lost:'Lost'};
const sectors = {healthcare:'Healthcare', it:'IT and technology', construction:'Construction', other:'Other sector'};
const canEdit = () => state.me && state.me.role !== 'viewer';
const isOwner = () => state.me?.role === 'owner';

function node(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key,value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2).toLowerCase(),value);
    else if (key === 'className') element.className = value;
    else if (key === 'checked' || key === 'disabled' || key === 'hidden' || key === 'selected') element[key] = Boolean(value);
    else if (key === 'value') element.value = value;
    else element.setAttribute(key,value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}
const text = (tag, value, className) => node(tag,{className},value);
const icon = symbol => node('span',{className:'icon','aria-hidden':'true'},symbol);
const tag = (label,tone='neutral') => node('span',{className:`tag ${tone}`},label);
const button = (label,onClick,className='button secondary',attrs={}) => node('button',{type:'button',className,onClick,...attrs},label);
const initials = name => String(name || '?').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const string = value => value === null || value === undefined ? '' : String(value);
const readableStatus = value => string(value).replaceAll('_',' ');
const memberName = id => state.members.find(m=>String(m.id)===String(id))?.name || (id ? 'Assigned team member' : 'Unassigned');
const activeMembers = () => state.members.filter(m=>m.status==='active');
function date(value,withTime=false) {
  if (!value) return 'Not available';
  const raw = string(value);
  // Portal deadlines use DD.MM.YYYY. Never let Date reinterpret them as US dates.
  if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Tirane',day:'numeric',month:'short',year:'numeric',...(withTime?{hour:'2-digit',minute:'2-digit'}:{})}).format(parsed);
}
function safeURL(value) {
  try {const url=new URL(value,location.origin);return ['https:','http:'].includes(url.protocol)?url.href:null;} catch {return null;}
}
function link(label,url,className='text-button') {
  const href=safeURL(url);
  return href?node('a',{href,className,target:'_blank',rel:'noopener noreferrer'},label):text('span','Source link unavailable','muted');
}
function notice(message,tone='info') {return node('div',{className:`notice ${tone}`,role:tone==='error'?'alert':'status'},message);}
function empty(title,description,action) {return node('div',{className:'empty'},text('span','◇','empty-mark'),text('h3',title),text('p',description),action);}
function panel(title,description,...children) {return node('section',{className:'panel'},node('div',{className:'panel-head'},node('div',{},text('h2',title),description?text('p',description):null)),children);}
function detail(label,value) {return node('div',{className:'detail-pair'},text('span',label),text('strong',value));}
function toast(message) {
  if(!message)return;
  const element=document.getElementById('toast');element.textContent=message;element.hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>{element.hidden=true;},4500);
}
async function api(path,method='GET',body,options={}) {
  const epoch=sessionEpoch;
  const headers={Accept:'application/json'};
  if(body!==undefined)headers['Content-Type']='application/json';
  const csrf=options.csrf??state.me?.csrf;
  if(method!=='GET'&&csrf)headers['X-CSRF-Token']=csrf;
  let response,result;
  try{response=await fetch(path,{method,headers,credentials:'same-origin',cache:'no-store',...(body!==undefined?{body:JSON.stringify(body)}:{})});result=await response.json();}
  catch(error){if(epoch!==sessionEpoch)throw staleRequest();throw new Error('The server could not be reached or returned an unreadable response. Please try again.');}
  if(epoch!==sessionEpoch)throw staleRequest();
  if(response.status===401&&!['/api/login','/api/accept-invitation','/api/password'].includes(path)){
    clearSession();renderAuth(false,'Your session has ended. Sign in again.');throw staleRequest();
  }
  if(!response.ok){const error=new Error(result.error||'The request could not be completed.');error.status=response.status;throw error;}
  return result;
}
function field(label,input,help) {input.setAttribute('aria-label',label);return node('label',{className:'form-field'},text('span',label),input,help?text('small',help):null);}
function input(name,options={}) {return node('input',{name,...options});}
function select(name,values,current,attrs={}) {return node('select',{name,...attrs},Object.entries(values).map(([value,label])=>node('option',{value,selected:String(current??'')===String(value)},label)));}
function formError(form,error) {
  if(error.stale||!form.isConnected)return;
  const target=form.querySelector('.form-error');target.replaceChildren(notice(error.status===409?'Someone updated this workspace. Your changes were not saved. Refresh the workspace and review the latest version before saving again.':error.message,'error'));
  target.focus();
}
function makeForm(onSubmit,...children) {
  const form=node('form',{},children,node('div',{className:'form-error',tabindex:'-1'}));
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!form.reportValidity())return;
    const submits=[...form.querySelectorAll('[type=submit]')];submits.forEach(b=>b.disabled=true);
    form.querySelector('.form-error').replaceChildren();
    try{await onSubmit(new FormData(form),form);}catch(error){formError(form,error);}finally{submits.forEach(b=>b.disabled=false);}
  });return form;
}
const submit = label => node('button',{type:'submit',className:'button'},label);
function modal(title,description,content) {
  const previous=document.activeElement;
  const overlay=node('div',{className:'modal-backdrop'});
  const close=()=>{overlay.remove();previous?.focus();};
  const box=node('section',{className:'modal',role:'dialog','aria-modal':'true','aria-labelledby':'modal-title'},node('div',{className:'modal-header'},node('div',{},node('h2',{id:'modal-title'},title),text('p',description)),button('×',close,'close-button',{'aria-label':'Close dialog'})),typeof content==='function'?content(close):content);
  overlay.append(box);overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
  overlay.addEventListener('keydown',event=>{
    if(event.key==='Escape')close();
    if(event.key==='Tab'){
      const focusable=[...box.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')];
      const first=focusable[0],last=focusable.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  });document.body.append(overlay);setTimeout(()=>box.querySelector('input,select,textarea,button')?.focus(),0);return close;
}
function parseRoute() {
  const hash=location.hash.slice(1);
  if(hash.startsWith('invite='))return {invite:new URLSearchParams(hash).get('invite')};
  if(hash.startsWith('workspace='))return {view:'workspace',workspaceId:new URLSearchParams(hash).get('workspace')};
  return {view:['today','tenders','workspaces','library','reports','team'].includes(hash)?hash:'today',workspaceId:null};
}
function go(view,id) {
  state.view=view;state.workspaceId=id||null;state.page=1;
  history.pushState({},'',view==='workspace'?`#workspace=${encodeURIComponent(id)}`:`#${view}`);render();window.scrollTo(0,0);
}
async function refreshAll() {
  const sequence=++loadSequence,epoch=sessionEpoch;state.loading=true;
  const me=await api('/api/me');
  if(sequence!==loadSequence||epoch!==sessionEpoch)throw staleRequest();
  const outcomes=await Promise.allSettled([api('/api/opportunities'),api('/api/workspaces'),api('/api/reports'),api('/api/members'),api('/api/catalog')]);
  if(sequence!==loadSequence||epoch!==sessionEpoch)throw staleRequest();
  state.me=me;state.errors=[];
  const keys=['opportunities','workspaces','reports','members','catalog'];
  outcomes.forEach((result,index)=>{
    const key=keys[index];
    if(result.status==='fulfilled')state[key]=key==='workspaces'?result.value.workspaces||[]:key==='members'?result.value.members||[]:result.value;
    else{state[key]=['workspaces','members'].includes(key)?[]:null;state.errors.push(`${key[0].toUpperCase()+key.slice(1)}: ${result.reason.message}`);}
  });state.loading=false;render();
}
async function reload() {
  try{await refreshAll();toast('Workspace refreshed.');}catch(error){handleSessionError(error);}
}
function handleSessionError(error) {
  if(error.stale)return;
  if(error.status===401){clearSession();renderAuth(false,'Your session has ended. Sign in again.');}
  else{state.loading=false;state.errors=[error.message];render();}
}
function renderAuth(invite,message='') {
  const token=invite?parseRoute().invite:null;
  const form=makeForm(async data=>{
    if(invite){await api('/api/accept-invitation','POST',{token,name:data.get('name'),password:data.get('password')});history.replaceState({},'','#today');}
    else await api('/api/login','POST',{email:data.get('email'),password:data.get('password')});
    clearSession();state.view='today';await refreshAll();
  },
    text('span',invite?'JOIN YOUR COMPANY':'YOUR PROCUREMENT WORKSPACE','eyebrow'),
    text('h2',invite?'Accept your invitation':'Welcome back'),
    text('p',invite?'Create your account to work with your team. The invitation determines your company and access.':'Sign in to review opportunities and keep your team’s tender work together.','muted'),
    message?notice(message,'info'):null,
    invite?field('Your name',input('name',{required:true,maxlength:100,autocomplete:'name',placeholder:'Full name'})):field('Email address',input('email',{type:'email',required:true,autocomplete:'username',placeholder:'you@company.com'})),
    field(invite?'Choose a password':'Password',input('password',{type:'password',required:true,...(invite?{minlength:14,maxlength:256}:{}),autocomplete:invite?'new-password':'current-password'}),invite?'Use at least 14 characters. If you already have an account, use your existing password.':''),
    submit(invite?'Join company workspace':'Sign in'),
    text('p',invite?'Your invitation is private and expires. If it no longer works, ask your company owner for a new link.':'Access is invitation only. Ask your company owner for an account.','auth-footnote')
  );form.className='auth-form';
  root.replaceChildren(node('div',{className:'auth-page'},node('aside',{className:'auth-story'},node('div',{className:'wordmark'},'Human',node('span',{},'Plus'),node('b',{},'+')),node('div',{className:'auth-story-content'},text('span','FROM PUBLICATION TO DECISION','eyebrow'),text('h1','A clearer view.\nA stronger decision.'),text('p','Source-backed procurement intelligence and a shared place for your company’s next bid.')),node('div',{className:'status-line'},node('span',{className:'status-dot'}),'Private company pilot')),node('main',{id:'main',className:'auth-main',tabindex:'-1'},form)));
}
function heading(title,description,actions=[]) {return node('div',{className:'page-heading'},node('div',{},text('span','HUMANPLUS / COMPANY WORKSPACE','eyebrow'),text('h1',title),text('p',description)),actions.length?node('div',{className:'button-row'},actions):null);}
function render() {
  if(!state.me)return;
  const routeNames={today:'Today',tenders:'Tender explorer',workspaces:'Bid pipeline',library:'Products & brands',reports:'Daily reports',workspace:'Tender workspace',team:'Team & settings'};
  const me=state.me;
  const nav=[['today','◷','Today'],['tenders','⌕','Tenders'],['workspaces','▥','Pipeline'],['library','◇','Library'],['reports','▤','Reports'],['team','⚙','Team']];
  const sidebar=node('aside',{className:'sidebar'},node('div',{className:'wordmark'},'Human',node('span',{},'Plus'),node('b',{},'+')),node('div',{className:'org-card'},text('span',initials(me.company.name),'org-avatar'),node('div',{},text('strong',me.company.name),text('small',sectors[me.company.sector]||me.company.sector))),text('span','WORKSPACE','nav-caption'),node('nav',{className:'main-nav','aria-label':'Main navigation'},nav.map(([id,symbol,label])=>button([icon(symbol),label],()=>go(id),`nav-button ${(state.view===id||id==='workspaces'&&state.view==='workspace')?'active':''}`,{'aria-current':state.view===id?'page':null}))),node('div',{className:'sidebar-bottom'},node('div',{className:'status-line'},node('span',{className:'status-dot'}),'Private pilot'),text('p','Public procurement evidence.\nPrivate company decisions.'),link('Open HumanPlus archive ↗','/archive.html','text-button')));
  const main=node('main',{id:'main',className:'page-content',tabindex:'-1'});

  if(state.me.role==='viewer')main.append(notice('You have viewer access. You can read opportunities, reports and shared tender work; changes require a member or owner.','info'));
  state.errors.forEach(error=>main.append(notice(error,'error')));
  if(['today','tenders','workspaces','library','reports'].includes(state.view))main.append(renderFilters());
  if(state.view==='today')main.append(renderToday());
  else if(state.view==='tenders')main.append(renderTenders());
  else if(state.view==='library')main.append(renderLibrary());
  else if(state.view==='reports')main.append(renderReports());
  else if(state.view==='workspaces')main.append(renderWorkspaces());
  else if(state.view==='workspace')main.append(renderWorkspace());
  else main.append(renderTeam());
  main.append(node('footer',{className:'page-meta'},text('span','HumanPlus · Company procurement workspace'),text('span','Evidence first. Verify the official dossier before bidding.')));
  root.replaceChildren(node('div',{className:'workspace'},sidebar,node('div',{className:'main-wrap'},node('header',{className:'topbar'},node('div',{className:'breadcrumb'},'Company workspace',text('span','›'),text('strong',routeNames[state.view])),node('div',{className:'topbar-right'},node('div',{className:'user-display'},text('strong',me.user.name),text('small',readableStatus(me.role))),text('span',initials(me.user.name),'user-avatar'),button('Sign out',async()=>{try{await transitionSession('/api/logout',{},'You have signed out.');}catch(error){toast(error.message);}},'logout'))),main)));
  document.title=`${routeNames[state.view]} · ${me.company.name} · HumanPlus`;
}
function stat(label,value,description,accent=false) {return node('div',{className:`stat-card ${accent?'accent':''}`},text('span',label,'stat-label'),text('strong',value),text('p',description));}
function reportList() {return Array.isArray(state.reports?.reports)?state.reports.reports:[];}
function renderToday() {
  const rows=scopedNotices(),work=scopedWorkspaces(),latest=reportList()[0],ids=new Set(rows.map(n=>n.id));
  const candidates=(latest?.opportunities||[]).filter(r=>ids.has(String(r.notice_id)));
  const day=localDay(),week=new Date(Date.parse(day)+7*86400000).toISOString().slice(0,10);
  const closing=candidates.filter(r=>r.deadline_date>=day&&r.deadline_date<=week);
  const open=work.filter(w=>!['won','lost'].includes(w.status)),tasks=open.flatMap(w=>(w.tasks||[]).filter(t=>!t.done).map(t=>({...t,workspace:w})));
  const content=node('div',{},heading('Your next opportunity starts here.','A focused view of the work that matters today.',[button('Explore tenders',()=>go('tenders'),'button'),button('Refresh',reload)]));
  content.append(node('div',{className:'status-ribbon'},tag(state.opportunities?.sourceStatus==='ok'?'Source check complete':'Source needs attention',state.opportunities?.sourceStatus==='ok'?'teal':'amber'),text('span',`Checked ${date(state.opportunities?.sourceCheckedAt,true)} · Kosovo time`),button('Source details',showSource,'text-button')));
  content.append(node('div',{className:'stat-grid premium-stats'},metric('Notices in view',rows.length,'Across all publication stages',()=>go('tenders')),metric('Closing this week',closing.length,'Candidate procedures in the latest briefing',()=>{state.filters.due='week';go('reports');}),metric('Active bids',open.length,'Watching through submitted',()=>go('workspaces')),metric('Open tasks',tasks.length,'Within the selected bid workspaces',()=>go('workspaces'))));
  const priorities=panel('Worth your attention',latest?`${candidates.length} briefing candidates match your filters. Latest report: ${date(latest.report_date)}.`:'The first saved report will appear here.');
  if(candidates.length)priorities.append(...candidates.slice(0,5).map(r=>noticeCard(rows.find(n=>n.id===String(r.notice_id)),r)),button(`Explore all ${rows.length} matching notices`,()=>go('tenders'),'button secondary wide'));
  else priorities.append(empty('No briefing candidates in this view','Adjust the connected filters or explore all publication stages.',button('Explore tenders',()=>go('tenders'))));
  const queue=panel('Your team’s next steps',`${tasks.length} incomplete tasks in the current scope.`);
  if(tasks.length)queue.append(...tasks.slice(0,6).map(t=>button([text('strong',t.title),text('small',`${memberName(t.assignee_id)} · ${t.workspace.title}`)],()=>go('workspace',t.workspace.id),'task-link')));
  else queue.append(empty('A clear task list','Save a tender to the pipeline and assign the next action to your team.',button('Open pipeline',()=>go('workspaces'))));
  const changed=rows.filter(n=>n.changedAt).sort((a,b)=>b.changedAt.localeCompare(a.changedAt)).slice(0,3);
  const changes=panel('Recently changed','Previously known notices whose source metadata changed.');
  if(changed.length)changes.append(...changed.map(n=>button([text('strong',n.title),text('small',`Updated ${date(n.changedAt,true)}`)],()=>showNotice(n),'task-link')));else changes.append(text('p','No recorded changes in this view.','muted'));
  content.append(node('div',{className:'two-col premium-columns'},priorities,node('div',{className:'stack'},queue,changes,categoryChart(rows))));
  return content;
}
function renderReport(target,report) {
  const body=report.body||report;
  target.append(node('div',{className:'report-cover'},text('span',`SAVED BRIEFING · ${date(report.report_date)}`,'eyebrow'),text('h2',report.title||'Company procurement report'),tag(readableStatus(report.status),report.status==='ready'?'teal':'amber'),body.summary?text('p',typeof body.summary==='string'?body.summary:'Source-based company briefing.'):null,node('div',{className:'status-line'},node('span',{className:'status-dot'}),`Source checked ${date(report.source_checked_at,true)}`)));
  if(body.coverage)target.append(text('p',typeof body.coverage==='string'?body.coverage:body.coverage.note||'Check the source coverage before relying on this report.','help-text'));
  if(Array.isArray(body.warnings))body.warnings.filter(warning=>warning!=='Delivery is to this application inbox; ChatGPT delivery is not connected.').forEach(warning=>target.append(notice(warning,'amber')));
  const rows=Array.isArray(body.opportunities)?body.opportunities:Array.isArray(body.entries)?body.entries:[];
  if(!rows.length)target.append(empty(['source_unavailable','insufficient_coverage'].includes(report.status)?'Opportunity count is unknown':'No opportunities in this report',['source_unavailable','insufficient_coverage'].includes(report.status)?'The source is unavailable, stale or does not cover this company’s sector. This is not evidence that no tenders exist.':'This saved report does not contain matching opportunities within the monitored coverage.'));
  for(const row of rows){
    const tenderId=row.id||row.tender_id||row.notice_id;
    const source=state.opportunities?.notices.find(n=>String(n.id)===String(tenderId));
    const title=row.title||source?.title||`Notice ${tenderId||''}`;
    const existing=state.workspaces.find(w=>String(w.tender_id)===String(tenderId));
    const why=Array.isArray(row.why_match)?row.why_match.join(' · '):row.why_match;
    const ai=row.ai_interpretation;
    target.append(node('article',{className:'report-entry'},node('div',{className:'entry-meta'},tag(row.category||source?.category||'Opportunity'),text('span',row.buyer||source?.buyer||'Buyer not available')),text('h3',title),node('div',{className:'entry-meta'},text('span',`Deadline as published: ${date(row.deadline||source?.deadline)}`)),why?text('p',why):null,Array.isArray(row.reasons)?text('p',row.reasons.join(' · ')):null,ai?node('div',{className:'entry-action'},text('strong','AI interpretation · verify against the dossier'),text('p',ai.why_match),text('p',ai.next_step)):null,row.next_step?text('div',row.next_step,'entry-action'):null,row.requirements_status==='unknown'?text('p','Requirements have not been extracted. Read the current official dossier.','help-text'):null,Array.isArray(row.evidence_gaps)&&row.evidence_gaps.length?node('ul',{className:'evidence-gaps'},row.evidence_gaps.map(g=>text('li',g))):null,node('div',{className:'entry-footer'},link('Official source ↗',row.url||row.source_url||source?.url),existing?button('Open workspace',()=>go('workspace',existing.id),'button secondary small'):tenderId&&canEdit()?button('Create workspace',()=>createWorkspace(tenderId),'button secondary small'):null)));
  }
  return target;
}
async function createWorkspace(tenderId) {
  try{const result=await api('/api/workspaces','POST',{tenderId:String(tenderId)});await refreshAll();const workspace=result.workspace||result;const id=workspace.id||state.workspaces.find(w=>String(w.tender_id)===String(tenderId))?.id;if(id)go('workspace',id);toast('Tender workspace created.');}catch(error){toast(error.message);}
}
function renderWorkspaces(){
  const rows=scopedWorkspaces();
  const content=node('div',{},heading('Keep every bid moving.','Assign ownership and move work from first review to a recorded outcome.',[button('Find a tender',()=>go('tenders'),'button')]));
  content.append(text('p',`${rows.length} of ${state.workspaces.length} workspaces match your filters. Stages record your team’s progress; verify submission and award with the official source.`,'scope-caption'));
  const board=node('div',{className:'pipeline-board','aria-label':'Bid pipeline'});
  for(const [stage,label] of Object.entries(statuses)){
    const items=rows.filter(w=>w.status===stage),column=node('section',{className:'pipeline-column'},node('div',{className:'pipeline-heading'},text('h2',label),tag(items.length)));
    if(!items.length)column.append(text('p','No bids in this stage','pipeline-empty'));
    for(const w of items){const complete=(w.tasks||[]).filter(t=>t.done).length,total=w.tasks?.length||0;
      column.append(node('article',{className:'bid-card'},button(w.title,()=>go('workspace',w.id),'table-link'),text('p',w.buyer,'muted'),text('small',`Due ${date(w.deadline)}`),node('div',{className:'bid-card-footer'},text('span',memberName(w.owner_id)),text('span',`${complete}/${total} tasks`)),field('Move bid',select('stage-'+w.id,statuses,w.status,{disabled:!canEdit(),onChange:async event=>{const control=event.target;control.disabled=true;try{await api('/api/workspaces/'+encodeURIComponent(w.id),'PATCH',{version:w.version,status:control.value});await refreshAll();toast('Bid stage updated.');}catch(error){control.value=w.status;control.disabled=false;toast(error.message);}}}))));
    }board.append(column);
  }content.append(board);return content;
}
function table(headers,rows){return node('div',{className:'table-wrap'},node('table',{},node('thead',{},node('tr',{},headers.map(h=>text('th',h)))),node('tbody',{},rows)));}
function workspaceTable(rows){return table(['Tender / buyer','Stage','Owner','Updated'],rows.map(row=>node('tr',{},node('td',{className:'cell-title'},button(row.title,()=>go('workspace',row.id),'table-link'),text('small',row.buyer||'Buyer not recorded')),node('td',{},tag(statuses[row.status]||row.status,row.status==='won'?'teal':'neutral')),text('td',memberName(row.owner_id)),text('td',date(row.updated_at),'cell-compact'))));}
function opportunityTable(rows){return table(['Opportunity / buyer','Deadline as published','Action'],rows.map(row=>{const workspace=state.workspaces.find(w=>String(w.tender_id)===String(row.id));return node('tr',{},node('td',{className:'cell-title'},text('strong',row.title),text('small',row.buyer||'Buyer not recorded'),node('div',{className:'entry-meta'},tag(row.category||'Uncategorized')),row.reasons?.length?text('small',row.reasons.join(' · ')):null,link('Official source ↗',row.url)),text('td',date(row.deadline)),node('td',{},workspace?button('Open workspace',()=>go('workspace',workspace.id),'button secondary small'):canEdit()?button('Create workspace',()=>createWorkspace(row.id),'button secondary small'):text('span','Viewer access','muted')));}));}
function renderWorkspace() {
  const workspace=state.workspaces.find(w=>String(w.id)===String(state.workspaceId));
  if(!workspace)return node('div',{},heading('Tender workspace','Shared company work.'),empty('This workspace is not available','It may belong to a different company or could not be loaded.',button('Back to workspaces',()=>go('workspaces'))));
  const source=state.opportunities?.notices.find(n=>String(n.id)===String(workspace.tender_id));
  const content=node('div',{},button('← All tender workspaces',()=>go('workspaces'),'text-button back-button'),heading('Make the next decision','Keep ownership, progress and the supporting discussion in one place.',[button('Refresh workspace',reload)]),node('section',{className:'tender-summary'},node('div',{className:'entry-meta'},tag(statuses[workspace.status]||workspace.status,'teal'),text('span',`Source notice ${workspace.tender_id}`)),text('h2',workspace.title),text('p',workspace.buyer||'Buyer not recorded'),node('div',{className:'entry-meta'},text('span',`Deadline: ${date(workspace.deadline||source?.deadline)}`),source?link('Official dossier ↗',source.url):null,source?button('Products & source details',()=>showNotice(source),'text-button'):null)));
  const draftKey=`${state.me.user.id}:${state.me.company.id}:${workspace.id}`;
  const draft=state.drafts[draftKey];
  const values=draft||workspace;
  const version=values.version;
  const ownerValues={'':'Unassigned',...Object.fromEntries(activeMembers().filter(m=>m.role!=='viewer').map(m=>[m.id,m.name]))};
  if(workspace.owner_id&&!ownerValues[workspace.owner_id])ownerValues[workspace.owner_id]=memberName(workspace.owner_id);
  const editForm=makeForm(async data=>{await api(`/api/workspaces/${encodeURIComponent(workspace.id)}`,'PATCH',{version,status:data.get('status'),ownerId:data.get('owner')||null,notes:data.get('notes')});delete state.drafts[draftKey];await refreshAll();toast('Workspace updated.');},draft&&draft.version!==workspace.version?notice('The saved workspace changed while you were editing. Your draft is preserved below. Copy any text you need, then discard the draft to load the latest saved version.','amber'):null,node('div',{className:'field-row'},field('Pipeline stage',select('status',statuses,values.status,{disabled:!canEdit()})),field('Workspace owner',select('owner',ownerValues,values.owner_id||'',{disabled:!canEdit()}))),field('Decision and working notes',node('textarea',{name:'notes',rows:6,maxlength:10000,disabled:!canEdit(),placeholder:'What is the opportunity? What needs verification? Record the reason for the next decision.'},values.notes||''),'Edits are unsaved until you choose Save workspace. A pipeline stage is not proof of official submission or award.'),canEdit()?node('div',{className:'button-row'},submit('Save workspace'),button('Discard unsaved edits',()=>{delete state.drafts[draftKey];render();})):text('p','Read only · A member or owner can update this workspace.','read-only-note'));
  const rememberDraft=()=>{const data=new FormData(editForm);state.drafts[draftKey]={version,status:data.get('status'),owner_id:data.get('owner')||null,notes:data.get('notes')};};
  editForm.addEventListener('input',rememberDraft);editForm.addEventListener('change',rememberDraft);
  const tasks=panel('Tasks','Assign the next concrete step to a teammate.');
  if(workspace.tasks?.length)tasks.append(...workspace.tasks.map(task=>node('div',{className:`task-item ${task.done?'completed':''}`},input('task-'+task.id,{type:'checkbox',checked:task.done,disabled:!canEdit(),'aria-label':`Mark ${task.title} ${task.done?'incomplete':'complete'}`,onChange:async event=>{const checkbox=event.target;checkbox.disabled=true;try{await api(`/api/workspaces/${encodeURIComponent(workspace.id)}/tasks/${encodeURIComponent(task.id)}`,'PATCH',{done:checkbox.checked});await refreshAll();}catch(error){checkbox.checked=!checkbox.checked;checkbox.disabled=false;toast(error.message);}}}),node('div',{className:'task-text'},text('strong',task.title),text('small',memberName(task.assignee_id))))));
  else tasks.append(text('p','No tasks yet.','help-text'));
  if(canEdit())tasks.append(makeForm(async data=>{await api(`/api/workspaces/${encodeURIComponent(workspace.id)}/tasks`,'POST',{title:data.get('title'),assigneeId:data.get('assignee')||null});await refreshAll();toast('Task added.');},text('div','ADD A TASK','form-section-label'),field('Task',input('title',{required:true,maxlength:300,placeholder:'Read the latest specification'})),field('Assigned to',select('assignee',ownerValues,'')),submit('Add task')));
  const discussion=panel('Team discussion','Notes are saved with their author and time.');
  if(workspace.comments?.length)discussion.append(...workspace.comments.map(comment=>node('article',{className:'note-item'},node('div',{className:'note-meta'},text('strong',comment.author_name),text('span',date(comment.created_at,true))),text('p',comment.body))));
  else discussion.append(text('p','No discussion yet. Add context for the next person reviewing this tender.','help-text'));
  if(canEdit())discussion.append(makeForm(async data=>{await api(`/api/workspaces/${encodeURIComponent(workspace.id)}/comments`,'POST',{body:data.get('body')});await refreshAll();toast('Comment added.');},field('Add a comment',node('textarea',{name:'body',required:true,maxlength:4000,rows:3,placeholder:'Share a source, question or decision context…'})),submit('Post comment')));
  content.append(node('div',{className:'two-col'},node('div',{className:'stack'},panel('Workspace details',`Last updated ${date(workspace.updated_at,true)} · Version ${workspace.version}`,editForm),discussion),tasks));return content;
}
function renderTeam() {
  const me=state.me;
  const content=node('div',{},heading('Your team & settings','Manage company context, access and the reports your team receives.',[button('Refresh',reload)]));
  if(me.companies?.length>1)content.append(panel('Switch company','Each company has its own members, tender workspaces and reports.',field('Active company',select('company',Object.fromEntries(me.companies.map(c=>[c.id,c.name])),me.company.id,{onChange:async event=>{try{await transitionSession('/api/switch-company',{companyId:event.target.value});toast('Company switched.');}catch(error){toast(error.message);render();}}}))));
  const companyForm=makeForm(async data=>{await api('/api/company','PATCH',{name:data.get('name'),sector:data.get('sector'),interests:string(data.get('interests')).split('\n').map(s=>s.trim()).filter(Boolean)});await refreshAll();toast('Company profile saved.');},field('Company name',input('name',{value:me.company.name,required:true,maxlength:160,disabled:!isOwner()})),field('Sector',select('sector',sectors,me.company.sector,{disabled:!isOwner()})),field('Interests',node('textarea',{name:'interests',rows:4,maxlength:4000,disabled:!isOwner(),placeholder:'One product, service or interest per line'},(me.company.interests||[]).join('\n')),'Interest terms guide matching. They do not establish your inventory, licences or eligibility.'),isOwner()?submit('Save company profile'):text('p','Only a company owner can change this profile.','read-only-note'));
  const pref=state.reports?.preferences;
  const reporting=panel('Daily reports','Reports are saved for your company, independently of the public archive.',node('div',{className:'detail-list'},detail('Schedule',pref?`${pref.local_time||'10:00'} · ${pref.timezone||'Europe/Tirane'}`:'Not available'),detail('Destination','This company panel'),detail('Private ChatGPT delivery','Not connected')),notice('Saving these settings does not activate a ChatGPT schedule. Private ChatGPT notifications still require a supported, verified connection.','amber'));
  if(pref&&isOwner())reporting.append(makeForm(async data=>{await api('/api/report-preferences','PATCH',{enabled:data.get('enabled')==='on'});await refreshAll();toast('Report preference saved.');},node('label',{className:'checkbox-label'},input('enabled',{type:'checkbox',checked:pref.enabled}),'Generate daily company reports'),submit('Save reporting preference')));
  else if(pref)reporting.append(text('p',pref.enabled?'Daily reports are enabled. Only an owner can change this.':'Daily reports are paused. Only an owner can change this.','read-only-note'));
  content.append(node('div',{className:'equal-col'},panel('Company profile','The context your team uses to evaluate opportunities.',companyForm),reporting));
  const team=panel('Company members','Owners manage access. Members work on tenders. Viewers can read.');
  if(state.members.length)team.append(table(['Member','Role','Access',...(isOwner()?['Action']:[])],state.members.map(member=>node('tr',{},node('td',{},node('div',{className:'member-cell'},text('span',initials(member.name),'member-avatar'),node('div',{},text('strong',member.name),text('small',member.email)))),text('td',readableStatus(member.role)),node('td',{},tag(readableStatus(member.status),member.status==='active'?'teal':'amber')),isOwner()?node('td',{},String(member.id)===String(me.user.id)?text('span','Your account','muted'):button(member.status==='active'?'Revoke access':'Restore access',()=>changeAccess(member),'button secondary small')):null))));
  else team.append(empty('Member directory unavailable','Refresh the workspace to try loading your team again.'));
  if(isOwner())team.append(node('div',{className:'button-row spaced'},button('Invite a teammate',showInvitation,'button'),button('Create another company',showCreateCompany)));
  content.append(team,panel('Your account','Use a unique password. Changing it signs you out of all sessions.',node('div',{className:'detail-list'},detail('Name',me.user.name),detail('Email',me.user.email)),node('div',{className:'button-row spaced'},button('Change password',showPassword))));return content;
}
function showInvitation() {
  modal('Invite a teammate','Create a private invitation link. You decide how to share it.',close=>makeForm(async(data,form)=>{
    const result=await api('/api/invitations','POST',{email:data.get('email'),role:data.get('role')});
    const url=safeURL(result.inviteUrl);if(!url)throw new Error('The server returned an invalid invitation link.');
    form.replaceChildren(notice('Invitation created. No email has been sent. Share this private link with the intended person.','info'),text('div',url,'invitation-link'),text('p',`Expires ${date(result.expiresAt,true)}.`,'help-text'),node('div',{className:'button-row'},button('Copy invitation link',async()=>{try{await navigator.clipboard.writeText(url);toast('Invitation link copied.');}catch{toast('Copy is unavailable here. Select and copy the invitation link above.');}},'button'),button('Done',close)));
  },field('Teammate’s email',input('email',{type:'email',required:true,maxlength:254,autocomplete:'email'})),field('Access level',select('role',{member:'Member · edit tender work',viewer:'Viewer · read only'},'member')),text('p','The invitation gives access only to this company. The recipient creates their own password.','role-description'),node('div',{className:'modal-footer'},button('Cancel',close),submit('Create invitation'))));
}
function changeAccess(member) {
  const revoke=member.status==='active';
  modal(revoke?'Revoke company access':'Restore company access',`${member.name} · ${member.email}`,close=>makeForm(async()=>{await api(`/api/members/${encodeURIComponent(member.id)}`,'PATCH',{status:revoke?'revoked':'active'});close();await refreshAll();toast(revoke?'Company access revoked.':'Company access restored.');},text('p',revoke?'This person will lose access to this company. Their recorded work remains in the workspace.':'This person will regain access to this company with their existing role.','help-text'),node('div',{className:'modal-footer'},button('Cancel',close),submit(revoke?'Revoke access':'Restore access'))));
}
function showCreateCompany() {
  modal('Create a company workspace','Start a separate company with its own team and tender work.',close=>makeForm(async data=>{await transitionSession('/api/companies',{name:data.get('name'),sector:data.get('sector')});toast('Company created. You are now in its separate workspace.');},field('Company name',input('name',{required:true,maxlength:160})),field('Sector',select('sector',sectors,'healthcare')),node('div',{className:'modal-footer'},button('Cancel',close),submit('Create company'))));
}
function showPassword() {
  modal('Change your password','All sessions, including this one, will be signed out after the change.',close=>makeForm(async data=>{if(data.get('newPassword')!==data.get('confirmPassword'))throw new Error('The new passwords do not match.');await transitionSession('/api/password',{currentPassword:data.get('currentPassword'),newPassword:data.get('newPassword')},'Password updated. Sign in with your new password.');},field('Current password',input('currentPassword',{type:'password',required:true,autocomplete:'current-password'})),field('New password',input('newPassword',{type:'password',required:true,minlength:14,maxlength:256,autocomplete:'new-password'}),'At least 14 characters.'),field('Confirm new password',input('confirmPassword',{type:'password',required:true,minlength:14,maxlength:256,autocomplete:'new-password'})),node('div',{className:'modal-footer'},button('Cancel',close),submit('Change password'))));
}
const noticeKinds={tender_notice:'Tender notice',award_notice:'Award',signing_notice:'Contract signing',correction_notice:'Correction',cancellation_notice:'Cancellation',decision_notice:'Decision',other_notice:'Other notice'};
function scopedNotices(){return filterNotices(state.opportunities?.notices||[],state.filters,{products:state.catalog?.products||[],links:state.catalog?.links||[],workspaces:state.workspaces});}
function scopedWorkspaces(){return filterWorkspaces(state.workspaces,scopedNotices(),state.filters);}
function hasFilters(){return Object.values(state.filters).some(Boolean);}
function choices(rows,key,label){return {'':label,...Object.fromEntries([...new Set(rows.map(r=>r[key]).filter(v=>v!==null&&v!==undefined&&v!==''))].sort((a,b)=>String(a).localeCompare(String(b))).map(v=>[v,v]))};}
function applyFilter(key,value){state.filters[key]=value;if(key==='brand'||key==='supplier')state.filters.product='';state.page=1;render();}
function resetFilters(){state.filters=emptyFilters();state.page=1;render();}
let filterTimer;
function renderFilters(){
  const rows=state.opportunities?.notices||[],products=state.catalog?.products||[];
  const pick=(key,label,options)=>field(label,select('filter-'+key,options,state.filters[key],{onChange:e=>applyFilter(key,e.target.value)}));
  const query=input('global-search',{type:'search',value:state.filters.q,placeholder:'Search tenders, buyers, CPV…',onInput:e=>{const value=e.target.value,position=e.target.selectionStart;clearTimeout(filterTimer);filterTimer=setTimeout(()=>{applyFilter('q',value);const next=document.querySelector('[name="global-search"]');next?.focus();next?.setSelectionRange(position,position);},220);}});
  const primary=node('div',{className:'filter-primary'},field('Search tenders',query),pick('year','Year',choices(rows,'year','All years')),pick('category','Tender category',choices(rows,'category','All categories')),pick('brand','Brand',choices(products,'brand','All brands')));
  const more=node('details',{className:'more-filters',open:state.filtersExpanded,onToggle:e=>{state.filtersExpanded=e.currentTarget.open;}},node('summary',{},'More filters'),node('div',{className:'filter-extra'},pick('buyer','Buyer',choices(rows,'buyer','All buyers')),pick('kind','Publication stage',{'':'All publication stages',...noticeKinds}),pick('due','Deadline',{'':'Any deadline',week:'Next 7 days',future:'Today or later',expired:'Before today',unknown:'Not stated'}),pick('product','Product',{'':'All products',...Object.fromEntries(products.filter(p=>!state.filters.brand||p.brand===state.filters.brand).map(p=>[p.id,p.name]))}),pick('supplier','Recorded supplier',choices(products,'supplier','All recorded suppliers')),pick('stage','Bid stage',{'':'All bid stages',unsaved:'Not in pipeline',...statuses}),pick('owner','Bid owner',{'':'Anyone',unassigned:'Unassigned',...Object.fromEntries(state.members.map(m=>[m.id,m.name]))})));
  const active=Object.entries(state.filters).filter(([,v])=>v).map(([k,v])=>button(`${k==='product'?products.find(p=>p.id===v)?.name||v:v} ×`,()=>applyFilter(k,''),'filter-chip',{'aria-label':`Remove ${k} filter`}));
  return node('section',{className:'global-filters','aria-label':'Connected filters'},node('div',{className:'filter-top'},text('strong','Connected filters'),text('span','Today · Tenders · Pipeline · Library · Reports'),hasFilters()?button('Clear all',resetFilters,'text-button'):null),primary,node('div',{className:'filter-bottom'},more,node('div',{className:'active-filters'},active)),state.filters.brand||state.filters.product||state.filters.supplier?text('p','Library filters use exact procedure links, model-name mentions and your team’s saved links. They do not imply brand authorization or product compatibility.','help-text'):null);
}
function metric(label,value,description,action){return button([text('span',label,'stat-label'),text('strong',value),text('p',description)],action,'stat-card metric-button');}
function categoryChart(rows){const counts=new Map();for(const r of rows)counts.set(r.category||'Unclassified',(counts.get(r.category||'Unclassified')||0)+1);const items=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,5),max=Math.max(1,...items.map(x=>x[1]));return panel('Notice mix','Top categories within the connected filters.',items.length?node('div',{className:'category-chart'},items.map(([name,count])=>button([node('span',{className:'chart-label'},text('span',name),text('strong',count)),node('meter',{min:0,max,value:count,'aria-label':`${name}: ${count} notices`})],()=>applyFilter('category',name),'chart-row'))):text('p','No notices match this view.','muted'));}
function showSource(){const s=state.opportunities;modal('Source & reporting','Your current collection and delivery state.',node('div',{},node('div',{className:'detail-list'},detail('Source check',date(s?.sourceCheckedAt,true)),detail('Collector',readableStatus(s?.collection?.status)),detail('Daily collection','09:00 · Kosovo'),detail('Daily report','10:00 · Kosovo'),detail('AI briefing',readableStatus(s?.aiStatus)),detail('Delivery','Private panel inbox'),detail('ARI / ChatGPT','Not connected')),text('p',s?.coverageNote,'help-text'),s?.collection?.error?notice(s.collection.error,'amber'):null,link('Open historical research archive ↗','/archive.html')));}
function noticeCard(n,report){if(!n)return null;const saved=state.workspaces.find(w=>w.tender_id===n.id);return node('article',{className:'opportunity-card'},node('div',{className:'entry-meta'},tag(n.category||'Unclassified','teal'),text('span',`Due ${date(n.deadline)}`)),button(n.title,()=>showNotice(n,report),'opportunity-title'),text('p',n.buyer,'muted'),report?.ai_interpretation?text('p',report.ai_interpretation.why_match,'match-copy'):null,node('div',{className:'card-actions'},button('Review details',()=>showNotice(n,report),'text-button'),saved?button('Open bid',()=>go('workspace',saved.id),'button secondary small'):canEdit()?button('Add to pipeline',()=>createWorkspace(n.id),'button secondary small'):null));}
function showNotice(n,report){
  report=report||reportList()[0]?.opportunities?.find(r=>String(r.notice_id)===n.id);
  const related=relationships(n,state.catalog?.products||[],state.catalog?.links||[]);
  const content=node('div',{},node('div',{className:'entry-meta'},tag(noticeKinds[n.classification]||n.classification),tag(n.category||'Unclassified')),node('div',{className:'detail-list'},detail('Buyer',n.buyer),detail('Deadline as published',date(n.deadline)),detail('Published',date(n.publishedAt)),detail('Procedure',n.procedure||'Not recorded'),detail('CPV',n.cpv||'Not recorded')),report?.ai_interpretation?node('div',{className:'entry-action'},text('strong','Why it is worth reviewing'),text('p',report.ai_interpretation.why_match),text('strong','Next verification step'),text('p',report.ai_interpretation.next_step)):null,text('p','Requirements, lot status and eligibility must be verified in the official dossier. Deadline timezone is not stated in portal metadata.','help-text'),link('Read the official notice ↗',n.url),text('h3','Related products','spaced'));
  if(related.length)for(const r of related){const product=state.catalog.products.find(p=>p.id===r.productId);content.append(node('div',{className:'relation-row'},button(product.name,()=>showProduct(product),'text-button'),tag(r.basis),text('small',r.reason),r.basis==='Team link'&&canEdit()?button('Unlink',async()=>{try{await api('/api/catalog-links','DELETE',{productId:product.id,noticeId:n.id});document.querySelectorAll('.modal-backdrop').forEach(x=>x.remove());await refreshAll();toast('Product link removed.');}catch(error){toast(error.message);}},'text-button'):null));}
  else content.append(text('p','No evidenced product connections yet.','muted'));
  if(canEdit())content.append(button('Link a product',()=>showProductLink(n),'button secondary spaced'));
  modal(n.title,'Official notice metadata and your company’s working context.',content);
}
function showProductLink(n){modal('Link a product','Record why this product is relevant. A team link is not proof of tender eligibility.',close=>makeForm(async data=>{await api('/api/catalog-links','POST',{productId:data.get('product'),noticeId:n.id,reason:data.get('reason')});close();document.querySelectorAll('.modal-backdrop').forEach(x=>x.remove());await refreshAll();toast('Product connected to tender.');},field('Product',select('product',Object.fromEntries((state.catalog?.products||[]).map(p=>[p.id,`${p.brand} · ${p.name}`])),'')),field('Reason for this connection',node('textarea',{name:'reason',required:true,maxlength:500,rows:3})),submit('Save connection')));}
function pagination(total,onChange){const pages=Math.max(1,Math.ceil(total/25));state.page=Math.min(state.page,pages);return node('div',{className:'pagination'},text('span',total?`${(state.page-1)*25+1}–${Math.min(state.page*25,total)} of ${total}`:'0 results'),node('div',{className:'button-row'},button('Previous',()=>onChange(state.page-1),'button secondary small',{disabled:state.page<=1}),text('span',`Page ${state.page} of ${pages}`),button('Next',()=>onChange(state.page+1),'button secondary small',{disabled:state.page>=pages})));}
function exportNotices(rows){const cell=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const data=[['Title','Buyer','Category','Year','Publication stage','Deadline as published','Official source'],...rows.map(n=>[n.title,n.buyer,n.category,n.year,n.classification,n.deadline,n.url])].map(r=>r.map(cell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+data],{type:'text/csv;charset=utf-8'})),a=node('a',{href:url,download:'HumanPlus-filtered-tenders.csv'});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function renderTenders(){
 const rows=sortNotices(scopedNotices(),state.sort),total=state.opportunities?.notices.length||0;
 const content=node('div',{},heading('Find the right opportunity.','Explore every notice in the connected source, with the evidence one click away.',[button('Export filtered CSV',()=>exportNotices(rows)),button('Refresh',reload)]));
 const pager=pagination(rows.length,p=>{state.page=p;render();});
 const controls=node('div',{className:'explorer-toolbar'},text('strong',`${rows.length} of ${total} notices`),field('Sort by',select('tender-sort',{deadline:'Deadline: earliest first',newest:'Publication: newest first',title:'Title: A–Z',buyer:'Buyer: A–Z'},state.sort,{onChange:e=>{state.sort=e.target.value;state.page=1;render();}})));
 const slice=rows.slice((state.page-1)*25,state.page*25);
 const tableRows=slice.map(n=>{const saved=state.workspaces.find(w=>w.tender_id===n.id),related=relationships(n,state.catalog?.products||[],state.catalog?.links||[]);return node('tr',{},node('td',{className:'cell-title'},button(n.title,()=>showNotice(n),'table-link'),text('small',n.buyer),related.length?text('small',`${related.length} related product${related.length===1?'':'s'}`):null),node('td',{},tag(n.category||'Unclassified'),text('small',n.year||'Year not recorded')),node('td',{},tag(noticeKinds[n.classification]||'Other'),saved?text('small',`Pipeline: ${statuses[saved.status]}`):null),node('td',{},text('strong',date(n.deadline)),text('small',`Published ${date(n.publishedAt)}`)),node('td',{},saved?button('Open bid',()=>go('workspace',saved.id),'button secondary small'):canEdit()?button('Add to pipeline',()=>createWorkspace(n.id),'button secondary small'):text('span','Viewer')));});
 content.append(node('section',{className:'panel explorer-panel'},controls,rows.length?table(['Notice / buyer','Category / year','Publication / bid stage','Deadline','Action'],tableRows):empty('No tenders match these filters','Clear a filter or reset the view to see all available notices.',button('Clear filters',resetFilters)),pager));
 content.append(text('p',state.opportunities?.coverageNote||'Source coverage unavailable.','help-text'));return content;
}
function renderReports(){
 const all=reportList(),ids=new Set(scopedNotices().map(n=>n.id)),content=node('div',{},heading('Your daily briefing.','Saved reports at 10:00 Kosovo time, with the source and next steps together.',[button('Source & delivery',showSource)]));
 if(!all.length){content.append(empty('No reports yet','Your daily briefing will appear after the reporting service runs.'));return content;}
 const latest=all[0],filtered=(latest.opportunities||[]).filter(r=>!hasFilters()||ids.has(String(r.notice_id))),pager=pagination(filtered.length,p=>{state.page=p;render();});
 content.append(node('div',{className:'report-summary-line'},tag(readableStatus(latest.status),latest.status==='ready'?'teal':'amber'),text('span',`${date(latest.report_date)} · ${filtered.length} displayed-snapshot candidates match filters · ${latest.counts?.actionable??'Unknown'} in the full saved report`)));
 const display={...latest,opportunities:filtered.slice((state.page-1)*25,state.page*25),summary:hasFilters()?`${filtered.length} saved candidates match the connected filters.`:latest.summary};
 content.append(renderReport(node('section',{className:'panel'}),display),pager);
 if((latest.counts?.actionable||0)>(latest.opportunities?.length||0))content.append(notice('This older saved briefing retained a limited candidate snapshot. All available source notices can be explored in Tenders.'));
 if(all.length>1)content.append(panel('Report history','Earlier snapshots retain their original source date.',...all.slice(1).map(r=>button([text('strong',date(r.report_date)),text('small',`${readableStatus(r.status)} · ${hasFilters()?(r.opportunities||[]).filter(x=>ids.has(String(x.notice_id))).length:r.opportunities?.length??'Unknown'} saved candidates${hasFilters()?' in this view':''}`)],()=>{const historical={...r,opportunities:(r.opportunities||[]).filter(x=>!hasFilters()||ids.has(String(x.notice_id)))};modal(r.title,hasFilters()?'Historical snapshot filtered to notices in the current connected view.':'Historical report snapshot.',renderReport(node('div'),historical));},'task-link'))));return content;
}
function renderLibrary(){
 const products=state.catalog?.products||[],rows=filterProducts(products,state.filters,scopedNotices(),state.opportunities?.notices||[],state.catalog?.links||[]).filter(p=>normalize([p.name,p.brand,p.category,p.supplier].join(' ')).includes(normalize(state.libraryQuery)));
 const brands=[...new Set(rows.map(p=>p.brand))];
 const content=node('div',{},heading('Products, brands & evidence.','Your company catalogue alongside the product research you supplied.',canEdit()?[button('Add company product',()=>editProduct(),'button')]:[]));
 const inputBox=input('library-search',{type:'search',placeholder:'Search products, models or suppliers…',value:state.libraryQuery,onInput:e=>{const value=e.target.value;clearTimeout(filterTimer);filterTimer=setTimeout(()=>{state.libraryQuery=value;render();const f=document.querySelector('[name="library-search"]');f?.focus();f?.setSelectionRange(value.length,value.length);},220);}});
 content.append(node('div',{className:'library-toolbar'},node('div',{className:'segmented'},button('Products',()=>{state.libraryMode='products';render();},state.libraryMode==='products'?'selected':''),button('Brands',()=>{state.libraryMode='brands';render();},state.libraryMode==='brands'?'selected':'')),field('Search library',inputBox),text('span',`${rows.length} products · ${brands.length} brand labels`)));
 content.append(text('p','Research records describe historical product references. They do not establish your inventory, brand representation or a current offer.','scope-caption'));
 if(!rows.length)content.append(empty('No products in this view','Tender filters show only products with an evidenced connection to matching notices. Clear the filters and library search to explore the full library.',button('Clear filters and search',()=>{state.libraryQuery='';resetFilters();})));
 else if(state.libraryMode==='brands')content.append(node('div',{className:'library-grid'},brands.map(brand=>{const group=rows.filter(p=>p.brand===brand);return node('article',{className:'product-card'},text('span',initials(brand),'brand-mark'),text('h2',brand),text('p',`${group.length} product references`),text('p',[...new Set(group.map(p=>p.category).filter(Boolean))].join(' · '),'muted'),button('Explore brand',()=>{state.filters.brand=brand;state.filters.product='';state.libraryMode='products';state.page=1;render();},'button secondary'));})));
 else content.append(node('div',{className:'library-grid'},rows.map(p=>{const linked=(state.opportunities?.notices||[]).filter(n=>relationships(n,[p],state.catalog?.links||[]).length).length;return node('article',{className:'product-card'},node('div',{className:'product-top'},text('span',initials(p.brand),'brand-mark'),tag(p.origin==='research'?'Research reference':'Company entry',p.origin==='research'?'neutral':'teal')),text('p',p.brand,'product-brand'),text('h2',p.name),text('p',p.category||'Category not set','muted'),text('p',p.supplier?`Recorded supplier: ${p.supplier}`:'Supplier not recorded','help-text'),node('div',{className:'card-actions'},button('View evidence',()=>showProduct(p),'text-button'),button(`${linked} related notices`,()=>{state.filters.product=p.id;state.filters.brand='';go('tenders');},'button secondary small')));})));return content;
}
function showProduct(p){const all=state.opportunities?.notices||[],related=all.filter(n=>relationships(n,[p],state.catalog?.links||[]).length);modal(p.name,p.brand,node('div',{},tag(p.origin==='research'?'Supplied research · checked '+(p.source_checked_at||'date not recorded'):'Company entry · verify supporting evidence'),text('p',p.specifications_sq||p.notes||'No specifications recorded.','spaced'),node('div',{className:'detail-list'},detail('Category',p.category||'Not set'),detail('Recorded supplier',p.supplier||'Not recorded'),detail('Procurement role',p.procurement_role||'Company research entry')),p.verification_status?text('p',p.verification_status,'help-text'):null,p.notes_sq?text('p',p.notes_sq,'help-text'):null,node('div',{className:'button-row'},p.manufacturer_source_url?link('Manufacturer source ↗',p.manufacturer_source_url):null,p.procurement_source_url?link('Procurement evidence ↗',p.procurement_source_url):null,p.source_url?link('Supporting source ↗',p.source_url):null),text('h3',`${related.length} related source notices`,'spaced'),...related.slice(0,6).map(n=>button(n.title,()=>showNotice(n),'task-link')),related.length>6?button('Explore all related notices',()=>{document.querySelectorAll('.modal-backdrop').forEach(x=>x.remove());state.filters.product=p.id;go('tenders');}):null,canEdit()&&!p.readOnly?button('Edit company product',()=>editProduct(p),'button secondary spaced'):null));}
function editProduct(product){modal(product?'Edit company product':'Add company product','Keep product details and supporting evidence in your company’s private library.',close=>makeForm(async data=>{const body={name:data.get('name'),brand:data.get('brand'),category:data.get('category'),supplier:data.get('supplier'),notes:data.get('notes'),...(product?{version:product.version}:{sourceUrl:data.get('sourceUrl')})};await api(product?'/api/catalog/'+encodeURIComponent(product.id):'/api/catalog',product?'PATCH':'POST',body);close();document.querySelectorAll('.modal-backdrop').forEach(x=>x.remove());await refreshAll();toast('Company product saved.');},field('Product or model',input('name',{required:true,maxlength:180,value:product?.name||''})),field('Brand',input('brand',{required:true,maxlength:160,value:product?.brand||''})),node('div',{className:'field-row'},field('Category',input('category',{maxlength:120,value:product?.category||''})),field('Supplier',input('supplier',{maxlength:160,value:product?.supplier||''}))),!product?field('Supporting source URL',input('sourceUrl',{type:'url',maxlength:1000,placeholder:'https://…'})):null,field('Notes and verification needed',node('textarea',{name:'notes',rows:4,maxlength:4000},product?.notes||'')),submit(product?'Save product':'Add product')));}

window.addEventListener('popstate',()=>{const route=parseRoute();if(route.invite){clearSession();renderAuth(true);return;}Object.assign(state,route);if(state.me)render();});
(async()=>{
  const route=parseRoute();if(route.invite){clearSession();renderAuth(true);return;}
  Object.assign(state,route);
  try{await refreshAll();}catch(error){if(error.stale)return;if(error.status===401){clearSession();renderAuth(false);}else renderAuth(false,`Connection unavailable: ${error.message}`);}
})();
