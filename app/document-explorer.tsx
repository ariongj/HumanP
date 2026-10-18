'use client';
import {useEffect,useMemo,useState} from 'react';
import {appFetch} from '@/lib/browser-vault';
import {groupMarket,type Row} from '@/lib/domain';
import {sourceTables,type SourceTable} from '@/lib/source-tables';
import {Panel,Loading,SearchBox,Select,Table,Bars,Export,SourceDrawer,display,fmt} from './ui';
export default function DocumentExplorer({document:doc,onClose}:{document:Row;onClose:()=>void}){
 const [tables,setTables]=useState<SourceTable[]>([]),[error,setError]=useState(''),[table,setTable]=useState(''),[q,setQ]=useState(''),[dimension,setDimension]=useState(''),[value,setValue]=useState(''),[selected,setSelected]=useState<Row|null>(null);
 useEffect(()=>{let current=true;setTables([]);setError('');setQ('');setValue('');appFetch('/api/'+doc.id).then(async r=>{if(!r.ok)throw new Error('Dokumenti nuk mund të hapej.');return r.text();}).then(text=>{if(!current)return;const parsed=sourceTables(text,doc.name);setTables(parsed);setTable(parsed[0].name);setDimension('');}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[doc.id,doc.name]);
 const all=tables.find(t=>t.name===table)?.rows||[];
 const columns=useMemo(()=>Array.from(new Set(all.flatMap(r=>Object.keys(r)))),[all]);
 const rows=useMemo(()=>all.filter(r=>(!q||JSON.stringify(r).toLocaleLowerCase('sq').includes(q.toLocaleLowerCase('sq')))&&(!dimension||!value||String(r[dimension]||'E papërcaktuar')===value)),[all,q,dimension,value]);
 return <Panel title={'Eksploro: '+doc.name} subtitle="Tabelë nga dokumenti origjinal. Grafiku numëron rreshtat e përzgjedhur; nivelet e burimit mund të mbivendosen." action={<button className="button secondary" onClick={onClose}>Mbyll eksploruesin</button>}>
 {!tables.length?<Loading error={error}/>:<><div className="filterbar"><Select name="Tabela burimore" value={table} all="Zgjidh tabelën" options={tables.map(t=>({value:t.name,label:t.name+' · '+fmt(t.rows.length)}))} onChange={v=>{setTable(v||tables[0].name);setDimension('');setValue('');setQ('');}}/><SearchBox value={q} onChange={setQ}/><Select name="Grupimi i burimit" value={dimension} options={columns} onChange={v=>{setDimension(v);setValue('');}}/>{dimension&&<Select name="Vlera e grupit" value={value} options={groupMarket(all,dimension).map(r=>r.label)} onChange={setValue}/>}<Export rows={rows} name={'humanplus-source-'+doc.name.replace(/\.[^.]+$/,'')}/></div>
 {dimension&&<Bars rows={groupMarket(rows,dimension).slice(0,10)} unit="rreshta" onSelect={setValue}/>}
 <Table rows={rows} columns={columns.map(key=>({key,render:r=><span className="source-cell">{display(r[key])}</span>}))} onRow={r=>setSelected({...r,source_document:doc.id,source_sha256:doc.sha256,source_table:table})}/><p className="footnote">{fmt(rows.length)} / {fmt(all.length)} rreshta · SHA-256: {doc.sha256}</p><SourceDrawer row={selected} onClose={()=>setSelected(null)}/></>}
 </Panel>;
}
