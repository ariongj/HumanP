import type {Row} from './domain';
export const reviewStorageKey='humanplus-review-list-v1';
export const reviewStages={review:'Për shqyrtim',followup:'Për ndjekje',done:'Shqyrtuar'} as const;
export type ReviewStage=keyof typeof reviewStages;
export type ReviewEntry={stage:ReviewStage;savedAt:string};
export type ReviewList=Record<string,ReviewEntry>;
// Persist identifiers and review state only, never source text, contact details or credentials.
export function reviewKey(row:Row|null):string|null{
 if(!row)return null;
 if(row.row_key)return 'market:'+row.row_key;
 if(row.id&&(row.brand||row.model))return 'product:'+row.id;
 if(row.path&&row.name)return 'document:'+row.path;
 if(row.notice_id)return 'notice:'+row.notice_id;
 return null;
}
export function parseReviewList(raw:string|null):ReviewList{
 try{const input=JSON.parse(raw||'{}');if(!input||Array.isArray(input)||typeof input!=='object')return {};
 return Object.fromEntries(Object.entries(input).slice(0,2000).filter(([key,value])=>{
  const v=value as ReviewEntry;return /^(market|product|document|notice):.{1,500}$/.test(key)&&v&&Object.hasOwn(reviewStages,v.stage)&&typeof v.savedAt==='string'&&Number.isFinite(Date.parse(v.savedAt));
 }).map(([key,value])=>{const v=value as ReviewEntry;return [key,{stage:v.stage,savedAt:v.savedAt}];}));
 }catch{return {};}
}
export const searchText=(value:unknown)=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('sq').trim();
export function textMatches(row:Row,keys:string[],query:string){const hay=searchText(keys.map(key=>row[key]??'').join(' '));return searchText(query).split(/\s+/).filter(Boolean).every(word=>hay.includes(word));}
