import {segmentRecord} from '../lib/record-chunks.mjs';
import {auditLegalReasoningResult} from '../lib/legal-reasoning-audit.mjs';
import {buildSemanticReviewRequest,invokeSemanticReview,validateSemanticReview} from '../lib/independent-semantic-review.mjs';
import {buildDeltaImpactRequest,validateDeltaImpact,buildDeltaRevisionRequest,
 validateDeltaRevision,buildMergedDeltaReport,inheritDeltaGates,invokeDeltaModel} from '../lib/customer-delta-reanalysis.mjs';
import {createHash} from 'node:crypto';
import {diagnoseDeltaSources,attachDiagnosticContext,traceEvidenceLineage,planDiagnosticRecovery} from '../lib/diagnostic-context.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const json=(o)=>JSON.stringify(o);
const uniqueRefs=findings=>{
 const result=new Map();
 for(const f of findings)for(const r of (f.sources||[])){
  if(!r?.documentId||!Number.isSafeInteger(r.page)||r.page<1||
   !Number.isSafeInteger(r.part)||r.part<1||!r.hash)throw Error('DELTA_FINDING_SOURCE_INVALID');
  result.set(r.documentId+':'+r.page+':'+r.part,r);
 }
 return [...result.values()];
};
async function originalSourceUnits({findings,documents,prefix,load}){
 const byId=new Map(documents.map(d=>[d.id,d])),refs=uniqueRefs(findings);
 if(!refs.length){
  // Legacy completed reports may contain findings without source pointers.
  // Reconstruct context only from actually verified newly uploaded pages.
  const addedIds=new Set((findings.addedDocumentIds||[]));
  const units=[];
  for(const d of documents.filter(d=>addedIds.has(d.id))){
   for(let offset=0;offset<d.pageCount&&units.length<40;offset+=20){
    const path=prefix+'verified/'+d.id+'/batch-'+String(offset).padStart(8,'0')+'.json';
    const data=await load(path);
    if(!data||data.documentId!==d.id||data.sourcePdfSha256!==d.sha256||!Array.isArray(data.pages))
     throw Error('DELTA_NEW_EVIDENCE_RECEIPT_MISSING');
    for(const u of segmentRecord({scope:'customer',documentId:d.id,pages:data.pages}).segments){
     if(units.length>=40)break;
     if(sha(u.text)!==u.hash)throw Error('DELTA_NEW_EVIDENCE_HASH_MISMATCH');
     units.push({documentId:d.id,page:u.page,part:u.part,hash:u.hash,text:u.text});
    }
   }
  }
  if(units.length)return units;
  throw attachDiagnosticContext(new Error('DELTA_SOURCE_REFERENCES_MISSING'),diagnoseDeltaSources({oldFinding:findings[0],newFindings:findings.slice(1),sourceUnits:[]}));
 }
 const batches=new Map();
 for(const r of refs){
  const d=byId.get(r.documentId);
  if(!d||r.page>d.pageCount)throw Error('DELTA_UNKNOWN_EVIDENCE_DOCUMENT');
  const offset=Math.floor((r.page-1)/20)*20,key=d.id+':'+offset;
  if(!batches.has(key)){
   const path=prefix+'verified/'+d.id+'/batch-'+String(offset).padStart(8,'0')+'.json';
   const data=await load(path);
   if(!data||data.documentId!==d.id||data.sourcePdfSha256!==d.sha256||
    !Array.isArray(data.pages))throw Error('DELTA_PRIMARY_EVIDENCE_NOT_VERIFIED');
   batches.set(key,data);
  }
 }
 const units=[];
 for(const r of refs){
  const d=byId.get(r.documentId),offset=Math.floor((r.page-1)/20)*20;
  const pages=batches.get(d.id+':'+offset).pages;
  const page=pages.find(p=>p.page===r.page);
  if(!page)throw Error('DELTA_ORIGINAL_PAGE_MISSING');
  const unit=segmentRecord({scope:'customer',documentId:d.id,pages:[page]}).segments
   .find(u=>u.part===r.part);
  if(!unit||unit.hash!==r.hash||sha(unit.text)!==unit.hash)
   throw Error('DELTA_ORIGINAL_SOURCE_HASH_MISMATCH');
  units.push({documentId:d.id,page:r.page,part:r.part,hash:r.hash,text:unit.text});
 }
 return units;
}
const deltaRoot=job=>'squidlaw/analysis-jobs/'+job.customerKey+'/'+job.caseId+'/'+job.jobId+'/';
const write=async(put,path,value)=>put(path,json(value),{
 access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});
