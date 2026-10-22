import {createHash} from 'node:crypto';
import {Parser} from 'htmlparser2';

export const BASE='https://e-prokurimi.rks-gov.net/SPIN_PROD/application/ipn/DocumentManagement/';
export const LISTING=BASE+'NewPreglediDokumenataFrm.aspx';
const STAGES={B05:'tender_notice',B08:'award_notice',B52:'signing_notice',B10:'cancellation_notice',B54:'correction_notice',B58:'decision_notice'};
const MAX_BYTES=12_000_000,MAX_COLLECTION_MS=20*60*1000;
const sha=value=>createHash('sha256').update(value).digest('hex');
const norm=value=>String(value??'').normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'');
const timestamp=date=>date.toISOString().slice(0,19)+'+00:00';
// Match the existing Python json.dumps(sort_keys=True, ensure_ascii=False),
// including its default separators. This preserves source and AI fingerprints.
function canonical(value) {
 if (value===null || typeof value!=='object') return JSON.stringify(value);
 if (Array.isArray(value)) return '['+value.map(canonical).join(', ')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+': '+canonical(value[k])).join(', ')+'}';
}
const digest=value=>sha(canonical(value));
function isoDate(value) {
 const match=String(value||'').match(/\b(\d{2})\.(\d{2})\.(\d{4})/);
 if (!match) throw new Error('Missing publication date');
 const day=`${match[3]}-${match[2]}-${match[1]}`,time=Date.parse(day+'T00:00:00Z');
 if (Number(match[3])<1 || !Number.isFinite(time) || new Date(time).toISOString().slice(0,10)!==day) throw new Error('Invalid publication date');
 return day;
}
function parsePortal(html) {
 if (typeof html!=='string' || Buffer.byteLength(html)>MAX_BYTES) throw new Error('Portal HTML missing or exceeds size limit');
 const stack=[],items=[],fields={};
 const parser=new Parser({
  onopentag(tag,attrs) {
   if(tag==='input') fields[attrs.id||'']=attrs.value||'';
   if(!['input','br','img','meta','link','hr'].includes(tag))stack.push({tag,attrs,parts:[]});
  },
  ontext(value) {for(const node of stack)if(['h1','h2','a','span'].includes(node.tag))node.parts.push(value);},
  onclosetag(tag) {
   const index=stack.findLastIndex(node=>node.tag===tag);if(index<0)return;
   for(const node of stack.splice(index)) {
    const value=node.parts.join(' ').trim().replace(/\s+/g,' ');
    if(node.tag==='span'&&node.attrs.id)fields[node.attrs.id]=value;
    if(['h1','h2','a'].includes(node.tag))items.push({tag:node.tag,attrs:node.attrs,text:value});
   }
  },
 },{decodeEntities:true,lowerCaseTags:true,lowerCaseAttributeNames:true});
 parser.end(html);return {items,fields};
}
export function parseListing(html) {
 const {items}=parsePortal(html);let date='',kind='';const records={},dates=[];
 for(const {tag,attrs,text} of items) {
  if(tag==='h1'&&text.includes('On-line')){date=isoDate(text);dates.push(date);}
  else if(tag==='h2')kind=text.replaceAll('PlusMinus','').trim();
  else if(tag==='a'&&text) {
   const match=String(attrs.href||'').match(/^DokumentPodaciFrm\.aspx\?id=(\d+)$/i);
   if(match){if(!date||!/^B\d+/.test(kind))throw new Error('Notice appeared outside a dated publication group');records[match[1]]={notice_id:match[1],listed_date:date,listed_title:text.replace(/^\d+\.\s*/,''),listed_type:kind};}
  }
 }
 if(!Object.keys(records).length||!dates.length)throw new Error('Publication listing is empty or its schema changed');
 return {records,dates:[...new Set(dates)].sort()};
}
export function parseNotice(html,listed) {
 if(!listed||!/^\d+$/.test(String(listed.notice_id||'')))throw new Error('Invalid numeric notice ID');
 const {fields}=parsePortal(html),field=suffix=>fields['uiDokumentPodaci_ui'+suffix]||'';
 if(!['Naslov','BrojObjave','Narucitelj','VrstaObjave'].every(k=>field(k)))throw new Error('Notice metadata missing; login/error page or schema change');
 const date=isoDate(field('DatumObjave_textBox')),code=field('BrojObjave');
 return {...listed,title:field('Naslov'),buyer:field('Narucitelj'),procurement_code:code,procedure_key:code.split(/\/B\d/)[0],notice_date:field('DatumObjave_textBox'),published_iso:date,year:Number(date.slice(0,4)),notice_type:field('VrstaObjave'),evidence_classification:STAGES[field('VrstaObjave').slice(0,3)]||'other_notice',cpv_as_published:field('Cpv'),contract_type:field('VrstaUgovora'),estimated_value_displayed:field('ProcijenjenaVrijednost')||null,estimated_value_currency:null,supplier:null,deadline_displayed:field('RokZaDostavuVrijeme')||null,deadline_timezone:'Not stated on portal metadata; verify in tender dossier',attachments:[...new Set(Object.entries(fields).filter(([k,v])=>k.endsWith('lblDocumentFileName')&&v).map(([,v])=>v))].sort(),source_url:BASE+'DokumentPodaciFrm.aspx?id='+listed.notice_id,source:'krpp_daily_monitor',source_label:'KRPP · monitori ditor',gaps:'Metadata only. Currency, supplier, requirements and current eligibility are not inferred. Check the official dossier.'};
}
export function classify(row,profile) {
 const title=norm((row.title||'')+' '+(row.listed_title||'')),buyer=norm(row.buyer||'');
 const healthBuyer=profile.health_buyers.filter(t=>buyer.includes(norm(t))),cpv=String(row.cpv_as_published||'').match(/^\d{8}/)?.[0],cpvMatch=Boolean(cpv&&profile.cpv_prefixes.some(p=>cpv.startsWith(p)));
 const sectors=profile.sectors.filter(s=>s.terms.some(t=>title.includes(norm(t)))),extra=(profile.extra_keywords||[]).filter(t=>title.includes(norm(t))),excluded=(profile.excluded_keywords||[]).filter(t=>title.includes(norm(t))),nonHealth=profile.non_health_context.filter(t=>(title+' '+buyer).includes(norm(t)));
 const reasons=[];if(cpvMatch)reasons.push('FPP/CPV: '+cpv);if(healthBuyer.length)reasons.push('Institucion shëndetësor: '+(row.buyer||''));for(const sector of sectors)reasons.push('Terma në titull: '+sector.category);if(extra.length)reasons.push('Fjalë të profilit: '+extra.join(', '));
 const review=Boolean(nonHealth.length&&!healthBuyer.length||sectors.length&&!cpvMatch&&!healthBuyer.length);
 return {matched:Boolean(reasons.length&&!excluded.length),match_reasons:reasons,match_confidence:review?'Për shqyrtim':'Përputhje e dokumentuar',category_sq:sectors[0]?.category||(healthBuyer.length&&!cpvMatch?'Mbështetje e institucioneve shëndetësore':'Shëndetësi · kategori për shqyrtim'),scope:healthBuyer.length&&!sectors.length&&!cpvMatch?'institutional_support':'medical_goods_services',classification_basis:'humanplus_healthcare_rules_v1; classification is not a bidding recommendation',review_context:nonHealth,excluded_by:excluded};
}
function procedure(row) {const value=String(row.procedure_key||'').replace(/^(?:19|20)\d{2}\//,'');return /^[\d/-]+$/.test(value)?value:'';}
const compareRows=(a,b)=>String(a.published_iso||'').localeCompare(String(b.published_iso||''))||(String(a.notice_id)<String(b.notice_id)?-1:String(a.notice_id)>String(b.notice_id)?1:0);
export function classifyRecords(records,profile) {
 for(const row of Object.values(records))Object.assign(row,classify(row,profile));
 const anchors=new Map();for(const row of Object.values(records).sort(compareRows)){const key=procedure(row);if(row.matched&&key&&!anchors.has(key))anchors.set(key,row);}
 for(const row of Object.values(records)) {
  const anchor=anchors.get(procedure(row));
  if(!row.matched&&!row.excluded_by.length&&anchor&&['correction_notice','cancellation_notice','decision_notice','award_notice','signing_notice'].includes(row.evidence_classification))Object.assign(row,{matched:true,category_sq:anchor.category_sq,scope:anchor.scope,match_confidence:anchor.match_confidence,match_reasons:['Procedurë e njëjtë me njoftimin '+anchor.notice_id],classification_basis:'exact_full_procedure_link_to_healthcare_notice'});
 }
 return records;
}
function portalURL(value) {
 let url;try{url=new URL(value);}catch{throw new Error('Invalid official portal URL');}
 if(url.protocol!=='https:'||url.hostname!=='e-prokurimi.rks-gov.net'||url.port||url.username||url.password||url.hash)throw new Error('Only the fixed official HTTPS portal is allowed');
 const listing=url.pathname==='/SPIN_PROD/application/ipn/DocumentManagement/NewPreglediDokumenataFrm.aspx'&&!url.search;
 const notice=url.pathname==='/SPIN_PROD/application/ipn/DocumentManagement/DokumentPodaciFrm.aspx'&&/^\?id=\d+$/.test(url.search);
 if(!listing&&!notice)throw new Error('Only official listing and numeric notice paths are allowed');
 return url.href;
}
const abortError=()=>new Error('Collector deadline exceeded');
async function abortable(promise,signal) {
 if(signal.aborted)throw abortError();
 let listener;
 const aborted=new Promise((_,reject)=>{listener=()=>reject(abortError());signal.addEventListener('abort',listener,{once:true});});
 try{return await Promise.race([promise,aborted]);}finally{signal.removeEventListener('abort',listener);}
}
function pause(ms,signal) {return new Promise((resolve,reject)=>{if(signal?.aborted){reject(abortError());return;}const end=()=>{clearTimeout(timer);signal?.removeEventListener('abort',end);reject(abortError());};const timer=setTimeout(()=>{signal?.removeEventListener('abort',end);resolve();},ms);signal?.addEventListener('abort',end,{once:true});});}
/** Optional injection is for offline tests. Production calls use Node fetch. */
export async function fetchPortalHTML(url,{signal,fetchImpl=globalThis.fetch,timeoutMs=20_000,retryDelayMs=500}={}) {
 const original=portalURL(url);let lastError;
 for(let attempt=0;attempt<3;attempt++) {
  if(signal?.aborted)throw abortError();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(20_000,Math.max(1,timeoutMs))),activeSignal=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  try {
   let current=original,response;
   for(let redirects=0;redirects<=4;redirects++) {
    response=await abortable(fetchImpl(current,{redirect:'manual',signal:activeSignal,headers:{'User-Agent':'HumanPlus-PublicProcurementMonitor/2.0','Accept':'text/html,application/xhtml+xml'}}),activeSignal);
    if([301,302,303,307,308].includes(response.status)) {
     await response.body?.cancel();
     if(redirects===4)throw Object.assign(new Error('Official portal redirect limit exceeded'),{retryable:false});
     const location=response.headers.get('location');if(!location)throw Object.assign(new Error('Portal redirect missing location'),{retryable:false});
     try{current=portalURL(new URL(location,current).href);}catch{throw Object.assign(new Error('Portal redirect left the allowlisted official paths'),{retryable:false});}continue;
    }
    break;
   }
   if(!response.ok){await response.body?.cancel();throw Object.assign(new Error('Official portal request failed (HTTP '+response.status+')'),{retryable:[408,429,500,502,503,504].includes(response.status)});}
   const length=Number(response.headers.get('content-length')||0);if(length>MAX_BYTES){await response.body?.cancel();throw Object.assign(new Error('Portal response exceeds 12MB'),{retryable:false});}
   if(!response.body)throw new Error('Portal response body missing');
   const reader=response.body.getReader(),chunks=[];let total=0;
   try{while(true){const {done,value}=await abortable(reader.read(),activeSignal);if(done)break;total+=value.byteLength;if(total>MAX_BYTES){await reader.cancel();throw Object.assign(new Error('Portal response exceeds 12MB'),{retryable:false});}chunks.push(value);}}finally{reader.releaseLock();}
   return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
  } catch(error) {lastError=error;if(signal?.aborted)throw abortError();if(error.retryable===false||attempt===2)throw error;} finally {clearTimeout(timer);}
  await pause(Math.max(0,retryDelayMs)*(attempt+1),signal);
 }
 throw lastError;
}
function updateRecord(old,raw,now) {
 const semantic=Object.fromEntries(Object.entries(raw).filter(([key])=>!['listed_type','listed_date'].includes(key))),fingerprint=digest(semantic),changed=Boolean(old&&old.fingerprint!==fingerprint);
 const fields=old?Object.keys(semantic).filter(key=>canonical(old[key]??null)!==canonical(raw[key]??null)):[];
 return {row:{...raw,fingerprint,first_seen_at:old?.first_seen_at||now,last_checked_at:now,changed_at:changed?now:old?.changed_at??null},fields};
}
/** deadlineMs is a duration budget (capped at20min). fetchHTML may accept
 * {signal}; even an injected request ignoring it is bounded by Promise.race. */
export async function collect({state={},profile,fetchHTML=fetchPortalHTML,now=new Date(),concurrency=2,onProgress,deadlineMs=MAX_COLLECTION_MS}={}) {
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new Error('Invalid collector clock');
 if(!profile||!['health_buyers','cpv_prefixes','sectors','non_health_context'].every(key=>Array.isArray(profile[key])))throw new Error('Invalid collector matching profile');
 const result=structuredClone(state),records=result.records||{},events=result.events||[],errors=[],previousSuccess=result.last_successful_check||null;
 if(Array.isArray(records)||!records||typeof records!=='object'||!Array.isArray(events))throw new Error('Invalid collector state');
 for(const [id,row] of Object.entries(records))if(!/^\d+$/.test(id)||!row||String(row.notice_id)!==id)throw new Error('State contains an invalid notice ID');
 const previousMatches=new Set(Object.entries(records).filter(([,row])=>row.matched).map(([id])=>id));
 const started=Date.now(),budget=Math.min(MAX_COLLECTION_MS,Math.max(1,Number(deadlineMs)||MAX_COLLECTION_MS)),controller=new AbortController(),deadlineTimer=setTimeout(()=>controller.abort(),budget),stamp=timestamp(now);
 const at=()=>timestamp(new Date(now.getTime()+Date.now()-started));
 let listed={},dates=[],checked=0,processed=0;const newIds=new Set(),changedIds=new Set(),changedFields={};
 async function read(url) {
  const remaining=budget-(Date.now()-started);if(remaining<=0||controller.signal.aborted)throw abortError();
  const perRequest=new AbortController(),signal=AbortSignal.any([controller.signal,perRequest.signal]);let timer,listener;
  const stop=new Promise((_,reject)=>{listener=()=>reject(abortError());signal.addEventListener('abort',listener,{once:true});timer=setTimeout(()=>perRequest.abort(),Math.min(65_000,remaining));});
  try{return await Promise.race([Promise.resolve().then(()=>fetchHTML(url,{signal})),stop]);}finally{clearTimeout(timer);signal.removeEventListener('abort',listener);perRequest.abort();}
 }
 async function progress(total) {if(onProgress)try{await abortable(Promise.resolve().then(()=>onProgress({processed,checked,pending_total:total,errors:errors.length})),controller.signal);}catch{/* Progress persistence must not change source-check semantics. */}}
 try {
  const html=await read(LISTING);({records:listed,dates}=parseListing(html));result.listing_sha256=sha(html);
  if(previousSuccess&&previousSuccess.slice(0,10)<dates[0])errors.push({kind:'coverage_gap',message:'Last complete check predates the oldest visible publication date; archive backfill required.'});
  const cutoff=new Date(now.getTime()-30*86400000).toISOString().slice(0,10),targets={...listed};
  for(const [id,row] of Object.entries(records)) {
   let upcoming=false;try{upcoming=isoDate(row.deadline_displayed)>=stamp.slice(0,10);}catch{}
   if(row.matched&&(String(row.published_iso||'')>=cutoff||upcoming)&&!targets[id])targets[id]=Object.fromEntries(['notice_id','listed_date','listed_title','listed_type'].map(k=>[k,row[k]||'']));
  }
  const pending=Object.entries(targets).filter(([id,row])=>!records[id]||records[id].matched||records[id].listed_title!==row.listed_title);let next=0;
  await progress(pending.length);
  const worker=async()=>{
   while(next<pending.length&&!controller.signal.aborted) {
    const [id,listing]=pending[next++];
    try {
     const source=await read(BASE+'DokumentPodaciFrm.aspx?id='+id),raw=parseNotice(source,listing),old=records[id],updated=updateRecord(old,raw,stamp),fetchedAt=at();
     records[id]={...updated.row,...classify(updated.row,profile),source_sha256:sha(source),retrieved_date:fetchedAt.slice(0,10),last_checked_at:fetchedAt};checked++;
     if(!old)newIds.add(id);else if(updated.fields.length)changedIds.add(id);changedFields[id]=updated.fields;
    }catch(error){errors.push({kind:'detail_failure',notice_id:id,message:String(error.message||error).slice(0,180)});}
    processed++;await progress(pending.length);
   }
  };
  await Promise.all(Array.from({length:Math.min(4,Math.max(1,Math.trunc(Number(concurrency)||2)),pending.length)},worker));
  if(next<pending.length||controller.signal.aborted)errors.push({kind:'collection_deadline',message:`Collection time budget exhausted; ${pending.length-processed} notices remain unchecked.`});
 }catch(error){errors.push({kind:'listing_failure',message:String(error.message||error).slice(0,180)});}finally{clearTimeout(deadlineTimer);controller.abort();}
 classifyRecords(records,profile);
 const eventIds=new Set(events.map(e=>e.id));
 for(const [id,row] of Object.entries(records)) {
  if(row.matched&&(newIds.has(id)||changedIds.has(id)||!previousMatches.has(id))) {
   const kind=newIds.has(id)?'new':changedIds.has(id)?'changed':'new_match',eventId=digest([id,row.fingerprint,...(kind==='new_match'?[digest(profile)]:[])]);
   if(!eventIds.has(eventId)){events.push({id:eventId,notice_id:id,kind,at:stamp,fields:kind==='new_match'?['interest_profile']:changedFields[id]||[]});eventIds.add(eventId);}
  }
 }
 const run={at:stamp,status:errors.length?(checked?'partial':'failed'):'ok',listed:Object.keys(listed).length,checked,new:newIds.size,changed:changedIds.size,publication_dates:dates,errors};
 Object.assign(result,{last_attempt:stamp,last_successful_check:errors.length?previousSuccess:stamp,records,events,runs:[...(result.runs||[]),run].slice(-30)});
 const matched=Object.values(records).filter(r=>r.matched).sort((a,b)=>-compareRows(a,b));
 for(const row of matched)row.latest_verified_note_sq='Metadata e kontrolluar më '+row.last_checked_at+'; verifiko dosjen para ofertimit.';
 const feed={schema_version:1,profile:structuredClone(profile),source_url:LISTING,last_attempt:stamp,last_successful_check:result.last_successful_check,run,runs:result.runs,notices:matched,events:events.filter(e=>records[e.notice_id]?.matched),codex_notifications:'not_connected',coverage_note:'All notices in the portal’s visible publication list are checked. The list currently exposes ten publication dates. Older history and document-body-only matches are outside this collector’s verified coverage.'};
 return {state:result,feed};
}
