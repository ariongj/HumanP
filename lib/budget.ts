import {numberOrNull,type Row} from './domain';
export const budgetViews = [
 ['central_budget','Ndarjet qendrore','total','organization'],
 ['municipal_budget','Ndarjet komunale','total','municipality'],
 ['central_programmes_2024','Programet qendrore','total_eur','organization'],
 ['municipal_programmes_2024','Programet komunale','total','municipality'],
 ['municipal_grants_2024','Grantet shëndetësore','combined_health_grant_financing','municipality'],
 ['capital_projects','Projektet kapitale','approved_current_year_eur','organization_name'],
 ['execution_2023','Pagesat · Thesari','payments_eur','organization'],
 ['audited_execution_2024','Pagesat · auditimi','payments_eur','organization'],
 ['health_share','Pesha e shëndetësisë','health_cash_eur','year'],
 ['functional_execution_2024','Pagesat sipas funksionit','payments_eur','label'],
 ['project_cash','Pagesa projektesh','cash_paid_period_eur','municipality'],
] as const;
export function budgetRows(data:Row,tab:string):Row[]{return (tab==='health_share'?data.supplement?.health_actual_share:tab==='project_cash'?data.supplement?.prishtina_project_cash:data[tab])||[];}
export function filterBudget(rows:Row[],filters:{year:string;institution:string;institutionKey:string;q:string;tab:string;level:string;capitalScope:string}){
 const {year,institution,institutionKey,q,tab,level,capitalScope}=filters;
 return rows.filter(r=>(!year||String(r.year||r.budget_year)===year)&&(!institution||String(r[institutionKey])===institution)&&(!q||JSON.stringify(r).toLocaleLowerCase('sq').includes(q.toLocaleLowerCase('sq')))
  &&(tab!=='municipal_programmes_2024'||r.hierarchy_level===level)
  &&(!['execution_2023','audited_execution_2024'].includes(tab)||r.row_type===(level==='economic_category'?'economic_category':'organization_total'))
  &&(tab!=='municipal_grants_2024'||r.row_type==='municipality')
  &&(tab!=='capital_projects'||(capitalScope==='context'?r.inclusion_status==='context':r.inclusion_status!=='context')));
}
// Unknown values stay unknown; a partial sum must not be presented as complete.
export function budgetSum(rows:Row[],key:string){const values=rows.map(r=>numberOrNull(r[key]));return !values.length||values.some(v=>v===null)?null:values.reduce<number>((s,v)=>s+v!,0);}
export function budgetYearSummary(data:Row,year:string){
 const selected=(tab:string)=>budgetRows(data,tab).filter(r=>!year||String(r.year||r.budget_year)===year);
 return {central:budgetSum(selected('central_budget'),'total'),municipal:budgetSum(selected('municipal_budget'),'total'),treasury:budgetSum(selected('execution_2023').filter(r=>r.row_type==='organization_total'),'payments_eur'),health:budgetSum(selected('health_share'),'health_cash_eur')};
}