/** Worker retry checkpoints are stored in the SAME fenced global single-job lane. */
export async function runDeltaReviewStep({job,previous,documents,prefix,load,put,advanceJob,apiKey,model}){
 const delta=previous.delta;
 if(!delta||!['impact','revision','finalize'].includes(delta.stage))
  throw Error('DELTA_CHECKPOINT_INVALID');
 const base=await load(delta.baselineReportPath);
 const fresh=await load(delta.deltaReportPath);
 if(!base||!fresh||sha(json(base))!==delta.baselineReportSha256||base.caseId!==job.caseId||fresh.caseId!==job.caseId||
  base.sourceVersion!==delta.baselineVersion||fresh.sourceVersion!==job.documentVersion||
  base.notForCourtSubmission!==false||fresh.independentSemanticAuditPassed!==true||
  !Array.isArray(base.findings)||!Array.isArray(fresh.findings)||
  base.clientRole!==fresh.clientRole)throw Error('DELTA_REPORT_PROVENANCE_FAILED');
 const root=deltaRoot(job);
 if(delta.stage==='impact'){
  const cursor=delta.impactCursor||0;
  if(cursor>=base.findings.length){
   await advanceJob(job,'delta_impact_completed',{...previous,delta:{...delta,stage:'revision',revisionCursor:0}},'retry');
   return {status:'retry',stage:'delta_impact_completed'};
  }
  const req=buildDeltaImpactRequest({caseId:job.caseId,sourceVersion:job.documentVersion,
   baselineVersion:delta.baselineVersion,oldFindings:base.findings,
   newFindings:fresh.findings,cursor,model});
  const count=Math.min(16,base.findings.length-cursor);
  const path=root+'delta-impact/'+String(cursor).padStart(8,'0')+'.json';
  let cached=await load(path);
  if(!cached){
   if(!apiKey)throw Error('OPENAI_API_KEY_MISSING');
   let response;
   try{response=await invokeDeltaModel({request:req,apiKey})}
   catch(e){e.deltaStage=delta.stage;e.deltaCursor=delta.stage==='impact'?delta.impactCursor:delta.revisionCursor;throw e}
   cached={decisions:validateDeltaImpact({response:response.result,caseId:job.caseId,
    sourceVersion:job.documentVersion,cursor,count,newFindingCount:fresh.findings.length}),model,usage:response.usage};
   await write(put,path,cached);
  }else if(!Array.isArray(cached.decisions)||
   cached.decisions.length!==count||
   cached.decisions.some((d,i)=>d.index!==cursor+i||typeof d.affected!=='boolean'||
    !Array.isArray(d.newFindingIndices)||d.newFindingIndices.some(n=>!Number.isSafeInteger(n)||n<0||n>=fresh.findings.length)))
   throw Error('DELTA_IMPACT_CACHE_INVALID');
  await advanceJob(job,'delta_impact_checkpoint',{...previous,
   delta:{...delta,impactCursor:cursor+count,impactPaths:[...(delta.impactPaths||[]),path]}},'retry');
  return {status:'retry',stage:'delta_impact_checkpoint',reviewed:cursor+count,total:base.findings.length};
 }
 const decisions=(await Promise.all((delta.impactPaths||[]).map(path=>load(path))))
  .flatMap(x=>x?.decisions||[]);
 if(decisions.length!==base.findings.length||decisions.some((d,i)=>d.index!==i))
  throw Error('DELTA_IMPACT_UNVERIFIED_OR_MISSING');
 const affected=decisions.filter(d=>d.affected);
 if(delta.stage==='revision'){
  const cursor=delta.revisionCursor||0;
  if(cursor>=affected.length){
   await advanceJob(job,'delta_revisions_completed',{...previous,
    delta:{...delta,stage:'finalize'}},'retry');
   return {status:'retry',stage:'delta_revisions_completed'};
  }
  const decision=affected[cursor],old=base.findings[decision.index];
  const related=decision.newFindingIndices.map(index=>fresh.findings[index]);
  if(!related.length||related.some(f=>!f?.claim)){
   const error=new Error('DELTA_REVISION_NEW_FINDINGS_MISSING');
   error.deltaStage='revision';error.deltaCursor=cursor;
   throw error;
  }
  let sources;
  try{sources=await originalSourceUnits({findings:Object.assign([old,...related],{addedDocumentIds:delta.addedDocuments.map(d=>d.id)}),documents,prefix,load})}
  catch(error){const diagnostic=diagnoseDeltaSources({oldFinding:old,newFindings:related,sourceUnits:[]});throw attachDiagnosticContext(error,{...diagnostic,recoveryPlan:planDiagnosticRecovery(diagnostic),lineage:traceEvidenceLineage({baseline:base,delta:fresh,decisions,documents})})}
  if(!sources.length)throw attachDiagnosticContext(new Error('DELTA_SOURCE_UNITS_EMPTY'),diagnoseDeltaSources({oldFinding:old,newFindings:related,sourceUnits:sources}));
  const sourceLength=sources.reduce((n,u)=>n+u.text.length,0);
  if(sourceLength>120000||sources.length>40)
   throw Error('DELTA_PRIMARY_CONTEXT_TOO_LARGE');
  const payload=buildDeltaRevisionRequest({caseId:job.caseId,
   sourceVersion:job.documentVersion,baselineVersion:delta.baselineVersion,
   oldFinding:old,newFindings:related,sourceUnits:sources,reason:decision.reason,model});
  const path=root+'delta-revisions/'+String(decision.index).padStart(8,'0')+'.json';
  const candidatePath=path.replace(/\.json$/,'-candidate.json');
  let validated=await load(path);
  if(!validated){
   let candidate=await load(candidatePath);
   if(!candidate){
    if(!apiKey)throw Error('OPENAI_API_KEY_MISSING');
    let response;
    try{response=await invokeDeltaModel({request:payload,apiKey})}
    catch(e){e.deltaStage='revision';e.deltaCursor=cursor;throw e}
    candidate={response:response.result,model,usage:response.usage};
    await write(put,candidatePath,candidate);
   }
   const finding=validateDeltaRevision({response:candidate.response,
    caseId:job.caseId,sourceVersion:job.documentVersion,
    newDocIds:delta.addedDocuments.map(d=>d.id),sourceUnits:sources});
   const sourceAudit=auditLegalReasoningResult({request:{caseId:job.caseId,
    sourceVersion:job.documentVersion,ready:true,verified:false},
    result:{caseId:job.caseId,sourceVersion:job.documentVersion,findings:[finding]},
    sourceIndex:sources});
   if(!sourceAudit.complete)throw Error('DELTA_REVISION_SOURCE_AUDIT_FAILED:'+sourceAudit.failures.join(','));
   const review=buildSemanticReviewRequest({caseId:job.caseId,
    sourceVersion:job.documentVersion,findings:[finding],sourceUnits:sources,model});
   const independent=await invokeSemanticReview({request:review,apiKey});
   const check=validateSemanticReview({response:independent.result,caseId:job.caseId,
    sourceVersion:job.documentVersion,findings:[finding]});
   if(!check.complete)throw Error('DELTA_REVISION_INDEPENDENT_REVIEW_FAILED');
   validated={index:decision.index,finding,reason:decision.reason,
    independentVerified:true,sourceAuditPassed:true};
   await write(put,path,validated);
  }
  if(validated.index!==decision.index||validated.independentVerified!==true||
   validated.sourceAuditPassed!==true)throw Error('DELTA_REVISION_CACHE_INVALID');
  await advanceJob(job,'delta_revision_checkpoint',{...previous,delta:{...delta,
   revisionCursor:cursor+1,revisionPaths:[...(delta.revisionPaths||[]),path]}},'retry');
  return {status:'retry',stage:'delta_revision_checkpoint',revised:cursor+1,total:affected.length};
 }
 const revisions=await Promise.all((delta.revisionPaths||[]).map(p=>load(p)));
 if(revisions.length!==affected.length||revisions.some(x=>!x?.independentVerified||
  !x.sourceAuditPassed))throw Error('DELTA_REVISIONS_NOT_VERIFIED');
 const report=buildMergedDeltaReport({baseline:base,deltaReport:fresh,decisions,revisions,
  sourceVersion:job.documentVersion,baselineVersion:delta.baselineVersion,
  addedDocs:delta.addedDocuments,documentSnapshot:documents.map(d=>({
   id:d.id,sha256:d.sha256,pageCount:d.pageCount}))});
 if(Array.isArray(previous.customerIncludeUnverified)&&previous.customerIncludeUnverified.length){
  report.customerRequestedUnverifiedEvidence=previous.customerIncludeUnverified.map(id=>({
   documentId:id,relatedness:'not_verified',includedBy:'explicit_customer_request',
   warning:'사건 관련성이 확인되지 않았으나 고객 요청에 따라 분석에 포함했습니다. 증거가치 및 법적 관련성은 별도로 판단해야 합니다.'
  }));
 }
 const gates=inheritDeltaGates({baselineGates:delta.baselineGates,
  deltaGates:delta.deltaGates,baselineVersion:delta.baselineVersion,
  sourceVersion:job.documentVersion});
 const finalPath=root+'legal-customer-report-final.json';
 const existing=await load(finalPath);
 if(existing&&sha(json(existing))!==sha(json(report)))throw Error('DELTA_FINAL_REPORT_CONFLICT');
 if(!existing)await write(put,finalPath,report);
 await advanceJob(job,'analysis_completed',{...previous,delta:{...delta,stage:'completed'},
  deltaDocumentSnapshot:report.deltaReanalysis.documentSnapshot,
  legalCustomerReport:finalPath,gates},'completed');
 return {status:'completed',report:finalPath,
  changedFindings:report.deltaReanalysis.changedFindings,
  newFindings:report.deltaReanalysis.newFindings};
}
