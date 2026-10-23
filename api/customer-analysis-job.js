import {requireOwnedCase} from '../lib/customer-case-access.mjs';
import {validClientRole} from '../lib/customer-case-intake.mjs';
import {guard,respond,readJson,documents,casePrefix} from './customer-case.js';
import {enqueueJob,getJob,resumeJob,queueSnapshot,documentVersion,latestCaseJob,confirmDocumentRelevance} from './customer-analysis-jobs-db.js';
import {scheduleCustomerWorker} from '../lib/customer-worker-dispatch.mjs';
import {shouldDispatchCustomerWorker} from '../lib/customer-worker-owner.mjs';
const kickWorker=()=>{if(shouldDispatchCustomerWorker())scheduleCustomerWorker({delayMs:350})};
const idOk=id=>/^SL-[a-zA-Z0-9-]{5,40}$/.test(id);
// Compare explicit party metadata only. Filename keywords are never evidence of mismatch.
const normParty=s=>String(s||'').replace(/\\s+/g,'').trim();
const partyMismatch=(docs,intake)=>{
 const plaintiff=normParty(intake?.plaintiffName),defendant=normParty(intake?.defendantName);
 if(!plaintiff||!defendant)return null;
 return docs.find(d=>{
  const p=normParty(d?.plaintiffName||d?.parties?.plaintiff),q=normParty(d?.defendantName||d?.parties?.defendant);
  return p&&q&&p!==plaintiff&&q!==defendant&&p!==defendant&&q!==plaintiff;
 });
};
const verifiedSourcePages=docs=>Array.isArray(docs)&&docs.length>0&&docs.every(d=>Number.isSafeInteger(d?.pageCount)&&d.pageCount>0&&/^[0-9a-f]{64}$/i.test(String(d?.sha256||'')));
export default async function handler(req,res){
 const a=guard(req);if(a.error)return respond(res,a.status,{error:a.error});
 const caseId=String(req.query?.caseId||'');if(!idOk(caseId))return respond(res,400,{error:'사건 ID 오류'});
 const registry=await requireOwnedCase(a.user,caseId).catch(()=>null);
 if(!registry||registry.id!==caseId)return respond(res,404,{code:'CASE_NOT_FOUND',error:'등록된 사건이 없습니다'});
 if(req.method==='POST'&&!validClientRole(registry.intake?.clientRole))
  return respond(res,409,{code:'CLIENT_ROLE_REQUIRED',error:'원고인가요, 피고인가요? 의뢰인 지위를 먼저 등록해 주세요.'});
 if(req.method==='GET'){
  const jobId=String(req.query?.jobId||'');if(jobId!=='latest'&&!/^[0-9a-f-]{36}$/.test(jobId))return respond(res,400,{error:'작업 ID 오류'});
  try{const job=jobId==='latest'?await latestCaseJob(a.user,caseId):await getJob(a.user,caseId,jobId);// Background checkpoint dispatch is the primary path. A browser poll should
  // Recover a lost background dispatch promptly. PostgreSQL worker leases
  // still prevent concurrent processing of the same or another case.
  const stalled=job&&Date.now()-new Date(job.updatedAt||0).getTime()>5000;
  const queue=job&&['queued','retry'].includes(job.status)?await queueSnapshot(a.user,caseId,job.jobId):null;if(job&&stalled&&(job.status==='queued'||(job.status==='retry'&&queue?.retryBackoff===false)))kickWorker(req);const allDocs=job?await documents(a.user,caseId):[];const addedIds=new Set((job?.checkpoint?.delta?.addedDocuments||[]).map(d=>d.id));const docs=addedIds.size?allDocs.filter(d=>addedIds.has(d.id)):allDocs;const totalPages=docs.reduce((n,d)=>n+(Number(d.pageCount)||0),0);const completedDocuments=Math.min(docs.length,Number(job?.checkpoint?.nextDocument)||0);const processedPages=docs.slice(0,completedDocuments).reduce((n,d)=>n+(Number(d.pageCount)||0),0)+(Number(job?.checkpoint?.nextPage)||0);const cp=job?.checkpoint||{};const extractionDone=cp.phase==='analyze'||cp.phase==='verify'||Boolean(cp.textReviewManifest)||job?.status==='completed';const extractedPages=extractionDone?totalPages:Math.min(totalPages,docs.slice(0,completedDocuments).reduce((n,d)=>n+(Number(d.pageCount)||0),0)+Math.max(0,(Number(cp.extractionNextPage)||1)-1));return job?respond(res,200,{job,queue,billing:{unit:'verified_source_page',verifiedPages:verifiedSourcePages(allDocs)?allDocs.reduce((n,d)=>n+d.pageCount,0):null,pageCountVerified:verifiedSourcePages(allDocs),priceConfirmed:false,chargeAuthorized:false},progress:{processedPages:Math.min(totalPages,processedPages),extractedPages,totalPages,completedDocuments,totalDocuments:docs.length}}):respond(res,404,{code:'ANALYSIS_JOB_NOT_FOUND',error:'작업 없음'})}catch{return respond(res,503,{error:'작업 상태 저장소 오류'})}
 }
 if(req.method!=='POST')return respond(res,405,{error:'GET/POST만 허용'});
 let b=req.body;try{if(typeof b==='string')b=JSON.parse(b)}catch{return respond(res,400,{error:'요청 형식 오류'})}
 if(b?.action==='clarify-document-relevance'){
  const jobId=String(b.jobId||''),documentId=String(b.documentId||''),explanation=String(b.explanation||'').trim();
  if(!/^[0-9a-f-]{36}$/.test(jobId)||!/^[0-9a-f-]{36}$/.test(documentId)||explanation.length<1||explanation.length>200)
   return respond(res,400,{error:'답변은 200자 이내로 입력해 주세요.'});
  try{
   const docs=await documents(a.user,caseId);
   if(!docs.some(x=>x.id===documentId))return respond(res,404,{error:'첨부 문서가 없습니다.'});
   const job=await confirmDocumentRelevance(a.user,caseId,jobId,documentVersion(docs),documentId,explanation);
   if(!job)return respond(res,409,{error:'관련성 확인은 최대 3회까지 가능합니다. 추가 확인이 필요하면 담당자에게 문의해 주세요.'});
   kickWorker(req);return respond(res,202,{job,notice:'설명을 접수하고 관련성을 다시 검토합니다.'});
  }catch{return respond(res,503,{error:'관련성 설명 저장 실패'})}
 }
 if(b?.approved!==true||!['approve-analysis','resume-analysis'].includes(b?.action))return respond(res,400,{error:'고객의 명시적 전체 분석 승인이 필요합니다'});
 if(b.action==='resume-analysis'){
  if(!/^[0-9a-f-]{36}$/.test(String(b.jobId||'')))return respond(res,400,{error:'작업 ID 오류'});
  try{const docs=await documents(a.user,caseId);if(!verifiedSourcePages(docs))return respond(res,409,{code:'SOURCE_PAGES_NOT_VERIFIED',error:'원본 PDF의 페이지 수와 파일 무결성을 먼저 검증해야 합니다.'});const job=await resumeJob(a.user,caseId,b.jobId,documentVersion(docs));if(job)kickWorker(req);return job?respond(res,202,{job}):respond(res,409,{error:'작업을 재개할 수 없습니다. 이미지 증거 검증 단계가 준비되지 않았거나 원문 버전이 변경되었습니다.'})}catch{return respond(res,503,{error:'작업 재개 실패'})}
 }
 try{const docs=await documents(a.user,caseId);if(!docs.length)return respond(res,409,{error:'분석할 문서가 없습니다'});
 if(!verifiedSourcePages(docs))return respond(res,409,{code:'SOURCE_PAGES_NOT_VERIFIED',error:'원본 PDF의 페이지 수와 파일 무결성을 먼저 검증해야 합니다.'});
 const mismatch=partyMismatch(docs,registry.intake);
 if(mismatch)return respond(res,409,{code:'CASE_PARTY_MISMATCH',error:'추가 문서의 원고·피고가 등록된 사건의 당사자와 일치하지 않습니다. 다른 사건의 자료인지 확인해 주세요. 기존 분석 결과는 변경하지 않았습니다.',documentId:mismatch.id});
 const job=await enqueueJob(a.user,caseId,documentVersion(docs));kickWorker(req);return respond(res,202,{job,notice:'분석 요청이 저장되었습니다. 실행 워커 활성화 여부는 별도로 확인해야 합니다.'})}
 catch(e){const code=e?.name==='LeaseUnavailable'?'DB_URL_MISSING':e?.code==='42P01'?'DB_TABLE_MISSING':e?.code==='28P01'?'DB_AUTH_FAILED':e?.code==='3D000'?'DB_NAME_INVALID':'DB_REGISTRATION_FAILED';return respond(res,503,{error:'분석 작업 등록 실패',code})}
}
