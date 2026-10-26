import {guard,respond,readJson,casePrefix} from './customer-case.js';
import {put} from '../lib/customer-object-storage.mjs';
const validCase=s=>/^SL-[A-Za-z0-9-]{5,40}$/.test(s);
const validReport=s=>/^[A-Za-z0-9_-]{1,100}$/.test(s);
export default async function handler(req,res){
 const auth=guard(req);if(auth.error)return respond(res,auth.status,{error:auth.error});
 if(!['GET','PATCH'].includes(req.method))return respond(res,405,{error:'GET/PATCH만 지원'});
 const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
 const caseId=String(req.method==='GET'?req.query?.caseId:body.caseId||'');
 if(!validCase(caseId))return respond(res,400,{error:'사건번호 오류'});
 const registry=await readJson(casePrefix(auth.user,'_index').replace(/_index\/$/,'')+'registry/'+caseId+'.json');
 if(!registry||registry.id!==caseId)return respond(res,404,{error:'사건 접근 권한 없음'});
 const path=casePrefix(auth.user,caseId)+'report-filenames.json';
 try{
  if(req.method==='GET')return respond(res,200,{names:(await readJson(path))||{}});
  const reportId=String(body.reportId||''),title=String(body.title||'').trim();
  if(!validReport(reportId)||!title||title.length>80)return respond(res,400,{error:'보고서명 또는 식별값 오류'});
  const names=(await readJson(path))||{};names[reportId]=title;
  await put(path,JSON.stringify(names),{access:'private',contentType:'application/json',addRandomSuffix:false,allowOverwrite:true});
  return respond(res,200,{ok:true,title});
 }catch(e){return respond(res,503,{error:'보고서 파일명 저장 실패'})}
}
