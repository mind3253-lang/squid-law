export function assertPageBatch({pages,pageOffset,pageCount,batchSize=20}){
 if(!Number.isSafeInteger(pageOffset)||pageOffset<0||!Number.isSafeInteger(pageCount)||pageCount<1||!Number.isSafeInteger(batchSize)||batchSize<1||pageOffset>=pageCount||pageOffset%batchSize!==0)throw Error('INVALID_CHECKPOINT_OFFSET');
 const expected=Math.min(batchSize,pageCount-pageOffset);
 if(!Array.isArray(pages)||pages.length!==expected||pages.some((p,i)=>p?.page!==pageOffset+i+1))throw Error('INVALID_PAGE_SEQUENCE');
 return {startPage:pageOffset+1,endPage:pageOffset+expected,finished:pageOffset+expected===pageCount,nextOffset:pageOffset+expected};
}
export function assertBatchManifest({batches,pageCount,batchSize=20}){
 if(!Array.isArray(batches)||!Number.isSafeInteger(pageCount)||pageCount<1||batches.length!==Math.ceil(pageCount/batchSize)||batches.some(p=>typeof p!=='string'||!p.endsWith('.json'))||new Set(batches).size!==batches.length)throw Error('INVALID_BATCH_MANIFEST');
 return true;
}
