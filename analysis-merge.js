// Merge independently verified batches without promoting unsupported findings.
// A partial or missing batch always prevents an all-clear result.
export function mergeCheckedBatches(expectedBatches,results){
 if(!expectedBatches||expectedBatches.schema!=='squidlaw-analysis-batches-v1'||!Array.isArray(expectedBatches.batches))throw Error('INVALID_EXPECTED_BATCHES');
 if(!Array.isArray(results))throw Error('INVALID_BATCH_RESULTS');
 const expected=new Set(expectedBatches.batches.map(b=>b.batch));
 if(expected.size!==expectedBatches.batches.length)throw Error('DUPLICATE_EXPECTED_BATCH');
 const received=new Map();
 for(const result of results){
  if(!result||result.schema!=='squidlaw-checked-batch-v1'||!Number.isInteger(result.batch)||!expected.has(result.batch))throw Error('UNEXPECTED_BATCH_RESULT');
  if(received.has(result.batch))throw Error('DUPLICATE_BATCH_RESULT');
  if(!Array.isArray(result.findings)||!result.quality||typeof result.sourceReady!=='boolean')throw Error('INVALID_BATCH_RESULT');
  received.set(result.batch,result);
 }
 const missingBatches=expectedBatches.batches.map(b=>b.batch).filter(id=>!received.has(id));
 const findings=expectedBatches.batches.flatMap(b=>(received.get(b.batch)?.findings||[]).map(f=>({...f,sourceBatch:b.batch})));
 const needsReview=findings.filter(f=>!f||!Array.isArray(f.citations)||f.citations.length===0||!Array.isArray(f.citationChecks)||f.citationChecks.length!==f.citations.length||f.citationChecks.some(c=>c?.verification?.status!=='matched')).length;
 const allBatchesReady=missingBatches.length===0&&expectedBatches.batches.length>0&&expectedBatches.batches.every(b=>{
  const result=received.get(b.batch);
  return result?.sourceReady===true&&result.findings.length>0&&result.findings.every(f=>f&&Array.isArray(f.citations)&&f.citations.length>0&&Array.isArray(f.citationChecks)&&f.citationChecks.length===f.citations.length&&f.citationChecks.every(c=>c.verification?.status==='matched'));
 });
 return {
  schema:'squidlaw-merged-analysis-v1',
  findings,
  diagnostics:{expectedBatches:expected.size,receivedBatches:received.size,missingBatches,findings:findings.length,needsReview},
  sourceReady:allBatchesReady&&findings.length>0&&needsReview===0
 };
}
