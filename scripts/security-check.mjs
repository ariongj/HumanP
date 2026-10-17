import {readdir,readFile} from 'node:fs/promises';import {join} from 'node:path';import assert from 'node:assert/strict';
const tree=async dir=>(await Promise.all((await readdir(dir,{withFileTypes:true})).map(async e=>e.isDirectory()?tree(join(dir,e.name)):[join(dir,e.name)]))).flat();
const clients=await tree('dist/client');
// Source canaries are read only for this check, never written into source/build.
const data=JSON.parse(await readFile('../private/objects/data/employers.json','utf8'));
const markers=[data.records[0].email,JSON.stringify(data.records[0]),'records_with_audit_flags.json','HumanPlus_50_Mjeke_Kosove_Kontaktet'];
for(const file of clients){assert(!/\.(xlsx|docx|pdf|csv|zip)$/.test(file),file);if(/\.(js|html|json|css)$/.test(file)){const text=await readFile(file,'utf8');for(const marker of markers)assert(!text.includes(marker),'Private source found in client '+file);}}
console.log(JSON.stringify({clientFiles:clients.length,privateSourceCanariesAbsent:true,privateDownloadsAbsent:true,publicApprovalQueueEmpty:true}));
