import {completedCustomerReports} from './customer-analysis-jobs-db.js';
import {guard,respond,readJson,casePrefix,all} from './customer-case.js';
import {latestSnapshot} from './customer-case-knowledge.js';
export default async function handler(req,res){
 if(req.method!=='GET')return respond(res,405,{error:'GET만 지원'});
 const auth=guard(req);if(auth.error)return respond(res,auth.status,{error:auth.error});
 const caseId=String(req.query?.caseId||'');
 if(!/^SL-[A-Za-z0-9-]{5,40}$/.test(caseId))return respond(res,400,{error:'사건번호 오류'});
 try{
  const registry=await readJson(casePrefix(auth.user,'_index').replace(/_index\/$/,'')+'registry/'+caseId+'.json');
  if(!registry||registry.id!==caseId)return respond(res,404,{error:'등록된 사건이 없습니다'});
  if(req.query?.source==='legal-job'){
   const jobs=await completedCustomerReports(auth.user,caseId);
   const jobId=String(req.query?.analysisId||'');
   if(jobId&&!/^[0-9a-f-]{36}$/.test(jobId))return respond(res,400,{error:'보고서 ID 오류'});
   if(jobId){
    const job=jobs.find(x=>x.jobId===jobId);
    if(!job)return respond(res,404,{error:'완료 보고서 없음'});
    const path=job.checkpoint?.legalCustomerReport;
    if(typeof path!=='string'||!path.startsWith('squidlaw/analysis-jobs/')||!path.endsWith('.json'))return respond(res,409,{error:'보고서 저장 위치 오류'});
    const report=await readJson(path);
    if(!report||report.caseId!==caseId||report.sourceVersion!==job.documentVersion)return respond(res,409,{error:'보고서 원본 확인 실패'});
    return respond(res,200,{analysis:{id:jobId,reply:report.briefText||report.reportText||JSON.stringify(report,null,2),createdAt:job.updatedAt}});
   }
   return respond(res,200,{analyses:jobs.map(x=>({id:x.jobId,question:'법률 분석 보고서',createdAt:x.updatedAt,status:'completed',source:'legal-job'})),nextOffset:null,total:jobs.length});
  }
  const prefix=casePrefix(auth.user,caseId)+'analysis/result/';
  const analysisId=String(req.query?.analysisId||'');
  const rows=(await all(prefix,500)).filter(x=>x.pathname.endsWith('.json')&&!x.pathname.includes('/parts/')).sort((a,b)=>b.pathname.localeCompare(a.pathname));
  if(analysisId){
   if(!/^[0-9a-f-]{36}$/i.test(analysisId))return respond(res,400,{error:'분석 ID 오류'});
   for(const row of rows){if(!row.pathname.includes(analysisId))continue;const record=await readJson(row.pathname);if(record?.id===analysisId)return respond(res,200,{analysis:record})}
   return respond(res,404,{error:'분석 기록 없음'});
  }
  const offset=Math.max(0,Math.min(10000,Number(req.query?.offset)||0));
  const page=rows.slice(offset,offset+20);
  const analyses=(await Promise.all(page.map(x=>readJson(x.pathname).catch(()=>null)))).filter(Boolean).map(a=>({id:a.id,requestId:a.requestId||null,question:String(a.question||'').slice(0,180),createdAt:a.createdAt,status:a.status||'completed',documentCount:a.documentIds?.length||0}));
  const knowledge=offset===0?await latestSnapshot(auth.user,caseId,'knowledge').catch(()=>null):null;
  return respond(res,200,{analyses,nextOffset:offset+20<rows.length?offset+20:null,total:rows.length,knowledge:knowledge?{id:knowledge.id,createdAt:knowledge.createdAt,factCount:knowledge.facts?.length||0,conflictCount:knowledge.conflicts?.length||0,timelineCount:knowledge.timeline?.length||0}:null});
 }catch{return respond(res,502,{error:'분석 이력 조회 실패'})}
}
