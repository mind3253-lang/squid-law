/**
 * Byte-addressed private archive reader for PDF.js range transport.
 * Only selected persisted fragments are read. No Buffer.concat(original).
 * Cache is bounded, and returned ranges are independent copies.
 */
export function createArchivedPdfRangeReader(fragments,readChunk,{cacheLimit=3}={}){
 if(!Array.isArray(fragments)||!fragments.length||typeof readChunk!=='function'||
  !Number.isSafeInteger(cacheLimit)||cacheLimit<1||cacheLimit>12)
  throw Error('INVALID_PDF_RANGE_SOURCE');
 const slots=[],cache=new Map();let offset=0;
 for(const file of fragments){
  if(typeof file?.pathname!=='string'||!Number.isSafeInteger(file.size)||
   file.size<=0||!Number.isSafeInteger(offset+file.size))
   throw Error('INVALID_PDF_FRAGMENT');
  slots.push({pathname:file.pathname,start:offset,end:offset+file.size,size:file.size});
  offset+=file.size;
 }
 const totalBytes=offset;
 async function load(slot){
  const key=slot.pathname;
  if(cache.has(key)){
   const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;
  }
  const reading=Promise.resolve().then(()=>readChunk(key,slot.size)).then(data=>{
   if(!(data instanceof Uint8Array)||data.byteLength!==slot.size)
    throw Error('PDF_FRAGMENT_LENGTH_MISMATCH');
   return data;
  });
  cache.set(key,reading);
  while(cache.size>cacheLimit)cache.delete(cache.keys().next().value);
  try{return await reading}catch(e){if(cache.get(key)===reading)cache.delete(key);throw e}
 }
 async function readRange(begin,end){
  if(!Number.isSafeInteger(begin)||!Number.isSafeInteger(end)||
   begin<0||end<=begin||end>totalBytes)throw Error('INVALID_PDF_BYTE_RANGE');
  const result=new Uint8Array(end-begin);
  const selected=slots.filter(slot=>slot.end>begin&&slot.start<end);
  // Concurrent range fragments retain their deterministic byte positions.
  const buffers=await Promise.all(selected.map(slot=>load(slot)));
  let filled=0;
  for(let i=0;i<selected.length;i++){
   const slot=selected[i],buffer=buffers[i];
   const first=Math.max(begin,slot.start),last=Math.min(end,slot.end);
   result.set(buffer.subarray(first-slot.start,last-slot.start),first-begin);
   filled+=last-first;
  }
  if(filled!==result.byteLength)throw Error('PDF_BYTE_RANGE_INCOMPLETE');
  return result;
 }
 return {totalBytes,readRange,fragmentCount:slots.length};
}
