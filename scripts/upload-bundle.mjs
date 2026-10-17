// Reads hosted credentials from hidden stdin only. No credentials are persisted.
import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';import {createHash} from 'node:crypto';import {createInterface} from 'node:readline';
const local=process.argv[2]==='--local';let settings;
if(local){settings={origin:'http://127.0.0.1:4186',objects:resolve(process.argv[3]||'../private/objects')};}
else{if(process.stdin.isTTY)process.stdin.setRawMode(true);process.stdout.write('Ready for private upload JSON on stdin (input is hidden).\n');let input='';for await(const chunk of process.stdin){input+=chunk.toString();if(input.includes('\n'))break;}if(process.stdin.isTTY)process.stdin.setRawMode(false);settings=JSON.parse(input.trim());}
const url=new URL(settings.origin);if(local? !['127.0.0.1','localhost'].includes(url.hostname):url.protocol!=='https:')throw new Error('Unsupported origin');
const manifest=JSON.parse(await readFile(new URL('../lib/import-manifest.json',import.meta.url),'utf8'));
const headers=local?{Cookie:'__sites_local_auth=1'}:{'OAI-Sites-Authorization':'Bearer '+settings.token};
if(!local&&!settings.token)throw new Error('Missing private Sites ingress authorization');
let completed=0,total=0;const queue=Object.entries(manifest);
async function worker(){while(queue.length){const [key,item]=queue.shift();const body=await readFile(resolve(settings.objects,key));if(body.length!==item.bytes||createHash('sha256').update(body).digest('hex')!==item.sha256)throw new Error('Staged content mismatch: '+key);let response;for(let attempt=0;attempt<3;attempt++){response=await fetch(new URL('/api/import/'+key,url),{method:'PUT',redirect:'error',headers:{...headers,'Content-Type':'application/octet-stream'},body});if(response.ok||response.status<500)break;await new Promise(r=>setTimeout(r,1000));}if(!response?.ok)throw new Error('Private import failed: '+response?.status+' '+key);const receipt=await response.json();if(receipt.sha256!==item.sha256||receipt.bytes!==item.bytes)throw new Error('Readback mismatch: '+key);completed++;total+=item.bytes;if(completed%20===0)console.log(JSON.stringify({completed,totalBytes:total}));}}
await Promise.all([worker(),worker(),worker()]);console.log(JSON.stringify({importComplete:true,objects:completed,bytes:total,origin:url.origin}));process.exit(0);
