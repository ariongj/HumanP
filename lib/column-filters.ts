import type {Row} from './domain';
export type ColumnRule={op:'contains'|'equals'|'gte'|'lte'|'missing'|'present';value:string};
export type ColumnFilters=Record<string,ColumnRule>;
export const columnOperators={contains:'Përmban',equals:'Është saktë',gte:'≥',lte:'≤',missing:'Mungon',present:'Ka vlerë'};
export const activeColumnRules=(filters:ColumnFilters)=>Object.entries(filters).filter(([,r])=>['missing','present'].includes(r.op)||r.value.trim()!=='');
export function parseColumnFilters(value:string|undefined):ColumnFilters|null{
 if(!value)return {};try{const parsed=JSON.parse(value);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed).length>100)return null;
  if(Object.entries(parsed).some(([key,r]:[string,any])=>key.length>150||!r||typeof r!=='object'||!Object.hasOwn(columnOperators,r.op)||typeof r.value!=='string'||r.value.length>1000))return null;return parsed;
 }catch{return null;}
}
const text=(v:unknown)=>String(v&&typeof v==='object'?JSON.stringify(v):v??'').normalize('NFC').toLocaleLowerCase('sq');
export function filterColumns(rows:Row[],filters:ColumnFilters|null):Row[]{
 if(filters===null)return [];const active=activeColumnRules(filters);if(!active.length)return rows;
 return rows.filter(row=>active.every(([key,rule])=>{const v=row[key],missing=v===null||v===undefined||v==='';if(rule.op==='missing')return missing;if(rule.op==='present')return !missing;if(missing)return false;
  if(rule.op==='gte'||rule.op==='lte'){const a=typeof v==='number'||typeof v==='string'&&v.trim()!==''?Number(v):NaN,b=Number(rule.value);return Number.isFinite(a)&&Number.isFinite(b)&&(rule.op==='gte'?a>=b:a<=b);}
  return rule.op==='equals'?text(v)===text(rule.value).trim():text(v).includes(text(rule.value).trim());
 }));
}
