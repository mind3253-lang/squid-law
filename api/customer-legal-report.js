import {buildCustomerAnalysisBrief} from '../lib/customer-analysis-brief.mjs';
import {documents} from './customer-case.js';
import {get} from '@vercel/blob';
import {guard,respond,readJson,casePrefix} from './customer-case.js';
import {getJob} from './customer-analysis-jobs-db.js';
const idOk=s=>/^SL-[A-Za-z0-9-]{5,40}$/.test(s);
async function load(path){
 const r=await get(path,{access:'private'});if(!r||r.statusCode!==200)return null;
 let size=0;const chunks=[];for await(const chunk of r.stream){size+=chunk.length;if(size>32*1024*1024)throw Error('REPORT_TOO_LARGE');chunks.push(Buffer.from(chunk))}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return respond(res,405,{error:'GET만 허용'});
 const auth=guard(req);if(auth.error)return respond(res,auth.status,{error:auth.error});
 const caseId=String(req.query?.caseId||''),jobId=String(req.query?.jobId||'');
 if(!idOk(caseId)||!/^[0-9a-f-]{36}$/.test(jobId))return respond(res,400,{error:'사건 또는 작업 ID 오류'});
 try{
  const registry=await readJson(casePrefix(auth.user,'_index').replace(/_index\/$/,'')+'registry/'+caseId+'.json');
  if(!registry||registry.id!==caseId)return respond(res,404,{error:'사건 없음'});
  const job=await getJob(auth.user,caseId,jobId);
  if(!job)return respond(res,404,{error:'분석 작업 없음'});
  const root='squidlaw/analysis-jobs/'+casePrefix(auth.user,caseId).split('/')[2]+'/'+caseId+'/'+jobId+'/';
  const expected=root+'legal-customer-report.json',final=root+'legal-customer-report-final.json';
  const savedPath=job.checkpoint?.legalCustomerReport;
  if(savedPath!==expected&&savedPath!==final)return respond(res,409,{error:'법률 분석 보고서가 아직 생성되지 않았습니다',status:job.status,stage:job.stage});
  const report=await load(savedPath);
  if(!report||report.caseId!==caseId||report.sourceVersion!==job.documentVersion||report.reportType!=='gpt_legal_analysis')return respond(res,409,{error:'보고서 출처 확인 실패'});
  if(String(req.query?.summary||'')==='1')return respond(res,200,{summary:{title:report.title,status:report.status,notForCourtSubmission:report.notForCourtSubmission,findings:report.findings?.length||0,issues:report.issues||[],sourceCoverage:report.sourceCoverage}});
  let brief;
  try{brief=buildCustomerAnalysisBrief({caseRecord:registry,report,documents:await documents(auth.user,caseId)})}
  catch(e){
   if(e?.message==='CLIENT_ROLE_REQUIRED')return respond(res,409,{code:'CLIENT_ROLE_REQUIRED',error:'원고인가요, 피고인가요? 의뢰인 지위를 먼저 등록해 주세요.'});
   throw e;
  }
  return respond(res,200,{report:{...report,briefText:brief.text,briefMeta:{
   clientRole:brief.clientRole,chapters:brief.chapterCount,
   displayedIssues:brief.displayedIssues,undisplayedIssues:brief.undisplayedIssues,
   sourceReferenceCount:brief.sourceReferenceCount,requiresSourceReview:brief.requiresSourceReview
  }}});

 }catch{return respond(res,503,{error:'법률 분석 보고서 조회 실패'})}
}
