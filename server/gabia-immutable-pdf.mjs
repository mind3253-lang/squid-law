// Immutable, private Gabia PDF storage. Never accept paths supplied by clients.
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,open,readFile,stat} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
const hex64=/^[0-9a-f]{64}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function gabiaDocumentLocation({root,customerKey,caseId,documentId}){
 if(typeof root!=='string'||!root.startsWith('/')||!hex64.test(customerKey||'')||!uuid.test(caseId||'')||!uuid.test(documentId||''))throw Error('INVALID_STORAGE_ID');
 const base=resolve(root);
 const file=join(base,customerKey,caseId,documentId+'.pdf');
 if(!file.startsWith(base+sep))throw Error('STORAGE_ESCAPE');
 return file;
}
export async function archiveGabiaPdf({root,customerKey,caseId,bytes}){
 if(!Buffer.isBuffer(bytes)||bytes.length<5||bytes.length>100*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('INVALID_PDF_UPLOAD');
 const documentId=randomUUID(),sha256=createHash('sha256').update(bytes).digest('hex');
 const path=gabiaDocumentLocation({root,customerKey,caseId,documentId});
 await mkdir(resolve(path,'..'),{recursive:true,mode:0o700});
 const handle=await open(path,'wx',0o600);
 try{await handle.writeFile(bytes);await handle.sync()}finally{await handle.close()}
 return {documentId,sha256,size:bytes.length,storageKey:customerKey+'/'+caseId+'/'+documentId+'.pdf'};
}
export async function readGabiaPdf({root,customerKey,caseId,documentId,expectedSha256}){
 if(!hex64.test(expectedSha256||''))throw Error('INVALID_EXPECTED_DIGEST');
 const path=gabiaDocumentLocation({root,customerKey,caseId,documentId});
 const info=await stat(path);
 if(!info.isFile()||info.size>100*1024*1024)throw Error('INVALID_ARCHIVE');
 const bytes=await readFile(path);
 if(createHash('sha256').update(bytes).digest('hex')!==expectedSha256)throw Error('PDF_INTEGRITY_MISMATCH');
 return bytes;
}
