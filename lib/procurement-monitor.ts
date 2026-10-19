import type {Row} from './domain';
import {procedureKey} from './record-links';

export const monitorStages:Record<string,string>={tender_notice:'Njoftim tenderi',award_notice:'Dhënie kontrate',signing_notice:'Nënshkrim kontrate',cancellation_notice:'Anulim',correction_notice:'Korrigjim',decision_notice:'Vendim',other_notice:'Njoftim tjetër'};
export function mergeMonitoredNotices(data:Row, live:Row[]):Row {
 const original:Row[]=data.notices||[], byId=new Map(live.map(r=>[String(r.notice_id),r]));
 const merge=(old:Row)=>{const fresh=byId.get(String(old.notice_id));if(!fresh)return old;byId.delete(String(old.notice_id));return {...old,...fresh,category_sq:old.category_sq||fresh.category_sq,supplier:old.supplier||fresh.supplier,archived_snapshot_notice:old};};
 return {...data,notices:[...original.map(merge),...byId.values()]};
}
export function deadlineDay(row:Row):string {
 const m=String(row.deadline_displayed||'').match(/^(\d{2})\.(\d{2})\.(\d{4})/);return m?`${m[3]}-${m[2]}-${m[1]}`:'';
}
export function noticeState(row:Row,all:Row[],today:string):string {
 const key=procedureKey(row),related=key?all.filter(r=>procedureKey(r)===key):[row];
 const sorted=related.slice().sort((a,b)=>String(b.published_iso||'').localeCompare(String(a.published_iso||''))||Number(b.notice_id)-Number(a.notice_id));
 // A later closing notice takes precedence. Corrections alone never prove reopening.
 const lastDecision=sorted.find(r=>['tender_notice','cancellation_notice','award_notice','signing_notice','decision_notice'].includes(r.evidence_classification));
 if(lastDecision&&lastDecision.evidence_classification!=='tender_notice')return (monitorStages[lastDecision.evidence_classification]||'Për shqyrtim')+' · verifiko lotet';
 const deadline=deadlineDay(sorted.find(r=>r.deadline_displayed)||row);
 if(!lastDecision||!deadline)return 'Status për verifikim';
 if(deadline<today)return 'Afat i kaluar';
 return 'Afat i ardhshëm · verifiko';
}
export function monitorFreshness(lastSuccess:string|null,now=Date.now()) {
 if(!lastSuccess)return 'Pa kontroll të plotë';
 return now-Date.parse(lastSuccess)>36*60*60*1000?'Kontrolli është vonuar':'Kontroll i fundit brenda 36 orëve';
}
