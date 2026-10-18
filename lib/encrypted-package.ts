export type EncryptedPackage={format:'humanplus-encrypted-v1';kdf:'PBKDF2-SHA256';iterations:number;salt:string;iv:string;ciphertext:string};
const decode=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export async function decryptPackage(envelope:EncryptedPackage,username:string,password:string):Promise<Blob>{
 if(envelope.format!=='humanplus-encrypted-v1'||envelope.kdf!=='PBKDF2-SHA256'||envelope.iterations!==600000)throw new Error('Invalid encrypted package');
 const salt=decode(envelope.salt),iv=decode(envelope.iv);
 if(salt.length!==16||iv.length!==12||envelope.ciphertext.length>110_000_000)throw new Error('Invalid encrypted package');
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(username.trim().toLowerCase()+'\0'+password),'PBKDF2',false,['deriveKey']);
 const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:envelope.iterations},material,{name:'AES-GCM',length:256},false,['decrypt']);
 const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(envelope.format),tagLength:128},key,decode(envelope.ciphertext));
 return new Blob([plaintext],{type:'application/gzip'});
}
