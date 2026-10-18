import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync,createCipheriv,randomBytes} from 'node:crypto';
import {decryptPackage,type EncryptedPackage} from '../lib/encrypted-package';
function fixture(){
 const salt=randomBytes(16),iv=randomBytes(12),username='synthetic-owner',password='Synthetic fixture password only!';
 const key=pbkdf2Sync(username+'\0'+password,salt,600000,32,'sha256');
 const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('humanplus-encrypted-v1'));
 const ciphertext=Buffer.concat([cipher.update('Synthetic source bytes'),cipher.final(),cipher.getAuthTag()]);
 const envelope:EncryptedPackage={format:'humanplus-encrypted-v1',kdf:'PBKDF2-SHA256',iterations:600000,salt:salt.toString('base64'),iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64')};
 return {envelope,username,password};
}
test('Web Crypto decrypts a Node-produced authenticated package only with correct credentials',async()=>{
 const {envelope,username,password}=fixture();
 assert.equal(await (await decryptPackage(envelope,'  '+username.toUpperCase()+' ',password)).text(),'Synthetic source bytes');
 await assert.rejects(()=>decryptPackage(envelope,username,password+'wrong'));
 await assert.rejects(()=>decryptPackage(envelope,'another-user',password));
 const changed=Buffer.from(envelope.ciphertext,'base64');changed[0]^=1;
 await assert.rejects(()=>decryptPackage({...envelope,ciphertext:changed.toString('base64')},username,password));
 await assert.rejects(()=>decryptPackage({...envelope,iterations:1},username,password));
});
