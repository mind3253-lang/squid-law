import {createHash} from 'node:crypto';
import {planSourceWindow,verifySourceWindow} from './source-continuity.mjs';
import {buildLegalExpertRequest,invokeLegalExpert} from './gpt-legal-expert.mjs';
import {auditLegalReasoningResult} from './legal-reasoning-audit.mjs';
import {auditSourceReadReceipts,SOURCE_REVIEW_TASK} from './legal-source-read-audit.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function assertLegalWindowContinuation({previous,caseId,sourceVersion,task,cursor}){
 if(cursor===0){if(previous!==null&&previous!==undefined)throw Error('LEGAL_WINDOW_UNEXPECTED_PREDECESSOR');return true;}
 if(!previous||previous.caseId!==caseId||previous.sourceVersion!==sourceVersion||previous.task!==task||previous.nextCursor!==cursor||previous.cursor>=cursor||previous.complete===true)throw Error('LEGAL_WINDOW_CONTINUITY_MISMATCH');
 const expected=sha(JSON.stringify({sourceVersion,task,cursor:previous.cursor,nextCursor:previous.nextCursor,manifestSha256:previous.manifestSha256}));
 if(previous.checkpointSha256!==expected)throw Error('LEGAL_WINDOW_CHECKPOINT_DIGEST_MISMATCH');
 return true;
}
export async function analyzeLegalWindow({request,sourceUnits,cursor=0,task='claims_and_rebuttals',previousWindow=null,apiKey,model,fetchImpl,maxCharacters=12000}){
 if(request?.ready!==true||request?.verified!==false)throw Error('LEGAL_ANALYSIS_NOT_AUTHORIZED');
 assertLegalWindowContinuation({previous:previousWindow,caseId:request.caseId,sourceVersion:request.sourceVersion,task,cursor});
 const window=planSourceWindow({caseId:request.caseId,sourceVersion:request.sourceVersion,units:sourceUnits,cursor,maxCharacters});
 verifySourceWindow(window,{caseId:request.caseId,sourceVersion:request.sourceVersion,cursor,totalUnits:sourceUnits.length});
 const payload=buildLegalExpertRequest({caseId:request.caseId,sourceVersion:request.sourceVersion,task,units:window.units,model,clientRole:request.clientRole,caseContext:previousWindow?.caseContext||null});
 const result=await invokeLegalExpert({request:payload,apiKey,fetchImpl});
 const index=window.units.map(u=>({documentId:u.documentId,page:u.page,part:u.part,hash:u.hash}));
 const audit=auditLegalReasoningResult({request,result,sourceIndex:index});
 if(!audit.complete)throw Error('GPT_LEGAL_SOURCE_AUDIT_FAILED:'+audit.failures.join(','));
 const caseContext={issues:[...(previousWindow?.caseContext?.issues||[]),...(result.findings||[]).map(f=>({issueKey:f.issueKey||'',claim:String(f.claim||'').slice(0,260),sources:(f.sources||[]).slice(0,3)}))].slice(-90),uncertainties:[...(previousWindow?.caseContext?.uncertainties||[]),...(result.uncertainties||[])].slice(-35)};
 const reviewAudit=task===SOURCE_REVIEW_TASK?auditSourceReadReceipts({units:window.units,receipts:result.sourceReviewReceipts}):null;
 if(task===SOURCE_REVIEW_TASK&&!reviewAudit.complete){console.error('SOURCE_REVIEW_AUDIT_CODES',JSON.stringify({failures:reviewAudit.failures.slice(0,12).map(x=>x.split(':')[0]),reviewed:reviewAudit.reviewedUnits,total:reviewAudit.totalUnits}));throw Error('GPT_LEGAL_SOURCE_REVIEW_FAILED:'+reviewAudit.failures.slice(0,12).join(','));}
 return {caseId:request.caseId,sourceVersion:request.sourceVersion,task,cursor,caseContext,nextCursor:window.manifest.nextCursor,complete:window.complete,manifestSha256:window.manifestSha256,findings:result.findings,uncertainties:result.uncertainties||[],modelUsage:result.modelUsage||null,providerResponseId:result.providerResponseId||null,sourceAudit:audit,reviewAudit,sourceReviewReceipts:task===SOURCE_REVIEW_TASK?result.sourceReviewReceipts:undefined,verified:false,requiresIndependentSemanticAudit:true,checkpointSha256:sha(JSON.stringify({sourceVersion:request.sourceVersion,task,cursor,nextCursor:window.manifest.nextCursor,manifestSha256:window.manifestSha256}))};
}
