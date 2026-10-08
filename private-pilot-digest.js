// SHA-256 fingerprint of extracted page text. No document text leaves the device.
export async function digestPilotDocuments(documents){
 if(!Array.isArray(documents)||!documents.length||documents.some(d=>!d||typeof d.name!=='string'||!Array.isArray(d.pages)||d.pages.some(p=>!p||typeof p.text!=='string')))throw Error('INVALID_DIGEST_INPUT');
 if(typeof globalThis.crypto?.subtle?.digest!=='function')throw Error('SECURE_HASH_UNAVAILABLE');
 const canonical=JSON.stringify(documents.map(d=>({name:d.name,pages:d.pages.map(p=>p.text)})));
 const bytes=new TextEncoder().encode(canonical);
 const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
