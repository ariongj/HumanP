import {readFileSync} from 'node:fs';
import {openStore} from './store.mjs';
import {config} from './config.mjs';
import {initializeCollection,loadBootstrap,runCollection} from './collection-job.mjs';
process.umask(0o077);
const db=openStore(config().dbPath);
try{
  initializeCollection(db,loadBootstrap());
  const profile=JSON.parse(readFileSync(new URL('./profile.json',import.meta.url),'utf8'));
  const result=await runCollection(db,{profile});
  if(result.status!=='skipped')console.log(JSON.stringify({checked_at:new Date().toISOString(),...result}));
  if(['error','partial','lease_lost'].includes(result.status))process.exitCode=1;
}finally{db.close();}
