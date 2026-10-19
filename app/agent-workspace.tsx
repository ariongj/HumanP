'use client';
import {useState} from 'react';
import {ArrowUpRight,Bookmark,CalendarClock,Check,ChevronRight,ClipboardList,Download,FileCheck2,FileText,Info,ScanSearch,ShieldCheck,Sparkles} from 'lucide-react';
import type {Row} from '@/lib/domain';
import {safeLink} from '@/lib/domain';
import {aiStatusText,briefingExport,briefingHTML,currentAIEntry,deadlineLabel,type Briefing} from '@/lib/agent-briefing';
import {Panel,download} from './ui';
import './agent-workspace.css';

export function TenderCard({briefing:b,index,aiReport,onOpen,onWatch,watched=false,expanded=false}:{briefing:Briefing;index:number;aiReport:Row;onOpen:(r:Row)=>void;onWatch:(r:Row)=>void;watched?:boolean;expanded?:boolean}){
 const ai=currentAIEntry(aiReport,b.row,b.related);
 return <article className={'agent-tender '+(b.urgent?'agent-tender-urgent':'')} data-procedure={b.id}>
  <div className="agent-tender-top"><span className="agent-number">{String(index+1).padStart(2,'0')}</span><span className="agent-category">{b.row.category_sq}</span>{b.row.match_confidence==='Për shqyrtim'&&<span className="agent-pill amber">Përputhje për shqyrtim</span>}<span className={'agent-pill '+(b.urgent?'amber':'')}>{b.open?deadlineLabel(b):b.state}</span></div>
  <h3><button onClick={()=>onOpen(b.row)}>{b.row.title}<ArrowUpRight size={17}/></button></h3>
  <p className="agent-buyer">{b.row.buyer}</p>
  <div className="agent-tender-facts"><span><CalendarClock size={14}/>{b.deadlineDisplay||'Afati nuk është publikuar'}</span><span><FileCheck2 size={14}/>{b.requirements.length?`${b.requirements.length} kërkesa në burim`:'Kërkesat duhen lexuar'}</span></div>
  <div className="agent-match"><ScanSearch size={16}/><div><strong>Pse lidhet me HumanPlus</strong><p>{ai?.why_match||b.reasons.join(' · ')||'Përputhja kërkon shqyrtim.'}</p><small>{ai?'Interpretim AI · kontrollo burimin':'Përputhje me interesat shëndetësore, jo provë e kualifikimit për ofertim.'}</small></div></div>
  {(b.changes.length>0||b.gaps.length>0)&&<p className="agent-caution"><Info size={14}/>{b.changes.length>0?`${b.changes.length} rreshta korrigjimesh për t’u kontrolluar. `:''}{b.gaps.length>0?`${b.gaps.length} boshllëqe dokumentesh të regjistruara.`:''}</p>}
  {ai&&<div className="agent-ai-action"><strong>Hapi i sugjeruar nga AI</strong><p>{ai.next_step}</p><ul>{(ai.evidence_gaps||[]).map((gap:string,i:number)=><li key={i}>{gap}</li>)}</ul></div>}
  <details className="agent-requirements" open={expanded||undefined}><summary><ClipboardList size={15}/>Kërkesat dhe dokumentet <ChevronRight size={15}/></summary><div>
   {b.requirements.length?<><p className="agent-evidence-note">Ekstrakte të ruajtura sipas burimit. Lexo dosjen dhe korrigjimet më të fundit përpara ofertimit.</p>{b.requirements.map((r,i)=><section key={i}><h4>{r.requirement_category||'Kërkesë e publikuar'}</h4><p>{r.requirement_as_published}</p>{r.evidence_requested&&<details><summary>Dëshmia që kërkohet</summary><p>{r.evidence_requested}</p></details>}{safeLink(r.source_url)&&<a href={r.source_url} target="_blank" rel="noreferrer">Burimi i kërkesës <ArrowUpRight size={12}/></a>}</section>)}</>:<p className="agent-evidence-note">Nuk ka kërkesa të nxjerra për këtë procedurë. Hap dosjen zyrtare për specifikimet, licencat dhe dokumentet që kërkohen.</p>}
   {b.products.length>0&&<section><h4>Produkte dhe marka në burim</h4>{b.products.map((r,i)=><p key={i}>{[r.brand_explicit,r.model_explicit,r.item_description].filter(Boolean).join(' · ')}</p>)}<small>Emërtimet nuk provojnë stokun, përfaqësimin ose përputhshmërinë e HumanPlus.</small></section>}
   {b.deadlineSource&&<p className="agent-evidence-note">Afati vjen nga njoftimi {b.deadlineSource.notice_id}. Zona kohore nuk jepet në metadata; verifiko dosjen. Numri i ditëve nuk merr parasysh orën e mbylljes.</p>}
  </div></details>
  <footer><button className={'agent-watch '+(watched?'active':'')} onClick={()=>onWatch(b.row)} aria-label={'Ndiq procedurën '+b.id}><Bookmark size={15}/>{watched?'Në ndjekje':'Ndiq'}</button><button className="text-button" onClick={()=>onOpen(b.row)}>Evidenca e lidhur <ChevronRight size={14}/></button>{safeLink(b.row.source_url)&&<a href={b.row.source_url} target="_blank" rel="noreferrer">Dosja zyrtare <ArrowUpRight size={14}/></a>}</footer>
 </article>;
}

