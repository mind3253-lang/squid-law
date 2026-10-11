import {guard,respond,readJson,casePrefix} from './customer-case.js';
import {analysisHistory,latestSnapshot} from './customer-case-knowledge.js';
export default async function handler(req,res){
 if(req.method!=='GET')return respond(res,405,{error:'GET만 지원'});
 const auth=guard(req);if(auth.error)return respond(res,auth.status,{error:auth.error});
 const caseId=String(req.query?.caseId||'');if(!/^SL-[A-Za-z0-9-]{5,40}$/.test(caseId))return respond(res,400,{error:'사건번호 오류'});
 try{const registry=await readJson(casePrefix(auth.user,'_index').replace(/_index\/$/,'')+'registry/'+caseId+'.json');if(!registry||registry.id!==caseId)return respond(res,404,{error:'등록된 사건이 없습니다'});const history=await analysisHistory(auth.user,caseId);const knowledge=await latestSnapshot(auth.user,caseId,'knowledge');const analysisId=String(req.query?.analysisId||'');if(analysisId){const found=history.find(x=>x.id===analysisId);return found?respond(res,200,{analysis:found}):respond(res,404,{error:'분석 기록 없음'})}const offset=Math.max(0,Math.min(10000,Number(req.query?.offset)||0));return respond(res,200,{analyses:history.slice(offset,offset+50),nextOffset:offset+50<history.length?offset+50:null,total:history.length,knowledge:knowledge?{id:knowledge.id,createdAt:knowledge.createdAt,factCount:knowledge.facts?.length||0,conflictCount:knowledge.conflicts?.length||0,timelineCount:knowledge.timeline?.length||0}:null})}catch{return respond(res,502,{error:'분석 이력 조회 실패'})}
}
