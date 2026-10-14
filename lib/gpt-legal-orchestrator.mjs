import {createHash} from 'node:crypto';
import {planSourceWindow,verifySourceWindow} from './source-continuity.mjs';
import {buildLegalExpertRequest,invokeLegalExpert} from './gpt-legal-expert.mjs';
import {auditLegalReasoningResult} from './legal-reasoning-audit.mjs';
import {auditSourceReadReceipts,SOURCE_REVIEW_TASK} from './legal-source-read-audit.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
export async function analyzeLegalWindow({request,sourceUnits,cursor=0,task='claims_and_rebuttals',apiKey,model,fetchImpl,maxCharacters=48000}){
 if(request?.ready!==true||request?.verified!==false)throw Error('LEGAL_ANALYSIS_NOT_AUTHORIZED');
 const window=planSourceWindow({caseId:request.caseId,sourceVersion:request.sourceVersion,units:sourceUnits,cursor,maxCharacters});
 verifySourceWindow(window,{caseId:request.caseId,sourceVersion:request.sourceVersion,cursor,totalUnits:sourceUnits.length});
 const payload=buildLegalExpertRequest({caseId:request.caseId,sourceVersion:request.sourceVersion,task,units:window.units,model,clientRole:request.clientRole});
 const result=await invokeLegalExpert({request:payload,apiKey,fetchImpl});
 const index=window.units.map(u=>({documentId:u.documentId,page:u.page,part:u.part,hash:u.hash}));
 const audit=auditLegalReasoningResult({request,result,sourceIndex:index});
 if(!audit.complete)throw Error('GPT_LEGAL_SOURCE_AUDIT_FAILED:'+audit.failures.join(','));
 const reviewAudit=task===SOURCE_REVIEW_TASK?auditSourceReadReceipts({units:window.units,receipts:result.sourceReviewReceipts}):null;
 if(task===SOURCE_REVIEW_TASK&&!reviewAudit.complete)throw Error('GPT_LEGAL_SOURCE_REVIEW_FAILED:'+reviewAudit.failures.slice(0,12).join(','));
 return {caseId:request.caseId,sourceVersion:request.sourceVersion,task,cursor,nextCursor:window.manifest.nextCursor,complete:window.complete,manifestSha256:window.manifestSha256,findings:result.findings,uncertainties:result.uncertainties||[],sourceAudit:audit,reviewAudit,sourceReviewReceipts:task===SOURCE_REVIEW_TASK?result.sourceReviewReceipts:undefined,verified:false,requiresIndependentSemanticAudit:true,checkpointSha256:sha(JSON.stringify({sourceVersion:request.sourceVersion,task,cursor,nextCursor:window.manifest.nextCursor,manifestSha256:window.manifestSha256}))};
}
