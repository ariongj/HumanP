'use client';
import {filterColumns,type ColumnFilters} from '@/lib/column-filters';
import {useMemo,useState} from 'react';
import {ArrowUpRight,Download} from 'lucide-react';
import {dataIndex} from '@/lib/data-index';
import {sourceCounts} from '@/lib/source-summary';
import {objectTables} from '@/lib/source-tables';
import type {Row} from '@/lib/domain';
import {useWorkspace} from './workspace-context';
import {useData,Loading,Panel,Stat,SearchBox,Table,Export,SourceDrawer,download,fmt} from './ui';

function Dataset({id}:{id:string}){
 const {data,error}=useData(id),{go}=useWorkspace();const [columnFilters,setColumnFilters]=useState<ColumnFilters>({});const [table,setTable]=useState(''),[q,setQ]=useState(''),[selected,setSelected]=useState<Row|null>(null);
 const tables=useMemo(()=>data?objectTables(data):[],[data]);
 const current=tables.find(t=>t.name===table)||tables.find(t=>t.name==='root.records')||tables[0];
 const rows=useMemo(()=>filterColumns(current?.rows||[],columnFilters).filter(r=>!q.trim()||JSON.stringify(r).toLocaleLowerCase('sq').includes(q.trim().toLocaleLowerCase('sq')))||[],[current,q,columnFilters]);
 const columns=useMemo(()=>Array.from(new Set((current?.rows||[]).flatMap(r=>Object.keys(r)))).map(key=>({key})),[current]);
 if(!data)return <Loading error={error}/>;const entry=dataIndex.find(x=>x.id===id)!;
 return <Panel title={entry.title} subtitle={entry.scope} action={<button className="text-button" onClick={()=>go(entry.page,{tab:id})}>Hap panelin <ArrowUpRight size={15}/></button>}>
  <div className="filterbar"><label className="select"><span>Tabela burimore</span><select aria-label="Tabela burimore" value={current?.name||''} onChange={e=>{setTable(e.target.value);setQ('');setColumnFilters({});}}>{tables.map(t=><option key={t.name} value={t.name}>{t.name} · {fmt(t.rows.length)}</option>)}</select></label><SearchBox value={q} onChange={setQ} placeholder="Kërko në tabelën burimore…"/><Export rows={rows} name={'humanplus-'+id+'-'+(current?.name||'data')}/><button className="button secondary" onClick={()=>download('humanplus-'+id+'.json',JSON.stringify(data,null,2))}><Download size={15}/> JSON i plotë</button></div>
  <p className="footnote">CSV përmban të gjithë rreshtat e filtruar dhe të gjitha fushat. JSON përmban të gjithë dataset-in, pavarësisht filtrave.</p>
  <Table tableId={'data-'+id+'-'+current?.name} columnFilters={{value:columnFilters,onChange:setColumnFilters}} initialVisible={columns.slice(0,8).map(c=>c.key)} key={current?.name} rows={rows} columns={columns} onRow={setSelected}/><SourceDrawer row={selected} onClose={()=>setSelected(null)}/>
 </Panel>;
}
export default function DataHub(){const {focus,go}=useWorkspace();const [id,setId]=useState(dataIndex.some(d=>d.id===focus.tab)?focus.tab!:'market');
 return <><div className="stats"><Stat label="Dataset-e të ngarkuara" value={sourceCounts.datasets} note="Burimet e paketës së integruar"/><Stat label="Dokumente origjinale" value={sourceCounts.documents} note="Të kërkueshme dhe të shkarkueshme"/><Stat label="Snapshot burimor" value="18.10.2026" note="Përfshin historikun e rikuperuar 2024"/></div>
 <div className="hub-layout"><Panel title="Indeksi i të dhënave"><div className="dataset-list">{dataIndex.map(d=><button key={d.id} aria-pressed={id===d.id} className={id===d.id?'active':''} onClick={()=>setId(d.id)}><strong>{d.title}</strong><small>{d.scope}</small></button>)}</div><button className="button secondary full" onClick={()=>go('documents')}>Hap dokumentet origjinale</button></Panel><div className="hub-detail"><Dataset key={id} id={id}/></div></div></>;
}
