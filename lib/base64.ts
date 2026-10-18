// Avoid the temporary character arrays created by Uint8Array.from(string) for
// large encrypted archives. atob validates the input; the loop copies bytes.
export function decodeBase64(value:string){
 const binary=atob(value),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return bytes;
}
