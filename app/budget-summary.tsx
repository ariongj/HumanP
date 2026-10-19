'use client';
import {SharedYearFilter} from './entity-filters';
import type {Row} from '@/lib/domain';
import {budgetYearSummary,budgetRows,budgetSum} from '@/lib/budget';
import {useWorkspace} from './workspace-context';
import {Panel,Bars,Stat,Select,euro} from './ui';
export default function BudgetSummary({data,compact=false}:{data:Row;compact?:boolean}){
 const {year,setYear,go}=useWorkspace(),summary=budgetYearSummary(data,year);
 const years=Array.from(new Set(budgetRows(data,'central_budget').map(r=>String(r.year)))).sort();
 if(compact)return <div className="notice">Mbulimi i paketës së plotë: 2024 · 3 institucione qendrore · 38 komuna · programe, grante, projekte kapitale dhe pagesa nga burime të lidhura. Zgjidh pamjen dhe vitin më poshtë.</div>;
 return <Panel title="Buxheti dhe pagesat e shëndetësisë" subtitle="Ndarjet dhe pagesat kanë mbulim të ndryshëm. Treguesit nuk mblidhen me njëri-tjetrin." action={<SharedYearFilter name="Viti i buxhetit"/>}>
 <div className="stats">{[['central','Ndarje qendrore','central_budget','Institucionet në përzgjedhje · buxhet fillestar'],['municipal','Ndarje komunale','municipal_budget','Programet shëndetësore · buxhet fillestar'],['treasury','Pagesa qendrore · Thesari','execution_2023','Ekzekutim në para · baza e Thesarit'],['health','Pagesa të funksionit 07','health_share','Të gjitha nivelet · klasifikimi funksional']].map(([key,title,tab,note])=><div key={key}><Stat label={title+' · EUR'} value={summary[key as keyof typeof summary]===null?'Pa të dhëna':euro(summary[key as keyof typeof summary])} note={(year||'Të gjitha vitet')+' · '+note}/><button className="text-button" onClick={()=>go('budget',{year,tab})}>Hap rreshtat dhe burimet</button></div>)}</div>
 <Bars rows={years.map(y=>({label:y,value:budgetSum(budgetRows(data,'central_budget').filter(r=>String(r.year)===y),'total')!}))} unit="EUR" onSelect={setYear}/><p className="footnote">Ndarjet fillestare qendrore sipas vitit, në EUR nominale. Kliko vitin për të lidhur treguesit me përzgjedhjen. Burimet 2024: ligji 08/L-260, raporti vjetor i Thesarit dhe ZKA.</p>
 </Panel>;
}
