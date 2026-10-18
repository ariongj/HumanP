import {validateActuals} from './insights';
export type ActualsStore={get(key:string):Promise<any>;put(key:string,body:any,options?:any):Promise<any>};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function actualsApi(request:Request,bucket?:ActualsStore){
 if(!bucket)return json({error:'Magazina private mungon.'},503);
 const id=request.headers.get('oai-authenticated-user-id');if(!id||!request.headers.get('oai-authenticated-user-email'))return json({error:'Kërkohet hyrja.'},401);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id)))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const key='actuals/'+hash+'.json';
 if(request.method==='GET'){const object=await bucket.get(key);return json({dataset:object?await object.json():null,etag:object?.etag||null});}
 if(request.method!=='PUT')return json({error:'Metodë e palejuar.'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Origjinë e palejuar.'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Kërkohet JSON.'},415);
 try{let size=0;const chunks:Uint8Array[]=[];const reader=request.body?.getReader();if(!reader)return json({error:'Trupi mungon.'},400);while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();return json({error:'Skedari është shumë i madh.'},413);}chunks.push(value);}const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}const input=JSON.parse(new TextDecoder().decode(bytes));const records=validateActuals(input.records);if(typeof input.sourceName!=='string'||input.sourceName.length>180||!input.sourceName.trim()||!(input.etag===null||typeof input.etag==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(input.etag)))return json({error:'Referenca ose versioni i burimit mungon.'},400);
 const dataset={records,sourceName:input.sourceName.trim(),importedAt:new Date().toISOString(),classification:'owner_supplied_unaudited_actuals'};
 const saved=await bucket.put(key,JSON.stringify(dataset),{onlyIf:input.etag===null?{etagDoesNotMatch:'*'}:{etagMatches:input.etag},httpMetadata:{contentType:'application/json'}});
 if(!saved)return json({error:'Të dhënat ndryshuan në një sesion tjetër. Rifresko dhe shqyrto përpara ruajtjes.'},409);
 return json({dataset,etag:saved.etag});
 }catch(e){return json({error:e instanceof Error?e.message:'Importi dështoi.'},400);}
}
