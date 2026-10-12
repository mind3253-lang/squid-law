import {createHash} from 'node:crypto';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Verify persisted finalization checkpoint without touching source blobs. */
export function auditFinalizationCheckpoint({checkpoint,descriptorCount,partSize=8}) {
  if (!Number.isSafeInteger(descriptorCount)||descriptorCount<0||!Number.isSafeInteger(partSize)||partSize<1) throw Error('INVALID_FINALIZATION_PLAN');
  const offset=checkpoint?.finalizeOffset;
  if (!Number.isSafeInteger(offset)||offset<0||offset>descriptorCount||(offset%partSize!==0&&offset!==descriptorCount)) throw Error('INVALID_FINALIZATION_CHECKPOINT');
  const expected=Math.ceil(offset/partSize);
  const digests=checkpoint.finalizePartDigests;
  if (!Array.isArray(digests)||digests.length!==expected||digests.some(d=>typeof d!=='string'||!/^[a-f0-9]{64}$/.test(d))) throw Error('INVALID_FINALIZATION_DIGEST_CHECKPOINT');
  if (!Number.isSafeInteger(checkpoint.finalizeUnitCount)||checkpoint.finalizeUnitCount<0) throw Error('INVALID_FINALIZATION_UNIT_COUNT');
  return {offset,expectedParts:expected,remainingDescriptors:descriptorCount-offset,complete:offset===descriptorCount};
}
export function auditFinalizationParts({parts,checkpoint,descriptorCount,partSize=8,sourceVersion}) {
  const state=auditFinalizationCheckpoint({checkpoint,descriptorCount,partSize});
  if (!state.complete) throw Error('FINALIZATION_INCOMPLETE');
  if (!Array.isArray(parts)||parts.length!==state.expectedParts) throw Error('FINALIZATION_PART_MISSING');
  let units=0;
  for(let i=0;i<parts.length;i++){
    const p=parts[i],offset=i*partSize;
    if(!p||p.offset!==offset||p.sourceVersion!==sourceVersion||p.batchCount!==Math.min(partSize,descriptorCount-offset))throw Error('FINALIZATION_PART_SOURCE_MISMATCH');
    if(digest(p)!==checkpoint.finalizePartDigests[i])throw Error('FINALIZATION_PART_DIGEST_MISMATCH');
    if(!Number.isSafeInteger(p.unitCount)||p.unitCount<0||!Array.isArray(p.sources)||p.sources.length!==p.unitCount)throw Error('FINALIZATION_PART_COUNT_MISMATCH');
    units+=p.unitCount;
  }
  if(units!==checkpoint.finalizeUnitCount)throw Error('FINALIZATION_COUNT_MISMATCH');
  return {complete:true,parts:parts.length,units};
}
