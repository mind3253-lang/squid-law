import {createHash} from 'node:crypto';
const sha = bytes=>createHash('sha256').update(bytes).digest('hex');
/** Read-only metadata checks prior to enqueueing document processing. */
export function auditSourceDocuments(documents,{maxDocuments=200,maxPages=10000,maxBytes=105*1024*1024}={}){
 if(!Array.isArray(documents)||documents.length===0||documents.length>maxDocuments)throw Error('INVALID_DOCUMENT_COUNT');
 const ids=new Set(),hashes=new Map();let totalPages=0,totalBytes=0;
 for(const doc of documents){
  if(!doc||typeof doc.id!=='string'||!doc.id||ids.has(doc.id))throw Error('INVALID_OR_DUPLICATE_DOCUMENT_ID');
  ids.add(doc.id);
  if(!Number.isSafeInteger(doc.pageCount)||doc.pageCount<1)throw Error('INVALID_DOCUMENT_PAGE_COUNT');
  if(!Number.isSafeInteger(doc.sizeBytes)||doc.sizeBytes<1||doc.sizeBytes>maxBytes)throw Error('INVALID_DOCUMENT_SIZE');
  if(!/^[a-f0-9]{64}$/.test(doc.sha256||''))throw Error('INVALID_DOCUMENT_HASH');
  totalPages+=doc.pageCount;totalBytes+=doc.sizeBytes;
  if(totalPages>maxPages)throw Error('DOCUMENT_PAGE_LIMIT');
  const prior=hashes.get(doc.sha256);
  if(prior&&prior!==doc.id)throw Error('DUPLICATE_DOCUMENT_CONTENT');
  hashes.set(doc.sha256,doc.id);
 }
 return {documentCount:ids.size,totalPages,totalBytes,sourceVersion:sha(JSON.stringify(documents.map(d=>[d.id,d.sha256,d.pageCount]).sort((a,b)=>a[0].localeCompare(b[0]))))};
}
export {auditPageCoverage} from './shared-source-integrity.mjs';
