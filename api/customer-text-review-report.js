import {get} from '@vercel/blob';
import {guard,respond,readJson,casePrefix} from './customer-case.js';
import {getJob} from './customer-analysis-jobs-db.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return respond(res,405,{error:'GET만 지원'});
 const auth=guard(req);if(auth.error)return respond(res,auth.status,{error:auth.error});
 const caseId=String(req.query?.caseId||''),jobId=String(req.query?.jobId||'');
 if(!/^SL-[A-Za-z0-9-]{5,40}$/.test(caseId)||!/^[0-9a-f-]{36}$/.test(jobId))return respond(res,400,{error:'사건 또는 작업 ID 오류'});
 const registry=await readJson(casePrefix(auth.user,'_index').replace(/_index\/$/,'')+'registry/'+caseId+'.json').catch(()=>null);
 if(!registry||registry.id!==caseId)return respond(res,404,{error:'사건 없음'});
 try{
  const job=await getJob(auth.user,caseId,jobId);
  if(!job)return respond(res,404,{error:'작업 없음'});
  const customerKey=casePrefix(auth.user,caseId).split('/')[2];
  const expected='squidlaw/analysis-jobs/'+customerKey+'/'+caseId+'/'+jobId+'/text-review-intermediate-report.json';
  if(job.checkpoint?.textReviewIntermediateReport!==expected)return respond(res,409,{error:'원문 검증 중간보고서가 아직 생성되지 않았습니다'});
  const result=await get(expected,{access:'private'});
  if(!result||result.statusCode!==200)return respond(res,404,{error:'중간보고서 없음'});
  const chunks=[];let size=0;
  for await(const chunk of result.stream){size+=chunk.length;if(size>32*1024*1024)return respond(res,413,{error:'보고서 용량 초과'});chunks.push(Buffer.from(chunk))}
  const report=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const validCoverage=Array.isArray(report.sourceCoverage)&&report.sourceCoverage.length>0&&report.sourceCoverage.every(d=>Number.isSafeInteger(d?.pages)&&d.pages>0);
  const validCandidates=Array.isArray(report.opposingStatementCandidates)&&report.opposingStatementCandidates.every(x=>x?.status==='unverified_candidate');
  const validEvidence=Array.isArray(report.crossDocumentEvidenceLinks)&&report.crossDocumentEvidenceLinks.every(x=>x?.status==='unverified_related_evidence');
  const validPending=Array.isArray(report.pending)&&report.pending.length>0;
  if(report.caseId!==caseId||report.sourceVersion!==job.documentVersion||report.reportType!=='text_review_only'||report.notForCourtSubmission!==true||report.legalConclusionAvailable!==false||report.visualVerificationAvailable!==false||!validCoverage||!validCandidates||!validEvidence||!validPending)return respond(res,409,{error:'보고서 원본 검증 실패'});
  if(String(req.query?.summary||'')==='1')return respond(res,200,{summary:{reportType:report.reportType,status:report.status,notForCourtSubmission:report.notForCourtSubmission,documents:report.sourceCoverage.length,pages:report.sourceCoverage.reduce((sum,d)=>sum+d.pages,0),opposingCandidates:report.opposingStatementCandidates.length,evidenceLinks:report.crossDocumentEvidenceLinks.length,pending:report.pending}});
  return respond(res,200,{report});
 }catch{return respond(res,503,{error:'중간보고서 조회 실패'})}
}
