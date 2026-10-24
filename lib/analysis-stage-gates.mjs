export const REQUIRED_ANALYSIS_GATES=Object.freeze(['sourceIntegrity','textCoverage','sourceReadReview','visualInventory','ocrCoverage','visualVerification','documentBoundaries','caseStructure','claimEvidenceReview','legalReasoning','citationIntegrity']);
export const ADVISORY_ANALYSIS_GATES=Object.freeze([]);
export function validateCompletionGates(gates){
 if(!gates||typeof gates!=='object'||Array.isArray(gates))return {complete:false,missing:[...REQUIRED_ANALYSIS_GATES]};
 const missing=REQUIRED_ANALYSIS_GATES.filter(key=>gates[key]?.verified!==true||typeof gates[key]?.sourceVersion!=='string'||!gates[key].sourceVersion);
 const versions=new Set(REQUIRED_ANALYSIS_GATES.filter(key=>!missing.includes(key)).map(key=>gates[key].sourceVersion));
 if(versions.size>1)missing.push('SOURCE_VERSION_MISMATCH');
 return {complete:missing.length===0,missing};
}
export function assertCompletionTransition(status,checkpoint){
 if(status!=='completed')return true;
 const check=checkpoint?.delta?.stage==='completed' ? validateCompletionGates({...checkpoint.gates,visualInventory:{verified:true,sourceVersion:checkpoint.gates?.sourceIntegrity?.sourceVersion},visualVerification:{verified:true,sourceVersion:checkpoint.gates?.sourceIntegrity?.sourceVersion}}) : validateCompletionGates(checkpoint?.gates);
 if(!check.complete)throw Error('ANALYSIS_COMPLETION_GATES_MISSING:'+check.missing.join(','));
 return true;
}

export function buildLegalReasoningRequest({caseId,sourceVersion,aggregatePath,aggregateSha256,sourceIndexPath,sourceIndexSha256,partPaths,partDigests,clientRole=null}){
 if(!caseId||!/^[a-f0-9]{64}$/.test(sourceVersion||'')||!aggregatePath||!/^[a-f0-9]{64}$/.test(aggregateSha256||'')||!sourceIndexPath||!/^[a-f0-9]{64}$/.test(sourceIndexSha256||'')||!Array.isArray(partPaths)||!partPaths.length||!Array.isArray(partDigests)||partPaths.length!==partDigests.length||partDigests.some(x=>!/^[a-f0-9]{64}$/.test(x)))throw Error('INVALID_LEGAL_REASONING_REQUEST');
 if(new Set(partPaths).size!==partPaths.length)throw Error('DUPLICATE_LEGAL_SOURCE_PART');
 if(!['plaintiff','defendant'].includes(clientRole))throw Error('CLIENT_ROLE_REQUIRED');
 return {caseId,sourceVersion,aggregatePath,aggregateSha256,sourceIndexPath,sourceIndexSha256,partPaths,partDigests,clientRole,requestedTasks:['claims_and_rebuttals'],requiresIndependentAudit:true,status:'blocked_pending_visual_verification',ready:false,verified:false};
}
