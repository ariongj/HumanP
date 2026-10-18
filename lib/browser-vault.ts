import {readSavedVault,writeSavedVault,deleteSavedVault,type SavedVault} from './vault-storage';
import manifest from './import-manifest.json';
import {decryptPackage} from './encrypted-package';
import {filterMarket,csv,marketColumns} from './domain';
import {validateActuals} from './insights';
const entries=manifest as Record<string,{sha256:string;bytes:number;contentType:string}>;
let objects=new Map<string,Uint8Array<ArrayBuffer>>();
let urls=new Map<string,string>();
export type VaultStatus={state:'empty'|'restoring'|'saved'|'embedded'|'temporary'|'error';message?:string;fileName?:string;savedAt?:string;bytes?:number};
let status:VaultStatus={state:'empty'};
let currentPackage:SavedVault|null=null;
let restoring:Promise<boolean>|null=null;
let channel:BroadcastChannel|null=null;
export const getVaultStatus=():VaultStatus=>({...status});
export const isProtectedVault=()=>typeof document!=='undefined'&&document.documentElement.dataset.host==='encrypted-pages';
export const isEmbeddedVault=()=>typeof document!=='undefined'&&['portable','encrypted-pages'].includes(document.documentElement.dataset.host||'');
const digest=async(bytes:BufferSource)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
const fingerprint=()=>digest(new TextEncoder().encode(JSON.stringify(Object.entries(entries).sort(([a],[b])=>a.localeCompare(b)))));
function listenForRemoval(){if(!channel&&typeof BroadcastChannel!=='undefined'){channel=new BroadcastChannel('humanplus-private-vault');channel.onmessage=e=>{if(e.data==='removed'||e.data==='locked')location.reload();};}}
function activate(verified:Map<string,Uint8Array<ArrayBuffer>>){for(const url of urls.values())URL.revokeObjectURL(url);urls=new Map();objects=verified;listenForRemoval();}
async function remember(value:SavedVault){try{await writeSavedVault(value);status={state:'saved',fileName:value.fileName,savedAt:value.savedAt,bytes:value.blob.size};void navigator.storage?.persist?.().catch(()=>false);}catch{status={state:'temporary',fileName:value.fileName,bytes:value.blob.size,message:'Paneli është hapur, por shfletuesi nuk lejoi ruajtjen. Kjo kopje do të humbasë pas rifreskimit. Liro hapësirë ose lejo ruajtjen lokale dhe provo sërish.'};}finally{window.dispatchEvent(new Event('humanplus-vault-status'));}}
export async function retrySavingVault(){if(currentPackage)await remember(currentPackage);return getVaultStatus();}
export async function forgetVault(){await deleteSavedVault();objects.clear();for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();currentPackage=null;restoring=null;status={state:'empty'};channel?.postMessage('removed');}
export async function savedPackageBlob(){return currentPackage;}
export async function restoreVault():Promise<boolean>{
 listenForRemoval();
 if(objects.size)return true;
 if(restoring)return restoring;
 restoring=(async()=>{status={state:'restoring'};try{
  if(isProtectedVault()){status={state:'empty'};return false;}
  if(isEmbeddedVault()){
   const element=document.getElementById('humanplus-private-package');
   if(!element?.textContent)throw new Error('Kopja e plotë mungon nga ky skedar. Hape përsëri skedarin origjinal të panelit.');
   const binary=atob(element.textContent.trim());const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
   const blob=new Blob([bytes],{type:'application/gzip'});const verified=await verifyBundle(blob,()=>{});
   activate(verified);currentPackage={version:1,fingerprint:await fingerprint(),fileName:'HumanPlus-Private-2026-10-18.humanplus',savedAt:'2026-10-18T00:00:00Z',blob};
   status={state:'embedded',fileName:currentPackage.fileName,bytes:blob.size};return true;
  }
  const saved=await readSavedVault();if(!saved){status={state:'empty'};return false;}
  if(saved.version!==1||!(saved.blob instanceof Blob)||saved.fingerprint!==await fingerprint())throw new Error('Kopja e ruajtur i përket një pakete tjetër. Hap paketën për këtë version; draftet e tua ruhen.');
  const verified=await verifyBundle(saved.blob,()=>{});activate(verified);currentPackage=saved;status={state:'saved',fileName:saved.fileName,savedAt:saved.savedAt,bytes:saved.blob.size};return true;
 }catch(error){status={state:'error',message:error instanceof Error?error.message:'Kopja lokale nuk mund të lexohej. Hape paketën një herë për ta rikthyer.'};return false;}})();return restoring;
}

