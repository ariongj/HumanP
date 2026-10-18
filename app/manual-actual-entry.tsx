'use client';
import {useState} from 'react';
import {validateActuals,type Actual} from '@/lib/insights';

export default function ManualActualEntry({records,sourceName,disabled,onReview}:{records:Actual[];sourceName?:string;disabled:boolean;onReview:(records:Actual[],source:string)=>void}){
 const [draft,setDraft]=useState({month:'',revenue:'',variable:'',fixed:'',source:''});const [error,setError]=useState('');
 return <form className="manual-actual-entry" onSubmit={e=>{e.preventDefault();setError('');try{
  if(Object.values(draft).some(v=>!v.trim()))throw new Error('Plotëso muajin, tre vlerat dhe referencën e burimit. Zeroja shkruhet shprehimisht.');
  const row={month:draft.month,revenue:Number(draft.revenue),variable:Number(draft.variable),fixed:Number(draft.fixed)};
  const next=validateActuals([...records.filter(r=>r.month!==draft.month),row]);
  onReview(next,`Hyrje manuale ${draft.month}: ${draft.source}${sourceName?'; bazë: '+sourceName:''}`.slice(0,200));
 }catch(err){setError((err as Error).message);}}}>
 <h3>Shkruaj një muaj direkt në panel</h3><p className="muted-copy">Muajt e tjerë ruhen. Nëse muaji ekziston, shfaqet grupi i përditësuar për konfirmim.</p>
 <div className="manual-actual-fields"><label>Muaji<input type="month" aria-label="Muaji i hyrjes direkte" value={draft.month} onChange={e=>setDraft(d=>({...d,month:e.target.value}))}/></label>{([['revenue','Të ardhurat reale · EUR'],['variable','Kosto variabël reale · EUR'],['fixed','Kosto fikse reale · EUR']] as const).map(([key,label])=><label key={key}>{label}<input type="number" min="0" step="0.01" aria-label={label} value={draft[key]} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}/></label>)}</div>
 <label className="manual-actual-source">Referenca e burimit<input aria-label="Referenca e rezultatit mujor" maxLength={140} value={draft.source} onChange={e=>setDraft(d=>({...d,source:e.target.value}))} placeholder="Raporti ose regjistri i rakorduar"/></label><button className="button secondary" disabled={disabled} type="submit">Shqyrto muajin</button>{error&&<p className="notice danger" role="alert">{error}</p>}
 </form>;
}
