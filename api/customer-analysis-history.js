import {guard,respond} from './customer-case.js';
import {analysisHistory,latestSnapshot} from './customer-case-knowledge.js';
export default async function handler(req,res){
 if(req.method!=='GET')return respond(res,405,{error:'GET만 지원'});
 const auth=guard(req);if(auth.error)return respond(res,auth.status,{error:auth.error});
 const caseId=String(req.query?.caseId||'');if(!/^SL-[A-Za-z0-9-]{5,40}$/.test(caseId))return respond(res,400,{error:'사건번호 오류'});
 try{const history=await analysisHistory(auth.user,caseId);const knowledge=await latestSnapshot(auth.user,caseId,'knowledge');return respond(res,200,{analyses:history.slice(0,100),knowledge:knowledge?{id:knowledge.id,createdAt:knowledge.createdAt,factCount:knowledge.facts?.length||0,conflictCount:knowledge.conflicts?.length||0,timelineCount:knowledge.timeline?.length||0}:null})}catch{return respond(res,502,{error:'분석 이력 조회 실패'})}
}
