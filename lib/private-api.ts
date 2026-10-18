import {actualsApi} from './actuals-api';
import manifest from './import-manifest.json';
import {hasIdentity,filterMarket,csv,marketColumns} from './domain';
type Store = {get(key:string):Promise<any>; head?(key:string):Promise<any>; put(key:string,body:any,options?:any):Promise<any>};
const entries=manifest as Record<string,{sha256:string;bytes:number;contentType:string}>;
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
export async function privateApi(request:Request,bucket?:Store,development=false):Promise<Response|null> {
  const url=new URL(request.url); const path=url.pathname;
  if(!path.startsWith('/api/')) return null;
  if(path==='/api/public-content') return json({approvedItems:[]});
  if(path==='/api/demo') return json({synthetic:true,label:'DEMO SINTETIKE — jo të dhëna HumanPlus',records:[{year:'2025',buyer:'Institucioni shembull',reported_value:100,currency:'EUR'}]});
  // Sites ingress enforces owner-private access before this handler. This
  // write-only import can also accept its authenticated service callers, which
  // intentionally have no user identity. Only exact pre-reviewed bytes pass.
  // Local previews require the starter's loopback-only mock sign-in.
  if(path.startsWith('/api/import/')) {
    if(development && !hasIdentity(request)) return json({error:'Kërkohet hyrja'},401);
    if(request.method!=='PUT')return json({error:'Metodë e palejuar'},405);
    const key=path.slice('/api/import/'.length); const item=entries[key];
    if(!item)return json({error:'Objekti nuk lejohet'},404);
    if(!bucket)return json({error:'Magazina private mungon'},503);
    const length=Number(request.headers.get('content-length'));
    if(length && length!==item.bytes)return json({error:'Madhësi e pasaktë'},400);
    const reader=request.body?.getReader(); if(!reader)return json({error:'Trupi mungon'},400);
    const chunks:Uint8Array[]=[];let total=0;
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>item.bytes){await reader.cancel();return json({error:'Madhësi e pasaktë'},413);}chunks.push(value);}
    if(total!==item.bytes)return json({error:'Madhësi e pasaktë'},400);
    const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
    if(digest!==item.sha256)return json({error:'Përmbajtja nuk përputhet'},400);
    await bucket.put('sha256/'+digest,bytes,{httpMetadata:{contentType:item.contentType}});
    return json({sha256:digest,bytes:total});
  }
  if(!hasIdentity(request))return json({error:'Kërkohet hyrja e autorizuar'},401);
  if(path==='/api/actuals')return actualsApi(request,bucket);
  if(path==='/api/connections'&&request.method==='GET'){
    const sources=await Promise.all(Object.entries(entries).filter(([key])=>key.startsWith('data/')).map(async([key,item])=>{try{const object=bucket?await (bucket.head?bucket.head('sha256/'+item.sha256):bucket.get('sha256/'+item.sha256)):null;return {name:key.slice(5,-5),bytes:item.bytes,available:!!object};}catch{return {name:key.slice(5,-5),bytes:item.bytes,available:false};}}));
    return json({checkedAt:new Date().toISOString(),sourceDate:'2026-10-18',sources,external:{status:'not_configured'}});
  }
  let exportFilters:Record<string,string>=Object.fromEntries(url.searchParams);
  if(path==='/api/export/market'&&request.method==='POST'){
    if(request.headers.get('origin')!==url.origin)return json({error:'Origjinë e palejuar'},403);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Kërkohet JSON'},415);
    try{const reader=request.body?.getReader();if(!reader)return json({error:'Filtrat mungojnë'},400);let length=0;const chunks:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>65536){await reader.cancel();return json({error:'Përzgjedhja është shumë e madhe'},413);}chunks.push(value);}const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value)||Object.values(value).some(v=>typeof v!=='string'))return json({error:'Filtra të pavlefshëm'},400);exportFilters=value;
    }catch{return json({error:'Filtra të pavlefshëm'},400);}
  }else if(request.method!=='GET')return json({error:'Metodë e palejuar'},405);
  if(path==='/api/session')return json({authorized:true});
  let key='';let download=false;
  if(path.startsWith('/api/data/'))key='data/'+path.slice('/api/data/'.length)+'.json';
  else if(path.startsWith('/api/documents/')){key='documents/'+path.slice('/api/documents/'.length);download=true;}
  else if(path==='/api/export/market')key='data/market.json';
  else return json({error:'Nuk u gjet'},404);
  const item=entries[key];if(!item)return json({error:'Nuk u gjet'},404);
  const object=await bucket?.get('sha256/'+item.sha256);
  if(!object)return json({error:'Të dhënat private ende nuk janë ngarkuar'},503);
  if(path==='/api/export/market') {
    const data=await object.json();const rows=filterMarket(data.records,exportFilters);
    return new Response(csv(rows,marketColumns),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="humanplus-prokurimi.csv"'}});
  }
  return new Response(object.body,{headers:{...headers,'Content-Type':item.contentType,...(download?{'Content-Disposition':`attachment; filename="${key.split('/').at(-1)}"`}:{})}});
}
