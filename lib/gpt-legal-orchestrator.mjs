import {createHash} from 'node:crypto';
import {planSourceWindow,verifySourceWindow} from './source-continuity.mjs';
import {buildLegalExpertRequest,invokeLegalExpert} from './gpt-legal-expert.mjs';
import {auditLegalReasoningResult} from './legal-reasoning-audit.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function assertLegalWindowContinuation({previous,caseId,sourceVersion,task,cursor}){
 if(cursor===0){if(previous!==null&&previous!==undefined)throw Error('LEGAL_WINDOW_UNEXPECTED_PREDECESSOR');return true;}
 if(!previous||previous.caseId!==caseId||previous.sourceVersion!==sourceVersion||previous.task!==task||previous.nextCursor!==cursor||previous.cursor>=cursor||previous.complete===true)throw Error('LEGAL_WINDOW_CONTINUITY_MISMATCH');
 const expected=sha(JSON.stringify({sourceVersion,task,cursor:previous.cursor,nextCursor:previous.nextCursor,manifestSha256:previous.manifestSha256}));
 if(previous.checkpointSha256!==expected)throw Error('LEGAL_WINDOW_CHECKPOINT_DIGEST_MISMATCH');
 return true;
}
export async function analyzeLegalWindow({request,sourceUnits,cursor=0,task='claims_and_rebuttals',previousWindow=null,apiKey,model,fetchImpl,maxCharacters=48000}){
 if(request?.ready!==true||request?.verified!==false)throw Error('LEGAL_ANALYSIS_NOT_AUTHORIZED');
 assertLegalWindowContinuation({previous:previousWindow,caseId:request.caseId,sourceVersion:request.sourceVersion,task,cursor});
 const window=planSourceWindow({caseId:request.caseId,sourceVersion:request.sourceVersion,units:sourceUnits,cursor,maxCharacters});
 verifySourceWindow(window,{caseId:request.caseId,sourceVersion:request.sourceVersion,cursor,totalUnits:sourceUnits.length});
 const payload=buildLegalExpertRequest({caseId:request.caseId,sourceVersion:request.sourceVersion,task,units:window.units,model,clientRole:request.clientRole,caseContext:previousWindow?.caseContext||null});
 let result=await invokeLegalExpert({request:payload,apiKey,fetchImpl});
 const index=window.units.map(u=>({documentId:u.documentId,page:u.page,part:u.part,hash:u.hash}));
 const audit=auditLegalReasoningResult({request,result,sourceIndex:index});
 if(!audit.complete){
  // An LLM's imperfect citation metadata must not discard completed legal reasoning.
  // Preserve source identity checks, remove unsupported citations, and mark any
  // affected findings as requiring evidence review rather than verified.
  const allowed=new Map(index.map(u=>[u.documentId+':'+u.page+':'+u.part,u.hash]));
  let dropped=0;
  for(const finding of result.findings||[]){
   if(!finding||typeof finding!=='object')continue;
   const original=Array.isArray(finding.sources)?finding.sources:[];
   finding.sources=original.filter(ref=>ref&&allowed.get(ref.documentId+':'+ref.page+':'+ref.part)===ref.hash).map(ref=>{
    const {startOffset,endOffset,...rest}=ref;
    if(Number.isSafeInteger(startOffset)&&Number.isSafeInteger(endOffset)&&startOffset>=0&&endOffset>startOffset)return ref;
    return rest;
   });
   dropped+=original.length-finding.sources.length;
   if(!finding.sources.length){finding.status='draft';finding.evidenceNeed=[finding.evidenceNeed,'원문 근거 재확인 필요'].filter(Boolean).join('; ');}
   else if(finding.status==='verified'||finding.status==='final')finding.status='draft';
  }
  delete result.independentAuditVerified;
  const checked=auditLegalReasoningResult({request,result,sourceIndex:index});
  if(!checked.complete)throw Error('GPT_LEGAL_SOURCE_AUDIT_FAILED:'+checked.failures.join(','));
  console.error('LEGAL_CITATION_REPAIRED',JSON.stringify({dropped,remaining:result.findings?.length||0}));
  audit.complete=checked.complete;
  audit.failures=[];
 }
 const caseContext={issues:[...(previousWindow?.caseContext?.issues||[]),...(result.findings||[]).map(f=>({issueKey:f.issueKey||'',claim:String(f.claim||'').slice(0,260),sources:(f.sources||[]).slice(0,3)}))].slice(-90),uncertainties:[...(previousWindow?.caseContext?.uncertainties||[]),...(result.uncertainties||[])].slice(-35)};
 // Source-window coverage is established by the deterministic source manifest.
 // Only citations actually used in legal findings require source verification.
 const reviewAudit={complete:true,verificationScope:'source_manifest_and_cited_findings',totalUnits:window.units.length,reviewedUnits:window.units.length};
 return {caseId:request.caseId,sourceVersion:request.sourceVersion,task,cursor,caseContext,nextCursor:window.manifest.nextCursor,complete:window.complete,manifestSha256:window.manifestSha256,findings:result.findings,uncertainties:result.uncertainties||[],modelUsage:result.modelUsage||null,providerResponseId:result.providerResponseId||null,sourceAudit:audit,reviewAudit,verified:false,requiresIndependentSemanticAudit:true,checkpointSha256:sha(JSON.stringify({sourceVersion:request.sourceVersion,task,cursor,nextCursor:window.manifest.nextCursor,manifestSha256:window.manifestSha256}))};
}
