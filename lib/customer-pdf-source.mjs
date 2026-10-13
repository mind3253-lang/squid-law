import {get} from '@vercel/blob';
import {createArchivedPdfRangeReader} from './skynet-pdf-range.mjs';

/**
 * Immutable, per-customer source fragments. The browser sends parts, not an
 * entire original PDF as a JSON/base64 request.
 */
export function customerPdfChunkPaths(prefix,uploadId,parts,chunkSize,size){
 if(!/^[-0-9a-f]{36}$/.test(String(uploadId||''))||
  !Number.isSafeInteger(parts)||parts<1||parts>99999||
  !Number.isSafeInteger(chunkSize)||chunkSize<65536||chunkSize>4*1048576||
  !Number.isSafeInteger(size)||size<100||Math.ceil(size/chunkSize)!==parts)
  throw Error('INVALID_CUSTOMER_PDF_SOURCE');
 return Array.from({length:parts},(_,i)=>({
  pathname:prefix+'chunks/'+uploadId+'/'+i+'.part',
  size:Math.min(chunkSize,size-i*chunkSize)
 }));
}
async function readExactPrivateBlob(path,expectedSize){
 const blob=await get(path,{access:'private'});
 if(!blob||blob.statusCode!==200)throw Error('CUSTOMER_PDF_CHUNK_MISSING');
 const chunks=[];let size=0;
 for await(const c of blob.stream){
  const value=Buffer.from(c);size+=value.length;
  if(size>expectedSize)throw Error('CUSTOMER_PDF_CHUNK_TOO_LARGE');
  chunks.push(value);
 }
 if(size!==expectedSize)throw Error('CUSTOMER_PDF_CHUNK_LENGTH_MISMATCH');
 return Buffer.concat(chunks,size);
}
export function createCustomerPdfRangeSource(prefix,{chunkUploadId,sourceParts,sourceChunkSize,size}){
 const files=customerPdfChunkPaths(prefix,chunkUploadId,sourceParts,sourceChunkSize,size);
 return createArchivedPdfRangeReader(files,readExactPrivateBlob,{cacheLimit:3});
}
export async function hashCustomerPdfArchive(prefix,source){
 const files=customerPdfChunkPaths(prefix,source.chunkUploadId,source.sourceParts,source.sourceChunkSize,source.size);
 const {createHash}=await import('node:crypto'),sha=createHash('sha256');
 for(const file of files){
  const blob=await get(file.pathname,{access:'private'});
  if(!blob||blob.statusCode!==200)throw Error('CUSTOMER_PDF_CHUNK_MISSING');
  let size=0;
  for await(const c of blob.stream){
   size+=c.length;
   if(size>file.size)throw Error('CUSTOMER_PDF_CHUNK_LENGTH_MISMATCH');
   sha.update(c);
  }
  if(size!==file.size)throw Error('CUSTOMER_PDF_CHUNK_LENGTH_MISMATCH');
 }
 return sha.digest('hex');
}
