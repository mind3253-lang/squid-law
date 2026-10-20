// Read-only manifest reconciliation. Does not move, overwrite or delete source objects.
export function reconcilePdfManifests(source,destination){
 const key=x=>[x.customerKey,x.caseId,x.documentId].join(':');
 const valid=x=>x&&/^[0-9a-f]{64}$/.test(x.customerKey||'')&&/^[0-9a-f]{64}$/.test(x.sha256||'')&&Number.isSafeInteger(x.bytes)&&x.bytes>=5&&Number.isSafeInteger(x.pageCount)&&x.pageCount>0;
 if(!Array.isArray(source)||!Array.isArray(destination)||source.some(x=>!valid(x))||destination.some(x=>!valid(x)))throw Error('INVALID_PDF_MANIFEST');
 const build=items=>{const map=new Map();for(const item of items){const id=key(item);if(map.has(id))throw Error('DUPLICATE_PDF_MANIFEST_ENTRY');map.set(id,item)}return map};
 const a=build(source),b=build(destination),missing=[],mismatch=[],extra=[];
 for(const [id,x] of a){const y=b.get(id);if(!y)missing.push(id);else if(x.sha256!==y.sha256||x.bytes!==y.bytes||x.pageCount!==y.pageCount)mismatch.push(id)}
 for(const id of b.keys())if(!a.has(id))extra.push(id);
 return {ok:missing.length===0&&mismatch.length===0&&extra.length===0,sourceCount:a.size,destinationCount:b.size,missing,mismatch,extra};
}
