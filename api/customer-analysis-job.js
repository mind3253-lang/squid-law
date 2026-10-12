import {guard,respond,readJson,documents,casePrefix} from './customer-case.js';
import {enqueueJob,getJob,resumeJob,queueSnapshot,documentVersion} from './customer-analysis-jobs-db.js';
import {waitUntil} from '@vercel/functions';
const kickWorker=req=>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return;
 const host=process.env.VERCEL_URL;
 if(!host)return;
 const url='https://'+host+'/api/customer-analysis-worker';
 waitUntil(fetch(url,{method:'POST',headers:{authorization:'Bearer '+secret},signal:AbortSignal.timeout(25000)}).catch(()=>{}));
};
const idOk=id=>/^SL-[a-zA-Z0-9-]{5,40}$/.test(id);
export default async function handler(req,res){
 const a=guard(req);if(a.error)return respond(res,a.status,{error:a.error});
 const caseId=String(req.query?.caseId||'');if(!idOk(caseId))return respond(res,400,{error:'사건 ID 오류'});
 const registry=await readJson(casePrefix(a.user,'_index').replace(/_index\/$/,'')+'registry/'+caseId+'.json').catch(()=>null);
 if(!registry||registry.id!==caseId)return respond(res,404,{error:'등록된 사건이 없습니다'});
 if(req.method==='GET'){
  const jobId=String(req.query?.jobId||'');if(!/^[0-9a-f-]{36}$/.test(jobId))return respond(res,400,{error:'작업 ID 오류'});
  try{const job=await getJob(a.user,caseId,jobId);if(job&&['queued','retry'].includes(job.status))kickWorker(req);const queue=job&&['queued','retry'].includes(job.status)?await queueSnapshot(a.user,caseId,jobId):null;const docs=job?await documents(a.user,caseId):[];const totalPages=docs.reduce((n,d)=>n+(Number(d.pageCount)||0),0);const completedDocuments=Math.min(docs.length,Number(job?.checkpoint?.nextDocument)||0);const processedPages=docs.slice(0,completedDocuments).reduce((n,d)=>n+(Number(d.pageCount)||0),0)+(Number(job?.checkpoint?.nextPage)||0);const cp=job?.checkpoint||{};const extractionDone=cp.phase==='analyze'||cp.phase==='verify'||Boolean(cp.textReviewManifest)||job?.status==='completed';const extractedPages=extractionDone?totalPages:Math.min(totalPages,docs.slice(0,completedDocuments).reduce((n,d)=>n+(Number(d.pageCount)||0),0)+Math.max(0,(Number(cp.extractionNextPage)||1)-1));return job?respond(res,200,{job,queue,progress:{processedPages:Math.min(totalPages,processedPages),extractedPages,totalPages,completedDocuments,totalDocuments:docs.length}}):respond(res,404,{error:'작업 없음'})}catch{return respond(res,503,{error:'작업 상태 저장소 오류'})}
 }
 if(req.method!=='POST')return respond(res,405,{error:'GET/POST만 허용'});
 let b=req.body;try{if(typeof b==='string')b=JSON.parse(b)}catch{return respond(res,400,{error:'요청 형식 오류'})}
 if(b?.approved!==true||!['approve-analysis','resume-analysis'].includes(b?.action))return respond(res,400,{error:'고객의 명시적 전체 분석 승인이 필요합니다'});
 if(b.action==='resume-analysis'){
  if(!/^[0-9a-f-]{36}$/.test(String(b.jobId||'')))return respond(res,400,{error:'작업 ID 오류'});
  try{const docs=await documents(a.user,caseId);const job=await resumeJob(a.user,caseId,b.jobId,documentVersion(docs));if(job)kickWorker(req);return job?respond(res,202,{job}):respond(res,409,{error:'작업을 재개할 수 없습니다. 이미지 증거 검증 단계가 준비되지 않았거나 원문 버전이 변경되었습니다.'})}catch{return respond(res,503,{error:'작업 재개 실패'})}
 }
 try{const docs=await documents(a.user,caseId);if(!docs.length)return respond(res,409,{error:'분석할 문서가 없습니다'});
 const job=await enqueueJob(a.user,caseId,documentVersion(docs));kickWorker(req);return respond(res,202,{job,notice:'분석 요청이 저장되었습니다. 실행 워커 활성화 여부는 별도로 확인해야 합니다.'})}
 catch(e){const code=e?.name==='LeaseUnavailable'?'DB_URL_MISSING':e?.code==='42P01'?'DB_TABLE_MISSING':e?.code==='28P01'?'DB_AUTH_FAILED':e?.code==='3D000'?'DB_NAME_INVALID':'DB_REGISTRATION_FAILED';return respond(res,503,{error:'분석 작업 등록 실패',code})}
}
