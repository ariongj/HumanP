'use client';
import {SharedYearFilter} from './entity-filters';
import {useEntityScope} from './entity-context';
import {filterColumns,type ColumnFilters} from '@/lib/column-filters';
import {useEffect,useMemo,useState} from 'react';
import {countsBy} from '@/lib/medical';
import type {Row} from '@/lib/domain';
import {useWorkspace} from './workspace-context';
import {useData,Loading,Panel,Stat,SearchBox,Select,Bars,Table,Export,SourceDrawer,fmt} from './ui';

export default function Brands(){
 const {selection,select,scope:entityScope}=useEntityScope();const name=selection.brand,setName=(brand:string)=>select({...selection,brand});const products=useData('products'),market=useData('market');const {go,focus,year,setYear}=useWorkspace();const [columnFilters,setColumnFilters]=useState<ColumnFilters>({});const [tab,setTab]=useState('references'),[q,setQ]=useState(focus.q||''),[selected,setSelected]=useState<Row|null>(null);
 useEffect(()=>{setQ(focus.q||'');},[focus]);const isMention=tab==='mentions',key=isMention?'brand_or_model_as_published':'brand';
 const all:Row[]=isMention?market.data?.brandMentions2024||[]:products.data?.records||[];
 const rows=useMemo(()=>filterColumns(all,columnFilters).filter(r=>(!year||String(r.year??'unknown')===year)&&(!q.trim()||JSON.stringify(r).toLocaleLowerCase('sq').includes(q.trim().toLocaleLowerCase('sq')))),[all,name,key,year,q,columnFilters]);
 if(!products.data||!market.data)return <Loading error={products.error||market.error}/>;
 return <><div className="tabs" role="tablist" aria-label="Burimi i markave">{[['references','Markat në referencat e produkteve'],['mentions','Emërtimet në tituj · 2024']].map(([id,title])=><button key={id} role="tab" aria-selected={tab===id} className={tab===id?'active':''} onClick={()=>{setTab(id);setColumnFilters({});setQ('');setSelected(null);}}>{title}</button>)}</div>
 <p className="notice">{isMention?'Emërtime markash ose modelesh të gjetura në titujt e vitit 2024. Nuk i kemi bashkuar me prodhues të supozuar; një procedurë mund të përmendë disa emërtime.':'Emërtimet ruhen si në burim, përfshirë lidhjet që kërkojnë verifikim. Referencat nuk provojnë stok, çmim shitjeje ose marrëveshje përfaqësimi.'}</p>
 <div className="filterbar"><SearchBox value={q} onChange={setQ} placeholder="Kërko markë, model ose evidencë…"/><Select name={isMention?'Emërtimi në titull':'Marka'} value={name} onChange={setName} options={entityScope.brands}/><SharedYearFilter name="Viti i evidencës"/><button className="button secondary" onClick={()=>{setQ('');setName('');setYear('');setColumnFilters({});}}>Pastro filtrat</button><Export rows={rows} name={'humanplus-brands-'+tab}/></div>
 <div className="stats"><Stat label={isMention?'Përmendje në tituj':'Referenca produktesh'} value={fmt(rows.length)} note={`${all.length} brenda filtrave të panelit`}/><Stat label="Emërtime të ndryshme" value={fmt(new Set(rows.map(r=>r[key]).filter(Boolean)).size)} note="Shkrimi burimor; pa harmonizim"/><Stat label="Referenca prokurimi" value={fmt(new Set(rows.map(r=>r[isMention?'reference':'procurement_id']).filter(Boolean)).size)} note="Nuk janë sasi pajisjesh"/></div>
 <div className="grid two"><Panel title={isMention?'Emërtimet në përzgjedhje':'Referencat sipas markës'} subtitle="Kliko për të filtruar evidencën dhe eksportin."><Bars rows={countsBy(rows,key)} unit="referenca" onSelect={setName}/></Panel><Panel title={isMention?'Institucionet në tituj':'Kategoritë e produkteve'}><Bars rows={countsBy(rows,isMention?'buyer':'category')} unit="referenca" onSelect={isMention?undefined:category=>select({...selection,categories:[category]})}/></Panel></div>
 <Panel title="Evidenca e markave" subtitle="Hap detajet për specifikimet, burimin dhe kufizimet."><Table tableId={'brands-'+tab} columnFilters={{value:columnFilters,onChange:setColumnFilters}} rows={rows} columns={isMention?[{key,title:'Emërtimi burimor'},{key:'title'},{key:'buyer'},{key:'reference'},{key:'year'}]:[{key:'brand',title:'Marka'},{key:'model',title:'Modeli / produkti'},{key:'category'},{key:'year'},{key:'procurement_role',title:'Roli i evidencës'},{key:'procurement_id',title:'Referenca e procedurës'}]} onRow={r=>setSelected({...r,title:r.title||[r.brand,r.model].filter(Boolean).join(' · ')})}/></Panel>
 <div className="actions"><button className="button secondary" onClick={()=>go('products',{q:name||q})}>Hap produktet dhe specifikimet</button><button className="button secondary" onClick={()=>go('reports',{tab:'products'})}>Raporti i produkteve</button><button className="button secondary" onClick={()=>go('data',{tab:isMention?'market':'products'})}>Hap dataset-in burimor</button></div>
 <SourceDrawer row={selected} onClose={()=>setSelected(null)}/></>;
}
