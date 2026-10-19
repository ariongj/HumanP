import type {Row} from './domain';
import {procedureKey} from './record-links';
import {deadlineDay,noticeState} from './procurement-monitor';

export type Briefing={
 id:string;row:Row;related:Row[];state:string;deadline:string;deadlineDisplay:string;
 deadlineSource:Row|null;daysLeft:number|null;open:boolean;urgent:boolean;
 requirements:Row[];changes:Row[];gaps:Row[];products:Row[];reasons:string[];
};
const latest=(a:Row,b:Row)=>String(b.published_iso||'').localeCompare(String(a.published_iso||''))||Number(b.notice_id)-Number(a.notice_id);
export function dayDistance(day:string,today:string):number|null{
 const stamp=(v:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return NaN;const n=Date.parse(v+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===v?n:NaN;};
 const n=(stamp(day)-stamp(today))/86400000;return Number.isFinite(n)?n:null;
}
/** One procedure per card. Closing notices are checked against the complete feed,
 * even when a view filter hides that notice. Never join on truncated authority IDs. */
export function buildBriefings(rows:Row[],all:Row[],medical:Row,today:string):Briefing[]{
 const grouped=new Map<string,Row[]>();
 for(const r of rows){const key=procedureKey(r)||'notice:'+r.notice_id;grouped.set(key,[...(grouped.get(key)||[]),r]);}
 return [...grouped].map(([id,visible])=>{
  const row=visible.slice().sort(latest).find(r=>r.evidence_classification==='tender_notice')||visible.slice().sort(latest)[0];
  const related=all.filter(r=>procedureKey(row)?procedureKey(r)===procedureKey(row):String(r.notice_id)===String(row.notice_id)).sort(latest);
  const ids=new Set(related.map(r=>String(r.notice_id)));ids.add(String(row.notice_id));
  const link=(r:Row)=>ids.has(String(r.notice_id))||Boolean(procedureKey(row)&&procedureKey(r)===procedureKey(row));
  const evidence=(name:string)=>(medical[name]||[]).filter(link);
  const deadlineSource=related.find(r=>deadlineDay(r))||null;
  const deadline=deadlineSource?deadlineDay(deadlineSource):'';
  const daysLeft=dayDistance(deadline,today),state=noticeState(row,all,today);
  // A row with a deadline but no tender notice is not evidence of an open tender.
  const open=state==='Afat i ardhshëm · verifiko'&&daysLeft!==null&&daysLeft>=0;
  return {id,row,related,state,deadline,deadlineSource,deadlineDisplay:deadlineSource?.deadline_displayed||'',daysLeft,open,urgent:open&&daysLeft!==null&&daysLeft<=7,requirements:evidence('requirements'),changes:evidence('changes'),gaps:evidence('downloadGaps'),products:evidence('products'),reasons:[...new Set<string>(visible.flatMap(r=>r.match_reasons||[]))]};
 }).sort((a,b)=>Number(b.open)-Number(a.open)||(a.open&&b.open?(a.daysLeft??Infinity)-(b.daysLeft??Infinity):0)||Number(a.row.match_confidence==='Për shqyrtim')-Number(b.row.match_confidence==='Për shqyrtim')||latest(a.row,b.row));
}
export const deadlineLabel=(b:Briefing)=>b.daysLeft===0?'Sot · kontrollo orën':b.daysLeft===1?'Nesër':b.daysLeft!==null&&b.daysLeft>0?`Pas ${b.daysLeft} ditësh`:b.daysLeft!==null?'Afat i kaluar':'Afati i pakonfirmuar';
export function currentAIEntry(report:Row,row:Row,related:Row[]=[]):Row|null{
 // Old AI text must not survive a changed source record, including corrections.
 if(report.status!=='ready')return null;
 const entry=(report.entries||[]).find((r:Row)=>String(r.notice_id)===String(row.notice_id)&&r.fingerprint===row.fingerprint);
 if(!entry)return null;
 if(entry.context_fingerprints){
  const recorded=entry.context_fingerprints;
  const monitored=related.filter(r=>r.fingerprint);
  if(monitored.length!==Object.keys(recorded).length||monitored.some(r=>recorded[String(r.notice_id)]!==r.fingerprint))return null;
 }
 return entry;
}
export const aiStatusText=(status:string)=>({not_configured:'Në pritje të çelësit API',source_unavailable:'Burimi duhet rikontrolluar',input_limit:'Hyrja tejkalon kufirin',attempted:'Pa përgjigje të verifikuar',failed:'Raporti AI dështoi',no_candidates:'Pa kandidatë për analizë',ready:'Raport AI i gjeneruar'}[status]||'AI në pritje');
export function briefingExport(briefings:Briefing[],meta:Row):Row{
 const {ai_report,...publicMeta}=meta;
 return {...publicMeta,method:'Prioritet sipas afatit dhe rregullave të përputhjes; jo vlerësim i kualifikimit për ofertim.',procedures:briefings.map(b=>({procedure:b.id,title:b.row.title,buyer:b.row.buyer,category:b.row.category_sq,state:b.state,deadline:b.deadlineDisplay||null,deadline_source_url:b.deadlineSource?.source_url||null,days_left:b.daysLeft,source_url:b.row.source_url,source_notice_id:b.row.notice_id,match_reasons:b.reasons,requirements:b.requirements,changes:b.changes,document_gaps:b.gaps,product_references:b.products,related_notice_ids:b.related.map(r=>r.notice_id),ai_interpretation:ai_report?currentAIEntry(ai_report,b.row,b.related):null}))};
}
const esc=(x:unknown)=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function briefingHTML(report:Row):string{
 const source=(url:string)=>/^https:\/\/e-prokurimi\.rks-gov\.net\//i.test(url||'')?`<a href="${esc(url)}">Burimi zyrtar ↗</a>`:'';
 return `<!doctype html><html lang="sq"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HumanPlus · Raporti i prokurimit</title><style>body{font:15px/1.7 system-ui,sans-serif;color:#18313e;max-width:1000px;margin:auto;padding:40px 24px}h1{font-size:32px}h2{font-size:20px}h3{font-size:15px}article{padding:24px 0;border-top:1px solid #d5e5df}a{color:#137c75}small,.muted{color:#627680}.meta{background:#eff7f4;padding:20px;border-radius:12px}li{margin:8px 0}@media print{article{break-inside:avoid}body{padding:0}}</style><h1>HumanPlus · Raporti i prokurimit</h1><div class="meta"><b>${esc(report.date)}</b><p>Kontrolli i burimit: ${esc(report.source_checked_at||'I pakonfirmuar')}</p><p>${esc(report.procedures.length)} procedura në përzgjedhjen e eksportuar.</p><p>${esc(report.method)}</p><small>AI: ${esc(report.ai_status)}. Dokumentet e paarritshme dhe kualifikimi i HumanPlus kërkojnë verifikim.</small></div>${report.procedures.map((p:Row)=>`<article><small>${esc(p.category)} · ${esc(p.procedure)}</small><h2>${esc(p.title)}</h2><p>${esc(p.buyer)}</p><p><b>${esc(p.state)}</b> · Afati: ${esc(p.deadline||'I panjohur')}</p>${source(p.source_url)}<h3>Pse lidhet me profilin</h3><ul>${p.match_reasons.map((r:string)=>`<li>${esc(r)}</li>`).join('')}</ul>${p.ai_interpretation?`<h3>Interpretimi AI</h3><p>${esc(p.ai_interpretation.why_match)}</p><p>Hapi i sugjeruar: ${esc(p.ai_interpretation.next_step)}</p><ul>${p.ai_interpretation.evidence_gaps.map((g:string)=>`<li>${esc(g)}</li>`).join('')}</ul>`:''}<h3>Kërkesat në burimet e ruajtura</h3>${p.requirements.length?`<ul>${p.requirements.map((r:Row)=>`<li><b>${esc(r.requirement_category)}</b>: ${esc(r.requirement_as_published)}<p>Dëshmia: ${esc(r.evidence_requested||'E paspecifikuar në ekstrakt')}</p>${source(r.source_url)}</li>`).join('')}</ul>`:'<p>Kërkesat nuk janë nxjerrë për këtë procedurë. Lexo dosjen zyrtare.</p>'}<p class="muted">${p.changes.length} rreshta korrigjimesh · ${p.document_gaps.length} boshllëqe të regjistruara në dokumente. Mungesa e një boshllëku të regjistruar nuk provon dosje të plotë.</p></article>`).join('')}</html>`;
}
