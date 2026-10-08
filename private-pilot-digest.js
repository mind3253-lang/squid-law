// SHA-256 fingerprint of extracted page text. No document text leaves the device.
export async function digestPilotDocuments(documents){
 if(!Array.isArray(documents))throw Error('INVALID_DIGEST_INPUT');
 const canonical=JSON.stringify(documents.map(d=>({name:d.name,pages:d.pages.map(p=>p.text)})));
 const bytes=new TextEncoder().encode(canonical);
 const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
