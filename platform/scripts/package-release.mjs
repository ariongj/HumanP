import {mkdir,copyFile,readdir,readFile,rm} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'release');
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
// An allowlist prevents local databases, credentials and dependencies entering releases.
for(const entry of await readdir(root,{withFileTypes:true})){
 if(entry.isFile()&&(/\.(mjs|json|md)$/.test(entry.name))){await copyFile(join(root,entry.name),join(output,entry.name));}
}
for(const folder of ['public','tests','scripts']){
 await mkdir(join(output,folder));
 for(const entry of await readdir(join(root,folder),{withFileTypes:true})){
  if(entry.isFile()&&/\.(mjs|js|css|html)$/.test(entry.name))await copyFile(join(root,folder,entry.name),join(output,folder,entry.name));
 }
}
const manifest=JSON.parse(await readFile(join(output,'package.json'),'utf8'));
if(!manifest.scripts.start||!manifest.dependencies.htmlparser2)throw new Error('Incomplete runtime package');
console.log('Workspace installation package prepared in platform/release. Preserve the server environment, database and archive when deploying.');
