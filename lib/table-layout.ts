export type TableLayout={order:string[];hidden:string[];widths:Record<string,number>;dense:boolean;pin:boolean;group:string;sort:{key:string;direction:'asc'|'desc'}};
export function tableLayout(value:any,keys:string[],initialVisible?:string[]):TableLayout{
 const list=(v:any):string[]=>Array.isArray(v)?[...new Set<string>(v.filter((k:any)=>typeof k==='string'&&keys.includes(k)))]:[];
 const order=list(value?.order);const hidden=value?list(value.hidden):initialVisible?keys.filter(k=>!initialVisible.includes(k)):[];
 return {order:[...order,...keys.filter(k=>!order.includes(k))],hidden:hidden.length===keys.length?hidden.slice(1):hidden,widths:Object.fromEntries(Object.entries(value?.widths||{}).filter(([k,v])=>keys.includes(k)&&typeof v==='number'&&Number.isFinite(v)&&v>=120&&v<=900)) as Record<string,number>,dense:value?.dense===true,pin:value?.pin===true,group:keys.includes(value?.group)?value.group:'',sort:{key:keys.includes(value?.sort?.key)?value.sort.key:'',direction:value?.sort?.direction==='desc'?'desc':'asc'}};
}
export function moveColumn(order:string[],key:string,direction:number){const from=order.indexOf(key),to=from+direction;if(from<0||to<0||to>=order.length)return order;const next=[...order];[next[from],next[to]]=[next[to],next[from]];return next;}