export function PriorityWorkspace({briefings,aiReport,onOpen,onWatch,decisions}:{briefings:Briefing[];aiReport:Row;onOpen:(r:Row)=>void;onWatch:(r:Row)=>void;decisions:Row}){
 const [showAll,setShowAll]=useState(false);
 const open=briefings.filter(b=>b.open),visible=showAll?open:open.slice(0,4);
 const review=briefings.filter(b=>!b.open&&b.state==='Status për verifikim');
 return <div className="agent-priority-grid"><Panel title="Mundësitë për shqyrtim" subtitle="Një kartë për procedurë, sipas afatit më të afërt. Verifiko lotet dhe dosjen zyrtare." className="agent-priorities" action={<span className="agent-count">{open.length}</span>}>
  {visible.length?<div className="agent-tender-list">{visible.map((b,i)=><TenderCard key={b.id} briefing={b} index={i} aiReport={aiReport} onOpen={onOpen} onWatch={onWatch} watched={decisions[b.row.notice_id]?.verdict==='Për ndjekje'}/>)}</div>:<div className="agent-empty"><ScanSearch size={28}/><h3>Asnjë procedurë me afat të ardhshëm në këtë pamje</h3><p>Njoftimet pa afat të konfirmuar dhe fazat e mbyllura mbeten në regjistrin më poshtë.</p></div>}
  {open.length>4&&<button className="button secondary agent-more" onClick={()=>setShowAll(!showAll)}>{showAll?'Shfaq 4 procedurat e para':`Shfaq të ${open.length} procedurat`}<ChevronRight size={15}/></button>}
 </Panel><div className="agent-side"><Panel title="Afatet që afrohen" subtitle="Procedura në përzgjedhjen aktuale; data sipas portalit." className="agent-deadlines">
  {open.length?<ol>{open.slice(0,6).map(b=><li key={b.id}><button onClick={()=>onOpen(b.row)}><span className={'agent-date '+(b.urgent?'urgent':'')}><b>{b.deadline.slice(8)}</b><small>{b.deadline.slice(5,7)} / {b.deadline.slice(0,4)}</small></span><span><strong>{b.row.title}</strong><small>{deadlineLabel(b)} · {b.deadlineDisplay.split(' ')[1]||'Ora e paspecifikuar'}</small></span><ChevronRight size={14}/></button></li>)}</ol>:<p className="agent-evidence-note">Nuk ka afate të ardhshme të konfirmuara në këtë përzgjedhje.</p>}
 </Panel><Panel title="Për t’u verifikuar" className="agent-review-box"><div className="agent-review-number"><ShieldCheck size={24}/><strong>{review.length}</strong><span>procedura pa status të konfirmuar</span></div><p>Hap burimin për të verifikuar afatin, fazën dhe lotet përpara se ta trajtosh si mundësi të hapur.</p>{review.slice(0,3).map(b=><button key={b.id} onClick={()=>onOpen(b.row)}>{b.row.title}<ArrowUpRight size={14}/></button>)}</Panel></div></div>;
}

