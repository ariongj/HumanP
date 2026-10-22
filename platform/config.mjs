import {resolve,isAbsolute} from 'node:path';
export function config(){
  const production=process.env.NODE_ENV==='production';
  const origin=process.env.HP_ORIGIN||'http://127.0.0.1:62800';
  if(production&&!/^https:\/\/[^/]+$/.test(origin))throw new Error('Production requires an HTTPS HP_ORIGIN.');
  const dataDir=process.env.HP_DATA_DIR||resolve('.local-data');
  if(production&&(!process.env.HP_DATA_DIR||!isAbsolute(dataDir)))throw new Error('Production requires a persistent absolute HP_DATA_DIR outside the deployment.');
  return {production,origin,dataDir,dbPath:resolve(dataDir,'humanplus.sqlite'),port:Number(process.env.PORT||62800),host:process.env.HOST||'127.0.0.1'};
}
