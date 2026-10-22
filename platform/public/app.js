'use strict';

// Company work stays in the server API. The browser keeps only the open view.
const root = document.getElementById('app');
const state = {me:null, opportunities:null, workspaces:[], reports:null, members:[], view:'today', workspaceId:null, search:'', status:'', errors:[], loading:false,drafts:{}};
let loadSequence = 0;
let toastTimer;
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
  const element=document.getElementById('toast');element.textContent=message;element.hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>{element.hidden=true;},4500);
}
async function api(path,method='GET',body) {
  const headers={Accept:'application/json'};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(method!=='GET'&&state.me?.csrf)headers['X-CSRF-Token']=state.me.csrf;
  const response=await fetch(path,{method,headers,credentials:'same-origin',cache:'no-store',...(body!==undefined?{body:JSON.stringify(body)}:{})});
  let result;
  try{result=await response.json();}catch{throw new Error('The server returned an unreadable response. Please try again.');}
  if(!response.ok){const error=new Error(result.error||'The request could not be completed.');error.status=response.status;throw error;}
  return result;
}
function field(label,input,help) {input.setAttribute('aria-label',label);return node('label',{className:'form-field'},text('span',label),input,help?text('small',help):null);}
function input(name,options={}) {return node('input',{name,...options});}
function select(name,values,current,attrs={}) {return node('select',{name,...attrs},Object.entries(values).map(([value,label])=>node('option',{value,selected:String(current??'')===String(value)},label)));}
function formError(form,error) {
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
  return {view:['today','workspaces','team'].includes(hash)?hash:'today',workspaceId:null};
}
function go(view,id) {
  state.view=view;state.workspaceId=id||null;state.search='';state.status='';
  history.pushState({},'',view==='workspace'?`#workspace=${encodeURIComponent(id)}`:`#${view}`);render();window.scrollTo(0,0);
}
async function refreshAll() {
  const sequence=++loadSequence;state.loading=true;
  const me=await api('/api/me');
  const outcomes=await Promise.allSettled([api('/api/opportunities'),api('/api/workspaces'),api('/api/reports'),api('/api/members')]);
  if(sequence!==loadSequence)return;
  state.me=me;state.errors=[];
  const keys=['opportunities','workspaces','reports','members'];
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
  if(error.status===401){state.me=null;renderAuth(false,'Your session has ended. Sign in again.');}
  else{state.loading=false;state.errors=[error.message];render();}
}
function renderAuth(invite,message='') {
  const token=invite?parseRoute().invite:null;
  const form=makeForm(async data=>{
    if(invite){await api('/api/accept-invitation','POST',{token,name:data.get('name'),password:data.get('password')});history.replaceState({},'','#today');}
    else await api('/api/login','POST',{email:data.get('email'),password:data.get('password')});
    state.view='today';await refreshAll();
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
  const routeNames={today:'Today & reports',workspaces:'Tender workspaces',workspace:'Tender workspace',team:'Team & settings'};
  const me=state.me;
  const nav=[['today','◷','Today & reports'],['workspaces','▤','Tender workspaces'],['team','⚙','Team & settings']];
  const sidebar=node('aside',{className:'sidebar'},node('div',{className:'wordmark'},'Human',node('span',{},'Plus'),node('b',{},'+')),node('div',{className:'org-card'},text('span',initials(me.company.name),'org-avatar'),node('div',{},text('strong',me.company.name),text('small',sectors[me.company.sector]||me.company.sector))),text('span','WORKSPACE','nav-caption'),node('nav',{className:'main-nav','aria-label':'Main navigation'},nav.map(([id,symbol,label])=>button([icon(symbol),label],()=>go(id),`nav-button ${(state.view===id||id==='workspaces'&&state.view==='workspace')?'active':''}`,{'aria-current':state.view===id?'page':null}))),node('div',{className:'sidebar-bottom'},node('div',{className:'status-line'},node('span',{className:'status-dot'}),'Private pilot'),text('p','Public procurement evidence.\nPrivate company decisions.'),link('Open HumanPlus archive ↗','/archive.html','text-button')));
  const main=node('main',{id:'main',className:'page-content',tabindex:'-1'});
  main.append(notice('Private pilot · Company work is saved to this workspace. The existing HumanPlus archive stays separate.','info'));
  if(state.me.role==='viewer')main.append(notice('You have viewer access. You can read opportunities, reports and shared tender work; changes require a member or owner.','info'));
  state.errors.forEach(error=>main.append(notice(error,'error')));
  if(state.view==='today')main.append(renderToday());
  else if(state.view==='workspaces')main.append(renderWorkspaces());
  else if(state.view==='workspace')main.append(renderWorkspace());
  else main.append(renderTeam());
  main.append(node('footer',{className:'page-meta'},text('span','HumanPlus · Company procurement workspace'),text('span','Evidence first. Verify the official dossier before bidding.')));
  root.replaceChildren(node('div',{className:'workspace'},sidebar,node('div',{className:'main-wrap'},node('header',{className:'topbar'},node('div',{className:'breadcrumb'},'Company workspace',text('span','›'),text('strong',routeNames[state.view])),node('div',{className:'topbar-right'},node('div',{className:'user-display'},text('strong',me.user.name),text('small',readableStatus(me.role))),text('span',initials(me.user.name),'user-avatar'),button('Sign out',async()=>{try{await api('/api/logout','POST',{});state.me=null;state.workspaces=[];state.reports=null;state.members=[];renderAuth(false);}catch(error){toast(error.message);}},'logout'))),main)));
  document.title=`${routeNames[state.view]} · ${me.company.name} · HumanPlus`;
}
function stat(label,value,description,accent=false) {return node('div',{className:`stat-card ${accent?'accent':''}`},text('span',label,'stat-label'),text('strong',value),text('p',description));}
function reportList() {return Array.isArray(state.reports?.reports)?state.reports.reports:[];}
function renderToday() {
  const reports=reportList();const latest=reports[0];
  const opportunities=state.opportunities?.notices||[];
  const open=state.workspaces.filter(w=>!['won','lost'].includes(w.status));
  const content=node('div',{},heading('Your procurement day','Review the latest evidence, follow your company’s opportunities and make the next decision.',[button('Refresh',reload),button('Tender workspaces',()=>go('workspaces'),'button')]));
  content.append(node('div',{className:'stat-grid'},stat('PUBLIC NOTICES IN FEED',state.opportunities?opportunities.length:'—','Includes tender, award, correction and other notice stages.',true),stat('ACTIVE COMPANY WORKSPACES',open.length,'Watching, reviewing, preparing or submitted.'),stat('LATEST SAVED REPORT',latest?date(latest.report_date):'—',latest?`Status: ${readableStatus(latest.status)}`:'No daily report has been saved yet.')));
  const reportPanel=panel('Daily briefing','Source-backed opportunities for your company.');
  if(latest)renderReport(reportPanel,latest);
  else reportPanel.append(empty('Your first report is not available yet','Daily reports will appear here after the reporting service has generated and saved one. No sample report is shown.'));
  const preferences=state.reports?.preferences;
  const delivery=state.reports?.delivery;
  const side=node('div',{className:'stack'},panel('Report delivery','The delivery state is shown separately from report generation.',node('div',{className:'detail-list'},detail('Daily schedule',preferences?`${preferences.local_time || '10:00'} · ${preferences.timezone || 'Europe/Tirane'}`:'Not available'),detail('Scheduled reports',preferences?.enabled?'Enabled':preferences?'Paused':'Not available'),detail('Delivery channel',delivery?.channel==='panel'?'Company panel':delivery?.channel||'Not available'),detail('Latest inbox delivery',delivery?.lastDeliveredAt?date(delivery.lastDeliveredAt,true):'No delivery recorded'),Number.isInteger(delivery?.deliveryCount)?detail('Recorded inbox deliveries',delivery.deliveryCount):null,detail('Private ChatGPT',delivery?.chatgptConnected?'Connected':'Not connected')),notice('Reports are saved in this company panel. Private ChatGPT delivery is not active; no ChatGPT message is promised.','amber'),button('Manage reporting',()=>go('team'))),panel('Source coverage','Freshness and completeness are different.',node('div',{className:'detail-list'},detail('Last complete source check',date(state.opportunities?.sourceCheckedAt,true))),text('p',state.opportunities?.coverageNote||'Coverage information could not be loaded.','help-text'),link('Open the HumanPlus archive ↗','/archive.html')));
  content.append(node('div',{className:'two-col'},reportPanel,side));
  if(reports.length>1)content.append(panel('Earlier reports','Saved company briefings retain their original date and source check.',node('div',{},reports.slice(1).map(report=>button([text('strong',report.title||`Report · ${date(report.report_date)}`),text('small',`${date(report.report_date)} · ${readableStatus(report.status)}`)],()=>modal(report.title||'Daily report','Saved company briefing',renderReport(node('div'),report)),'list-link text-button')))));
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
function renderWorkspaces() {
  const content=node('div',{},heading('Tender workspaces','One shared record for the decision, owner, tasks and discussion around each tender.',[button('Refresh',reload)]));
  const saved=panel('Your company’s tender pipeline','Work is shared with your company and retained when you sign out.');
  if(!state.workspaces.length)saved.append(empty('Start with one opportunity','Create a workspace from the public source list below. Your team can then assign work and record its decision.'));
  else{
    const rows=state.workspaces.filter(w=>!state.status||w.status===state.status);
    saved.append(node('div',{className:'search-row'},select('workspace-status',{'':'All stages',...statuses},state.status,{onChange:event=>{state.status=event.target.value;render();},'aria-label':'Filter workspaces by stage'}),text('span',`${rows.length} workspaces`,'search-count')));
    saved.append(workspaceTable(rows));
  }content.append(saved);
  const explorer=panel('Find an opportunity','Public metadata from the existing monitor. Company fit still needs a human review.');
  const query=input('opportunity-search',{type:'search',placeholder:'Search title, buyer or category…','aria-label':'Search source opportunities',value:state.search});
  const count=text('span','','search-count');
  const results=node('div');
  function update(){state.search=query.value;const q=state.search.toLocaleLowerCase();const notices=(state.opportunities?.notices||[]).filter(row=>[row.title,row.buyer,row.category].some(value=>string(value).toLocaleLowerCase().includes(q)));count.textContent=`${notices.length} notices`;results.replaceChildren(notices.length?opportunityTable(notices):empty('No matching source notices','Try a different search. The monitor covers only the source window described below.'));}
  query.addEventListener('input',update);explorer.append(node('div',{className:'search-row'},query,count),results,text('p',state.opportunities?.coverageNote||'Source coverage could not be loaded.','help-text'));update();content.append(explorer);return content;
}
function table(headers,rows){return node('div',{className:'table-wrap'},node('table',{},node('thead',{},node('tr',{},headers.map(h=>text('th',h)))),node('tbody',{},rows)));}
function workspaceTable(rows){return table(['Tender / buyer','Stage','Owner','Updated'],rows.map(row=>node('tr',{},node('td',{className:'cell-title'},button(row.title,()=>go('workspace',row.id),'table-link'),text('small',row.buyer||'Buyer not recorded')),node('td',{},tag(statuses[row.status]||row.status,row.status==='won'?'teal':'neutral')),text('td',memberName(row.owner_id)),text('td',date(row.updated_at),'cell-compact'))));}
function opportunityTable(rows){return table(['Opportunity / buyer','Deadline as published','Action'],rows.map(row=>{const workspace=state.workspaces.find(w=>String(w.tender_id)===String(row.id));return node('tr',{},node('td',{className:'cell-title'},text('strong',row.title),text('small',row.buyer||'Buyer not recorded'),node('div',{className:'entry-meta'},tag(row.category||'Uncategorized')),row.reasons?.length?text('small',row.reasons.join(' · ')):null,link('Official source ↗',row.url)),text('td',date(row.deadline)),node('td',{},workspace?button('Open workspace',()=>go('workspace',workspace.id),'button secondary small'):canEdit()?button('Create workspace',()=>createWorkspace(row.id),'button secondary small'):text('span','Viewer access','muted')));}));}
function renderWorkspace() {
  const workspace=state.workspaces.find(w=>String(w.id)===String(state.workspaceId));
  if(!workspace)return node('div',{},heading('Tender workspace','Shared company work.'),empty('This workspace is not available','It may belong to a different company or could not be loaded.',button('Back to workspaces',()=>go('workspaces'))));
  const source=state.opportunities?.notices.find(n=>String(n.id)===String(workspace.tender_id));
  const content=node('div',{},button('← All tender workspaces',()=>go('workspaces'),'text-button back-button'),heading('Make the next decision','Keep ownership, progress and the supporting discussion in one place.',[button('Refresh workspace',reload)]),node('section',{className:'tender-summary'},node('div',{className:'entry-meta'},tag(statuses[workspace.status]||workspace.status,'teal'),text('span',`Source notice ${workspace.tender_id}`)),text('h2',workspace.title),text('p',workspace.buyer||'Buyer not recorded'),node('div',{className:'entry-meta'},text('span',`Deadline: ${date(workspace.deadline||source?.deadline)}`),source?link('Official dossier ↗',source.url):null)));
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
  if(me.companies?.length>1)content.append(panel('Switch company','Each company has its own members, tender workspaces and reports.',field('Active company',select('company',Object.fromEntries(me.companies.map(c=>[c.id,c.name])),me.company.id,{onChange:async event=>{try{await api('/api/switch-company','POST',{companyId:event.target.value});await refreshAll();toast('Company switched.');}catch(error){toast(error.message);render();}}}))));
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
  modal('Create a company workspace','Start a separate company with its own team and tender work.',close=>makeForm(async data=>{await api('/api/companies','POST',{name:data.get('name'),sector:data.get('sector')});close();await refreshAll();toast('Company created. You are now in its separate workspace.');},field('Company name',input('name',{required:true,maxlength:160})),field('Sector',select('sector',sectors,'healthcare')),node('div',{className:'modal-footer'},button('Cancel',close),submit('Create company'))));
}
function showPassword() {
  modal('Change your password','All sessions, including this one, will be signed out after the change.',close=>makeForm(async data=>{if(data.get('newPassword')!==data.get('confirmPassword'))throw new Error('The new passwords do not match.');await api('/api/password','POST',{currentPassword:data.get('currentPassword'),newPassword:data.get('newPassword')});close();state.me=null;renderAuth(false,'Password updated. Sign in with your new password.');},field('Current password',input('currentPassword',{type:'password',required:true,autocomplete:'current-password'})),field('New password',input('newPassword',{type:'password',required:true,minlength:14,maxlength:256,autocomplete:'new-password'}),'At least 14 characters.'),field('Confirm new password',input('confirmPassword',{type:'password',required:true,minlength:14,maxlength:256,autocomplete:'new-password'})),node('div',{className:'modal-footer'},button('Cancel',close),submit('Change password'))));
}
window.addEventListener('popstate',()=>{const route=parseRoute();if(route.invite){renderAuth(true);return;}Object.assign(state,route);if(state.me)render();});
(async()=>{
  const route=parseRoute();if(route.invite){renderAuth(true);return;}
  Object.assign(state,route);
  try{await refreshAll();}catch(error){if(error.status===401)renderAuth(false);else renderAuth(false,`Connection unavailable: ${error.message}`);}
})();
