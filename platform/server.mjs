import {createServer} from 'node:http';
import {openStore,id,createCompany} from './store.mjs';
import {hashPassword} from './auth.mjs';
import {createHandler} from './api.mjs';
import {readSource} from './source.mjs';
import {config} from './config.mjs';
const settings=config();
process.umask(0o077);
const db=openStore(settings.dbPath);
if(db.prepare('SELECT count(*) AS count FROM users').get().count===0){
  const email=process.env.HP_BOOTSTRAP_EMAIL;
  const password=process.env.HP_BOOTSTRAP_PASSWORD;
  if(!email||!password)throw new Error('Initialize the first owner using private bootstrap environment variables.');
  const userId=id();
  const passwordHash=await hashPassword(password);
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(userId,email.toLowerCase(),'Arion',passwordHash,new Date().toISOString());
  createCompany(db,{name:'HumanPlus',sector:'healthcare',userId});
}
const server=createServer({requestTimeout:30000,headersTimeout:10000,maxHeaderSize:16384},createHandler({db,origin:settings.origin,secure:settings.production,feedProvider:()=>readSource(db)}));
server.listen(settings.port,settings.host,()=>console.log('HumanPlus workspace listening'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
