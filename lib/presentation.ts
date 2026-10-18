import type {Row} from './domain';
import {countsBy,sourceISO} from './medical';

export const stageNames:Record<string,string>={tender_notice:'Tender i publikuar',award_notice:'Dhënie kontrate',contract_signing_notice:'Nënshkrim kontrate',cancellation_notice:'Anulim',correction_notice:'Korrigjim'};
export function medicalBrief(rows:Row[]){
 const procedures=new Set(rows.map(r=>r.procedure_key).filter(Boolean));
 const buyers=new Set(rows.map(r=>r.buyer).filter(Boolean));
 const stages=countsBy(rows,'evidence_classification').map(r=>({...r,key:r.label,label:stageNames[r.label]||r.label}));
 const categories=countsBy(rows,'category_sq');
 const daily=countsBy(rows,'notice_date').filter(r=>sourceISO(r.label)).sort((a,b)=>sourceISO(a.label).localeCompare(sourceISO(b.label)));
 return {notices:rows.length,procedures:procedures.size,buyers:buyers.size,stages,categories,daily,changes:rows.filter(r=>['cancellation_notice','correction_notice'].includes(r.evidence_classification)).length};
}
export type PresentationInputs={volume:number|null;price:number|null;unitCost:number|null;fixed:number|null};
export const emptyPresentationInputs=():PresentationInputs=>({volume:null,price:null,unitCost:null,fixed:null});
export function isPresentationInputs(value:unknown):value is PresentationInputs{
 return !!value&&typeof value==='object'&&['volume','price','unitCost','fixed'].every(k=>{const n=(value as Record<string,unknown>)[k];return n===null||typeof n==='number'&&Number.isFinite(n)&&n>=0;});
}
export function presentationScenario(input:PresentationInputs){
 if(!isPresentationInputs(input))throw new Error('Hyrjet duhet të jenë numra jonegativë.');
 const revenue=input.volume!==null&&input.price!==null?input.volume*input.price:null;
 const variable=input.volume!==null&&input.unitCost!==null?input.volume*input.unitCost:null;
 const operating=revenue!==null&&variable!==null&&input.fixed!==null?revenue-variable-input.fixed:null;
 const unitMargin=input.price!==null&&input.unitCost!==null?input.price-input.unitCost:null;
 const breakEven=unitMargin!==null&&unitMargin>0&&input.fixed!==null?Math.ceil(input.fixed/unitMargin):null;
 if([revenue,variable,operating,unitMargin,breakEven].some(n=>n!==null&&!Number.isFinite(n)))throw new Error('Hyrjet janë tepër të mëdha për llogaritjen.');
 return {revenue,variable,operating,unitMargin,breakEven};
}
