export function expectedTextReviewOutputs({root,documents,batchSize=20}){
 if(typeof root!=='string'||!root||!Array.isArray(documents)||!Number.isSafeInteger(batchSize)||batchSize<1)throw Error('INVALID_TEXT_REVIEW_MANIFEST');
 const paths=[];
 for(const d of documents){
  if(!d?.id||!Number.isSafeInteger(d.pageCount)||d.pageCount<1)throw Error('INVALID_DOCUMENT_PAGES');
  for(let offset=0;offset<d.pageCount;offset+=batchSize)paths.push(root+d.id+'-'+String(offset).padStart(8,'0')+'.json');
 }
 if(new Set(paths).size!==paths.length)throw Error('DUPLICATE_TEXT_REVIEW_OUTPUT');
 return paths;
}
export function auditTextReviewOutputs({expected,actual}){
 if(!Array.isArray(expected)||!Array.isArray(actual))throw Error('INVALID_OUTPUT_LIST');
 const found=new Set(actual),required=new Set(expected);
 return {complete:found.size===actual.length&&required.size===expected.length&&found.size===required.size&&expected.every(p=>found.has(p)),missing:expected.filter(p=>!found.has(p)),unexpected:actual.filter(p=>!required.has(p)),duplicateCount:actual.length-found.size};
}
