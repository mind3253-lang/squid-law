// Immutable private PDF archive for a future authenticated Gabia API.
// No public HTTP route is exposed by this module.
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,open,readFile,writeFile,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const hex64=/^[a-f0-9]{64}$/;
const validOwner=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export async function archiveCustomerPdf({root,customerKey,bytes,expectedSha256}){
 if(!validOwner(customerKey)||!hex64.test(expectedSha256||''))throw Error('INVALID_ARCHIVE_IDENTITY');
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<5||bytes.byteLength>100*1024*1024)throw Error('INVALID_ARCHIVE_PDF_SIZE');
 const source=Buffer.from(bytes);
 if(source.subarray(0,5).toString()!=='%PDF-')throw Error('INVALID_ARCHIVE_PDF_HEADER');
 const digest=createHash('sha256').update(source).digest('hex');
 if(digest!==expectedSha256)throw Error('ARCHIVE_DIGEST_MISMATCH');
 const directory=join(resolve(root),customerKey);
 await mkdir(directory,{recursive:true,mode:0o700});
 const fileId=randomUUID();
 const path=join(directory,fileId+'.pdf');
 const handle=await open(path,'wx',0o600);
 try{await handle.writeFile(source);await handle.sync();}finally{await handle.close();}
 const metadata={fileId,sha256:digest,size:source.length,customerKey};
 try{await writeFile(join(directory,fileId+'.json'),JSON.stringify(metadata),{flag:'wx',mode:0o600});}
 catch(error){await unlink(path).catch(()=>{});throw Error('ARCHIVE_METADATA_WRITE_FAILED',{cause:error});}
 return metadata;
}
export async function readCustomerPdf({root,customerKey,fileId,expectedSha256}){
 if(!validOwner(customerKey)||!hex64.test(expectedSha256||'')||
  typeof fileId!=='string'||!/^[a-f0-9-]{36}$/.test(fileId))throw Error('INVALID_ARCHIVE_IDENTITY');
 const directory=join(resolve(root),customerKey);
 const metadata=JSON.parse(await readFile(join(directory,fileId+'.json'),'utf8'));
 if(metadata.customerKey!==customerKey||metadata.fileId!==fileId||metadata.sha256!==expectedSha256)throw Error('ARCHIVE_OWNERSHIP_MISMATCH');
 const bytes=await readFile(join(directory,fileId+'.pdf'));
 if(bytes.length!==metadata.size||createHash('sha256').update(bytes).digest('hex')!==expectedSha256)throw Error('ARCHIVE_INTEGRITY_FAILURE');
 return bytes;
}
