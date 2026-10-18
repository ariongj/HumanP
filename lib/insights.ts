import {project,scenarios,type Plan,type N} from './finance';
import type {Row} from './domain';
export type Adjustments={volume:number;price:number;fixed:number};
export const neutral:Adjustments={volume:0,price:0,fixed:0};
export function adjustPlan(plan:Plan,a:Adjustments):Plan {
 const scale=(n:N,p:number)=>n===null?null:n*(1+p/100);
 return {...plan,services:plan.services.map(s=>({...s,price:scale(s.price,a.price)})),personnel:plan.personnel.map(s=>({...s,salary:scale(s.salary,a.fixed)})),overhead:plan.overhead.map(n=>scale(n,a.fixed))};
}
export function compareScenarios(plan:Plan,a:Adjustments=neutral){const adjusted=adjustPlan(plan,a);return Object.entries(scenarios).map(([name,assumptions])=>({name,...project({...adjusted,scenario:name,assumptions},1+a.volume/100)}));}
export function sumKnown(values:N[]):N{return values.length&&values.every(x=>x!==null)?values.reduce<number>((s,x)=>s+x!,0):null;}
export function procurementLinks(rows:Row[]){const pairs=new Map<string,{buyer:string;supplier:string;count:number}>();for(const r of rows){if(!r.buyer||!r.supplier)continue;const key=JSON.stringify([r.buyer,r.supplier]);const pair=pairs.get(key)||{buyer:r.buyer,supplier:r.supplier,count:0};pair.count++;pairs.set(key,pair);}return [...pairs.values()].sort((a,b)=>b.count-a.count).slice(0,8);}
export type Actual={month:string;revenue:number;variable:number;fixed:number};
export function validateActuals(value:unknown):Actual[]{
 if(!Array.isArray(value)||!value.length||value.length>120)throw new Error('Lejohen 1–120 muaj.');
 const seen=new Set<string>();return value.map((r,i)=>{if(!r||typeof r!=='object'||typeof r.month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(r.month))throw new Error(`Rreshti ${i+1}: muaji duhet YYYY-MM.`);if(seen.has(r.month))throw new Error(`Muaj i përsëritur: ${r.month}.`);seen.add(r.month);for(const k of ['revenue','variable','fixed'])if(typeof r[k]!=='number'||!Number.isFinite(r[k])||r[k]<0||r[k]>1e12)throw new Error(`Rreshti ${i+1}: ${k} duhet numër jonegativ; bosh nuk do të thotë zero.`);return {month:r.month,revenue:r.revenue,variable:r.variable,fixed:r.fixed};}).sort((a,b)=>a.month.localeCompare(b.month));
}
export function parseActualsCSV(text:string){
 if(text.length>60000)throw new Error('CSV duhet të jetë nën 60 KB.');
 const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);const delimiter=lines[0]?.includes(';')?';':',';
 if(lines[0]?.split(delimiter).map(s=>s.trim().replace(/^"(.*)"$/,'$1')).join(delimiter)!==['month','revenue_eur','variable_cost_eur','fixed_cost_eur'].join(delimiter))throw new Error('Përdor kolonat e modelit CSV, në të njëjtin rend.');
 return validateActuals(lines.slice(1).map((line,i)=>{const c=line.split(delimiter).map(s=>s.trim().replace(/^"(.*)"$/,'$1'));if(c.length!==4||c.slice(1).some(s=>!/^\d+(\.\d+)?$/.test(s)))throw new Error(`Rreshti ${i+2}: plotëso të katër kolonat; përdor pikë dhjetore dhe pa ndarës mijëshe.`);return {month:c[0],revenue:Number(c[1]),variable:Number(c[2]),fixed:Number(c[3])};}));
}
