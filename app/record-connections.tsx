'use client';
import {useMemo} from 'react';
import {connectedRecords,procedureKey} from '@/lib/record-links';
import type {Row} from '@/lib/domain';
import {vaultDocumentURL} from '@/lib/browser-vault';
import {useData,Loading,Table,Export,fmt} from './ui';
export default function RecordConnections({row,onOpen}:{row:Row;onOpen:(r:Row)=>void}){
 const market=useData('market'),products=useData('products'),medical=useData('medical'),budget=useData('budget'),documents=useData('documents'),institutions=useData('institutions'),employers=useData('employers'),wholesalers=useData('wholesalers');
 const sources={market,products,medical,budget,documents,institutions,employers,wholesalers};
 const groups=useMemo(()=>connectedRecords(row,Object.fromEntries(Object.entries(sources).map(([key,v])=>[key,v.data]))),[row,market.data,products.data,medical.data,budget.data,documents.data,institutions.data,employers.data,wholesalers.data]);
 if(Object.values(sources).some(v=>!v.data))return <Loading error={Object.values(sources).find(v=>v.error)?.error}/>;
 return <div className="record-connections"><p className="footnote">{procedureKey(row)?'Procedura: '+procedureKey(row)+'. ':''}Lidhjet përdorin identifikuesit ose emërtimet e publikuara. Vitet dhe popullatat mund të ndryshojnë nga pamja fillestare; filtrat e saj ruhen kur kthehesh.</p>
 {!groups.length&&<p className="empty">Nuk u gjet lidhje e dokumentuar në paketë për këtë rekord.</p>}
 {groups.map(g=><details key={g.id} className="linked-group" open={['procedure','products','mentions','documents'].includes(g.id)}><summary>{g.title} <b>{fmt(g.rows.length)}</b></summary><p className="footnote">{g.basis}</p><Export rows={g.rows} name={'humanplus-lidhjet-'+g.id}/>{g.id==='documents'?<div className="linked-documents">{g.rows.map(r=><a key={r.path} href={vaultDocumentURL(r.path)} download={r.name}>{r.name}</a>)}</div>:<Table tableId={'links-'+g.id} pageSize={5} rows={g.rows} onRow={onOpen} columns={[{key:'title',title:'Rekordi',render:r=>r.title||r.item_description||r.requirement_as_published||[r.brand,r.model].filter(Boolean).join(' · ')||r.organization||r.municipality||r.company||r.company_name||r.name||r.id||'Rekord burimor'},{key:'year'},{key:'reference',title:'Procedura / referenca',render:r=>r.reference||r.procurement_id||r.procurement_code||r.notice_id||r.source_document||'—'},{key:'source',title:'Institucioni / burimi',render:r=>r.buyer||r.authority||r.organization||r.source_label||r.source_url||'—'}]}/>}</details>)}
 </div>;
}