export function DailyBriefing({briefings,aiReport,feed,today,selection,onOpen,onWatch,decisions}:{briefings:Briefing[];aiReport:Row;feed:Row;today:string;selection:Row;onOpen:(r:Row)=>void;onWatch:(r:Row)=>void;decisions:Row}){
 const report=briefingExport(briefings,{date:today,source_checked_at:feed.last_successful_check,filters:selection,ai_status:aiReport.status,ai_generated_at:aiReport.generated_at,ai_report:aiReport});
 const open=briefings.filter(b=>b.open),urgent=open.filter(b=>b.urgent),ready=aiReport.status==='ready',aiCount=open.filter(b=>currentAIEntry(aiReport,b.row,b.related)).length;
 const generated=aiReport.generated_at?new Date(aiReport.generated_at).toLocaleString('sq-AL',{timeZone:'Europe/Belgrade'}):'';
 return <div className="agent-report"><div className="agent-report-heading"><div><span className="agent-report-date"><FileText size={15}/>{today} · HumanPlus</span><h2>Raporti ditor i mundësive</h2><p>{ready?`${aiCount} procedura me analizë AI në këtë përzgjedhje. Përmbledhjet e tjera bazohen në rregullat e profilit.`:`Përmbledhje nga burimet · ${aiStatusText(aiReport.status)}.`}</p></div><div className="actions"><button className="button secondary" onClick={()=>download('humanplus-raporti-ditor.html',briefingHTML(report),'text/html')}><Download size={14}/>Raporti ditor HTML</button><button className="button secondary" onClick={()=>download('humanplus-raporti-ditor.json',JSON.stringify(report,null,2),'application/json')}>Raporti ditor JSON</button></div></div>
 <div className="agent-report-summary"><div><Check size={19}/><p><strong>{open.length} procedura me afat të ardhshëm</strong><span>Nga {briefings.length} procedura në përzgjedhje; statusi i loteve kërkon kontroll.</span></p></div><div><CalendarClock size={19}/><p><strong>{urgent.length} afate brenda 7 ditëve</strong><span>Përfshin ditën e sotme. Verifiko orën e mbylljes në portal.</span></p></div><div><Sparkles size={19}/><p><strong>{ready?`${aiCount} procedura me analizë AI`:aiStatusText(aiReport.status)}</strong><span>{ready?`Gjeneruar më ${generated} · deri në 8 procedura në ditë. Analizat që nuk përputhen me burimin aktual fshihen.`:'Këto rezultate llogariten nga të dhënat reale; nuk janë raport i gjeneruar nga AI.'}</span></p></div></div>
 <p className="agent-evidence-note">Raporti respekton filtrat e panelit dhe filtrat e kësaj faqeje. Kërkesat e nxjerra, boshllëqet dhe lidhjet burimore përfshihen në eksport. Interesi i HumanPlus për një sektor nuk provon kualifikim, licencë ose përfaqësim të një marke.</p>
 {open.length?<div className="agent-report-cards">{open.map((b,i)=><TenderCard key={b.id} briefing={b} index={i} aiReport={aiReport} onOpen={onOpen} onWatch={onWatch} watched={decisions[b.row.notice_id]?.verdict==='Për ndjekje'}/>)}</div>:<div className="agent-empty"><FileText size={30}/><h3>Asnjë mundësi me afat të ardhshëm në këtë raport</h3><p>Eksporti përfshin të gjitha procedurat e përzgjedhura me statusin e tyre burimor.</p></div>}
 </div>;
}
