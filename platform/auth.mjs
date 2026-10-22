import {scrypt as scryptCallback, randomBytes, createHash, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
const options={N:32768,r:8,p:3,maxmem:64*1024*1024};
export const token=()=>randomBytes(32).toString('base64url');
export const hash=value=>createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
  if(typeof password!=='string'||password.length<14||password.length>256) throw Object.assign(new Error('Use a password between 14 and 256 characters.'),{status:400});
  const salt=randomBytes(16).toString('hex');
  const key=await scrypt(password,salt,64,options);
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [kind,salt,key]=String(stored).split(':');
  if(kind!=='scrypt'||!salt||!key||typeof password!=='string'||password.length>256) return false;
  const result=await scrypt(password,salt,64,options);
  const expected=Buffer.from(key,'hex');
  return result.length===expected.length&&timingSafeEqual(result,expected);
}
export function rateLimit(db,key,limit,windowMs,now=Date.now()) {
  const safeKey=hash(key);
  db.prepare('DELETE FROM rate_limits WHERE expires < ?').run(now);
  db.prepare(`INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1`).run(safeKey,now+windowMs);
  if(db.prepare('SELECT attempts FROM rate_limits WHERE key=?').get(safeKey).attempts>limit) throw Object.assign(new Error('Too many attempts. Try again later.'),{status:429});
}
