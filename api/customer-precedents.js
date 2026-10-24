import {guard,respond,readJson,casePrefix,documents} from './customer-case.js';
import {latestSnapshot} from './customer-case-knowledge.js';
import {completedCustomerReports} from './customer-analysis-jobs-db.js';
import {get} from '../lib/customer-object-storage.mjs';
const validId=s=>/^SL-[A-Za-z0-9-]{5,40}$/.test(s);
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const unique=a=>[...new Set(a.filter(Boolean))];
function normalized(s){return String(s||'').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|#160);/gi,' ').replace(/&(?:quot|#34);/gi,'"').replace(/&(?:amp|#38);/gi,'&').replace(/\s+/g,'').replace(/[·.,:;()[\]{}"'‘’“”]/g,'').toLowerCase()}
function officialUrl(s){
 try{
  const u=new URL(String(s||''));if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  if(!['law.go.kr','www.law.go.kr','scourt.go.kr','www.scourt.go.kr','glaw.scourt.go.kr'].includes(u.hostname.toLowerCase()))return null;
  if(!/\/(?:LSW\/)?precInfoP\.do$/i.test(u.pathname))return null;
  if(!u.searchParams.has('precSeq')&&!u.searchParams.has('evtNo'))return null;
  u.searchParams.delete('utm_source');return u.toString();
 }catch{return null}
}
async function verifyPrecedent(row){
 const url=officialUrl(row.url);if(!url)return null;
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),9000);
 try{
  const response=await fetch(url,{signal:ctrl.signal,redirect:'error',headers:{accept:'text/html'}});
  if(!response.ok||!String(response.headers.get('content-type')||'').includes('text/html'))return null;
  const html=(await response.text()).slice(0,1500000);
  const heading=html.match(/\[\s*대법원\s+\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.\s*선고\s+[^<\]]+판결\s*\]/)?.[0]||'';
  if(!heading)return null;
  const text=normalized(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' '));
  const caseNumber=normalized(row.caseNumber),date=normalized(row.date);
  if(!caseNumber||!date||!normalized(heading).includes(caseNumber)||!normalized(heading).includes(date))return null;
  // The cited holding must be independently visible in the original ruling.
  const excerpt=normalized(row.originalExcerpt);
  if(excerpt.length<24||excerpt.length>350||!text.includes(excerpt))return null;
  return {...row,url,verification:'판결 원문·사건번호·선고일·인용문 확인',originalExcerpt:row.originalExcerpt};
 }catch{return null}finally{clearTimeout(timer)}
}
function parsePrecedents(raw){
 let parsed;try{parsed=JSON.parse(raw.replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,''))}catch{return []}
 const rows=Array.isArray(parsed?.precedents)?parsed.precedents:[],seen=new Set(),out=[];
 for(const row of rows){
  const caseNumber=clean(row?.caseNumber).replace(/\s/g,'');
  if(!/^(?:19|20)?\d{2,4}(?:도|다|두|마|카|가|나|누|므|헌)[가-힣A-Za-z]*\d{1,9}$/.test(caseNumber)||seen.has(caseNumber))continue;
  const date=clean(row.date),court=clean(row.court);
  if(!/^\d{4}[.-]\s*\d{1,2}[.-]\s*\d{1,2}\.?$/.test(date)||!court||!officialUrl(row.url))continue;
  seen.add(caseNumber);
  out.push({caseNumber,date,court,name:clean(row.name),summary:clean(row.summary).slice(0,650),relevance:clean(row.relevance).slice(0,650),caution:clean(row.caution).slice(0,400),url:row.url,originalExcerpt:clean(row.originalExcerpt).slice(0,350)});
  if(out.length>=8)break;
 }
 return out;
}
async function savedLegalContext(user,id){
 const jobs=await completedCustomerReports(user,id,5);
 for(const job of jobs){
  const path=job.checkpoint?.legalCustomerReport;
  if(!path||!path.startsWith('squidlaw/analysis-jobs/'))continue;
  try{
   const r=await get(path,{access:'private'});
   if(!r||r.statusCode!==200)continue;
   const chunks=[];let size=0;
   for await(const part of r.stream){size+=part.length;if(size>4*1024*1024)throw Error('REPORT_TOO_LARGE');chunks.push(Buffer.from(part))}
   const report=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(report?.caseId!==id||report?.reportType!=='gpt_legal_analysis'||report?.sourceVersion!==job.documentVersion)continue;
   return {reportJobId:job.jobId,reportTitle:report.title,issues:report.issues,findings:report.findings,conclusion:report.conclusion,summary:report.summary,analysis:report.analysis};
  }catch{}
 }
 return null;
}
export default async function handler(req,res){
 const auth=guard(req);if(auth.error)return respond(res,auth.status,{error:auth.error});
 if(req.method!=='GET')return respond(res,405,{error:'GET만 지원'});
 const id=String(req.query?.caseId||'');if(!validId(id))return respond(res,400,{error:'사건 ID 오류'});
 try{
  const user=auth.user;
  const record=await readJson(casePrefix(user,'_index').replace(/_index\/$/,'')+'registry/'+id+'.json');
  if(!record||record.id!==id)return respond(res,404,{error:'사건을 찾을 수 없습니다.'});
  if(!process.env.OPENAI_API_KEY)return respond(res,503,{code:'OPENAI_NOT_CONFIGURED',error:'기존 OpenAI API 설정이 없습니다.'});
  const [docs,snapshot,legalReport]=await Promise.all([documents(user,id),latestSnapshot(user,id,'knowledge').catch(()=>null),savedLegalContext(user,id)]);
  const context={
   title:record.title,type:record.type,
   completedLegalReport:legalReport,
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
   max_output_tokens:4500,
   instructions:'반드시 JSON 객체 하나만 출력하십시오. 형식: {"precedents":[{"caseNumber":"2012도14516","court":"대법원","date":"2016. 4. 28.","name":"","summary":"핵심 법리","relevance":"이 사건과의 직접 관련성","caution":"적용상 주의점","url":"공식 판결 원문 URL","originalExcerpt":"원문에서 그대로 복사한 판시 문장 24자 이상"}]}. 3~6개만 제시하고 같은 사건번호는 중복하지 마십시오. 사건번호·선고일·판시내용이 불확실하면 제외하십시오. URL은 실제 검색 결과에서 확인한 경우에만 쓰십시오. originalExcerpt는 해당 판결 원문에 실제 존재하는 문장을 띄어쓰기 포함 그대로 옮기십시오. 당신은 한국 판례 검색 보조 도구입니다. 제공된 기존 사건 요약을 다시 분석하지 말고 법률 쟁점에 맞는 실제 공개 판례만 웹에서 검색하십시오. 판례번호를 추측하거나 만들어내지 마십시오. 판결 법원, 선고일, 사건번호를 확인할 수 없으면 결과로 제시하지 마십시오. 원문 확인 가능한 법원 또는 국가법령정보센터 URL을 우선하십시오. 반드시 한국어로 각 판례의 관련성 및 사건에 적용할 때 주의할 점을 간결히 설명하십시오. 검색으로 확인되지 않은 사실은 확인 불가라고 하십시오.',
   input:'다음은 고객이 선택한 단일 사건의 기존 저장 맥락입니다. 완료된 법률 분석 보고서의 쟁점을 최우선으로 사용하십시오. 파일명은 원문 증거가 아닙니다. 새 분석을 실행하지 말고 이 사건의 핵심 쟁점과 직접 관련된 실제 판례를 3~6개 검색하고 판례번호, 선고일, 법원, 쟁점, 출처 링크를 적으십시오.\\n'+JSON.stringify(context).slice(0,26000)
  })})}finally{clearTimeout(timer)}
  const data=await response.json().catch(()=>null);
  if(!response.ok)return respond(res,502,{code:'OPENAI_PRECEDENT_ERROR',error:'GPT 판례 검색 호출 실패 ('+response.status+'): '+clean(data?.error?.message||'API 오류').slice(0,200)});
  const outputs=(data?.output||[]).filter(x=>x.type==='message');
  const content=outputs.flatMap(x=>x.content||[]);
  const report=content.filter(x=>x.type==='output_text').map(x=>x.text||'').join('\n').trim();
  const citations=unique(content.flatMap(x=>(x.annotations||[]).filter(a=>a.type==='url_citation').map(a=>a.url))).filter(u=>/^https:\/\//.test(u)).slice(0,25);
  if(!report)return respond(res,502,{code:'PRECEDENT_EMPTY',error:'GPT 판례 검색 응답에 확인 가능한 내용이 없습니다.'});
  const candidates=parsePrecedents(report);
  const checked=await Promise.all(candidates.map(verifyPrecedent));
  const results=checked.filter(Boolean).slice(0,6);
  if(!results.length)return respond(res,200,{caseId:id,source:'공식 판결 원문 대조',query:record.title||'선택한 사건',count:0,results:[],report:'',citations:[],notice:'원문에서 사건번호·선고일·판시 인용문을 모두 확인한 판례가 없어 결과에서 제외했습니다.'});
  return respond(res,200,{caseId:id,source:'OpenAI 웹 검색 (기존 사건 맥락 활용)',query:record.title||'선택한 사건',count:results.length,results,report:'',citations:[],notice:'공식 판결 원문에서 사건번호·선고일·인용문을 확인한 판례만 표시합니다. 실제 사건에 대한 적용은 별도 법률 검토가 필요합니다.'});
 }catch(e){return respond(res,502,{code:'PRECEDENT_SEARCH_ERROR',error:'GPT 판례 검색 실패: '+clean(e.message).slice(0,180)})}
}
