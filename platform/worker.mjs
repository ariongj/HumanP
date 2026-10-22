import {openStore} from './store.mjs';
import {config} from './config.mjs';
import {readSource} from './source.mjs';
import {buildDailyReports,runDeliveryTick} from './reports.mjs';
import {backup} from 'node:sqlite';
import {mkdir,readdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';
process.umask(0o077);
const settings=config();
const db=openStore(settings.dbPath);
const now=new Date();
try {
  const source=readSource(db);
  const reports=buildDailyReports(db,{now,...source});
  const deliveries=runDeliveryTick(db,{now});
  const backupDir=join(settings.dataDir,'backups');await mkdir(backupDir,{recursive:true,mode:0o700});
  const filename=`humanplus-${now.toISOString().slice(0,10)}.sqlite`;
  const files=await readdir(backupDir);
  if(!files.includes(filename))await backup(db,join(backupDir,filename));
  const old=files.filter(f=>/^humanplus-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort().slice(0,-13);
  for(const file of old)await unlink(join(backupDir,file));
  console.log(JSON.stringify({checked_at:now.toISOString(),reports:reports.length,deliveries:deliveries.length,channel:'private_panel'}));
}finally{db.close();}
