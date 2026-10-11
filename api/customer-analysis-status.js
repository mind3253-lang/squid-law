import {guard,respond,readJson,casePrefix} from './customer-case.js';
import {validRequestId,requestState,publicState} from './customer-request-state.js';
export default async function handler(req,res){
 if(req.method!=='GET')return respond(res,405,{error:'GET만 지원'});
 const auth=guard(req);if(auth.error)return respond(res,auth.status,{error:auth.error});
 const caseId=String(req.query?.caseId||''),requestId=String(req.query?.requestId||'');
 if(!/^SL-[A-Za-z0-9-]{5,40}$/.test(caseId)||!validRequestId(requestId))return respond(res,400,{error:'요청 ID 형식 오류'});
 try{
  const registry=await readJson(casePrefix(auth.user,'_index').replace(/_index\/$/,'')+'registry/'+caseId+'.json');
  if(!registry||registry.id!==caseId)return respond(res,404,{error:'등록된 사건이 없습니다'});
  const state=await requestState(auth.user,caseId,requestId);
  if(!state)return respond(res,404,{error:'분석 요청 기록 없음'});
  return respond(res,200,publicState(state));
 }catch{return respond(res,502,{error:'분석 상태 조회 실패'})}
}