export const isBrowserVault=()=>typeof window!=='undefined'&&['github-pages','portable','encrypted-pages'].includes(document.documentElement.dataset.host||'');
export async function unlockProtectedBundle(username:string,password:string,onProgress:(n:number)=>void){
 if(!isProtectedVault())throw new Error('Paneli nuk përdor hyrje me fjalëkalim.');
 const element=document.getElementById('humanplus-encrypted-package');
 if(!element?.textContent)throw new Error('Paketa e mbrojtur mungon. Rifresko faqen.');
 let blob:Blob;
 try{blob=await decryptPackage(JSON.parse(element.textContent),username,password);}catch{throw new Error('Emri i përdoruesit ose fjalëkalimi nuk është i saktë.');}
 const verified=await verifyBundle(blob,onProgress);
 activate(verified);currentPackage={version:1,fingerprint:await fingerprint(),fileName:'HumanPlus-Private-2026-10-18.humanplus',savedAt:'2026-10-18T00:00:00Z',blob};
 status={state:'embedded',fileName:currentPackage.fileName,bytes:blob.size};
}
export function lockProtectedVault(){objects.clear();for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();currentPackage=null;restoring=null;status={state:'empty'};channel?.postMessage('locked');location.reload();}
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
async function verifyBundle(file:Blob,onProgress:(n:number)=>void){
 if(file.size>80_000_000)throw new Error('Paketa e kompresuar është më e madhe se kufiri 80 MB.');
 const stream=file.stream().pipeThrough(new DecompressionStream('gzip'));const reader=stream.getReader();const chunks:Uint8Array[]=[];let length=0;const expected=Object.values(entries).reduce((s,e)=>s+e.bytes,0);const limit=Math.ceil(expected*1.36)+1_000_000;
 while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new Error('Madhësia e paketës nuk përputhet.');}chunks.push(value);}
 const value=JSON.parse(await new Blob(chunks as BlobPart[]).text());
 if(value.format!=='humanplus-private-v1'||!value.objects||typeof value.objects!=='object'||Array.isArray(value.objects)||Object.keys(value.objects).length!==Object.keys(entries).length)throw new Error('Paketa nuk është për këtë version të HumanPlus.');
 const verified=new Map<string,Uint8Array<ArrayBuffer>>();let count=0;
 for(const [key,item] of Object.entries(entries)){
  const encoded=value.objects[key];if(typeof encoded!=='string'||encoded.length>Math.ceil(item.bytes/3)*4)throw new Error('Objekt i pavlefshëm: '+key);
  const binary=atob(encoded);const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));if(bytes.length!==item.bytes)throw new Error('Madhësi e pasaktë: '+key);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');if(hash!==item.sha256)throw new Error('Përmbajtja nuk përputhet: '+key);
  verified.set(key,bytes);onProgress(Math.round(++count/Object.keys(entries).length*100));
 }
 return verified;
}
export async function unlockBundle(file:File,onProgress:(n:number)=>void){
 const verified=await verifyBundle(file,onProgress);const value:SavedVault={version:1,fingerprint:await fingerprint(),fileName:file.name,savedAt:new Date().toISOString(),blob:file};
 activate(verified);currentPackage=value;await remember(value);return getVaultStatus();
}
export function vaultDocumentURL(key:string){if(!isBrowserVault())return '/api/'+key;if(urls.has(key))return urls.get(key)!;const data=objects.get(key);if(!data)return '#';const url=URL.createObjectURL(new Blob([data],{type:entries[key].contentType}));urls.set(key,url);return url;}
export async function appFetch(path:string,options?:RequestInit):Promise<Response>{
 if(!isBrowserVault())return fetch(path,options);
 if(path==='/api/session'){const ready=await restoreVault();return json({authorized:ready},ready?200:401);}
 if(path==='/api/public-content')return json({approvedItems:[]});
 if(!objects.size)return json({error:'Hap paketën private në këtë shfletues.'},401);
 if(path==='/api/connections')return json({checkedAt:new Date().toISOString(),sourceDate:'2026-10-18',sources:Object.entries(entries).filter(([key])=>key.startsWith('data/')).map(([key,item])=>({name:key.slice(5,-5),bytes:item.bytes,available:objects.has(key)})),external:{status:'not_configured'}});
 if(path==='/api/actuals'){
  try{const key='humanplus-pages-actuals-v1';const current=JSON.parse(localStorage.getItem(key)||'null');if(options?.method==='PUT'){
   const input=JSON.parse(String(options.body||''));const records=validateActuals(input.records);
   if(input.etag!==(current?.etag||null))return json({error:'Rezultatet ndryshuan. Rifresko përpara zëvendësimit.'},409);
   const value={dataset:{records,sourceName:String(input.sourceName||'Import lokal').slice(0,200),importedAt:new Date().toISOString(),classification:'management_import'},etag:crypto.randomUUID()};localStorage.setItem(key,JSON.stringify(value));return json(value);
  }return json(current||{dataset:null,etag:null});}catch{return json({error:'Importi ose ruajtja lokale dështoi.'},400);}
 }
 if(path==='/api/export/market'){
  const data=JSON.parse(new TextDecoder().decode(objects.get('data/market.json')));const filters=JSON.parse(String(options?.body||'{}'));return new Response(csv(filterMarket(data.records,filters),marketColumns),{headers:{'Content-Type':'text/csv;charset=utf-8'}});
 }
 const key=path.startsWith('/api/data/')?'data/'+path.slice(10)+'.json':path.slice(5);const data=objects.get(key);return data?new Response(data,{headers:{'Content-Type':entries[key].contentType}}):json({error:'Burimi mungon në paketë.'},404);
}
