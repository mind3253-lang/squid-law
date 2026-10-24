import {guard,respond,readJson,casePrefix,documents} from './customer-case.js';
import {latestSnapshot} from './customer-case-knowledge.js';
const validId=s=>/^SL-[A-Za-z0-9-]{5,40}$/.test(s);
const clean=s=>String(s||'').replace(/\\s+/g,' ').trim();
const unique=a=>[...new Set(a.filter(Boolean))];
export default async function handler(req,res){
 const auth=guard(req);if(auth.error)return respond(res,auth.status,{error:auth.error});
 if(req.method!=='GET')return respond(res,405,{error:'GET만 지원'});
 const id=String(req.query?.caseId||'');if(!validId(id))return respond(res,400,{error:'사건 ID 오류'});
 try{
  const user=auth.user;
  const record=await readJson(casePrefix(user,'_index').replace(/_index\\/$/,'')+'registry/'+id+'.json');
  if(!record||record.id!==id)return respond(res,404,{error:'사건을 찾을 수 없습니다.'});
  if(!process.env.OPENAI_API_KEY)return respond(res,503,{code:'OPENAI_NOT_CONFIGURED',error:'기존 OpenAI API 설정이 없습니다.'});
  const [docs,snapshot]=await Promise.all([documents(user,id),latestSnapshot(user,id,'knowledge').catch(()=>null)]);
  const context={
   title:record.title,type:record.type,
   intake:record.intake?{claimSummary:record.intake.claimSummary,caseSummary:record.intake.caseSummary,clientRole:record.intake.clientRole}:null,
   priorAnalysis:snapshot?{summary:snapshot.summary,createdAt:snapshot.createdAt,facts:(snapshot.facts||[]).slice(0,24).map(f=>({statement:f.statement,status:f.status}))}:null,
   filenames:docs.slice(-35).map(d=>d.name)
  };
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),85000);
  let response;
  try{response=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal:ctrl.signal,headers:{authorization:'Bearer '+process.env.OPENAI_API_KEY,'content-type':'application/json'},body:JSON.stringify({
   model:process.env.SQUID_PRECEDENT_MODEL||'gpt-5.1',
   tools:[{type:'web_search'}],
   tool_choice:'required',
   max_output_tokens:2500,
   instructions:'당신은 한국 판례 검색 보조 도구입니다. 제공된 기존 사건 요약을 다시 분석하지 말고 법률 쟁점에 맞는 실제 공개 판례만 웹에서 검색하십시오. 판례번호를 추측하거나 만들어내지 마십시오. 판결 법원, 선고일, 사건번호를 확인할 수 없으면 결과로 제시하지 마십시오. 원문 확인 가능한 법원 또는 국가법령정보센터 URL을 우선하십시오. 반드시 한국어로 각 판례의 관련성 및 사건에 적용할 때 주의할 점을 간결히 설명하십시오. 검색으로 확인되지 않은 사실은 확인 불가라고 하십시오.',
   input:'다음은 고객이 선택한 단일 사건의 기존 저장 맥락입니다. 파일명은 원문 증거가 아닙니다. 새 분석을 실행하지 말고 이 사건의 핵심 쟁점과 직접 관련된 실제 판례를 3~6개 검색하고 판례번호, 선고일, 법원, 쟁점, 출처 링크를 적으십시오.\\n'+JSON.stringify(context).slice(0,16000)
  })})}finally{clearTimeout(timer)}
  const data=await response.json().catch(()=>null);
  if(!response.ok)return respond(res,502,{code:'OPENAI_PRECEDENT_ERROR',error:'GPT 판례 검색 호출 실패 ('+response.status+'): '+clean(data?.error?.message||'API 오류').slice(0,200)});
  const outputs=(data?.output||[]).filter(x=>x.type==='message');
  const content=outputs.flatMap(x=>x.content||[]);
  const report=content.filter(x=>x.type==='output_text').map(x=>x.text||'').join('\\n').trim();
  const citations=unique(content.flatMap(x=>(x.annotations||[]).filter(a=>a.type==='url_citation').map(a=>a.url))).filter(u=>/^https:\\/\\//.test(u)).slice(0,25);
  if(!report)return respond(res,502,{code:'PRECEDENT_EMPTY',error:'GPT 판례 검색 응답에 확인 가능한 내용이 없습니다.'});
  return respond(res,200,{caseId:id,source:'OpenAI 웹 검색 (기존 사건 맥락 활용)',query:record.title||'선택한 사건',count:citations.length,results:[],report,citations,notice:'판례번호와 판시 내용은 링크된 판결 원문과 대조 후 서면에 인용해야 합니다. 원문 미확인 결과는 확정 판례로 취급하지 않습니다.'});
 }catch(e){return respond(res,502,{code:'PRECEDENT_SEARCH_ERROR',error:'GPT 판례 검색 실패: '+clean(e.message).slice(0,180)})}
}
