import {guard,respond,casePrefix} from './customer-case.js';
import {getJob} from './customer-analysis-jobs-db.js';
import {get} from '../lib/customer-object-storage.mjs';
const validId=s=>/^SL-[A-Za-z0-9-]{5,40}$/.test(s);
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const unique=a=>[...new Set(a.filter(Boolean))];
function normalized(s){return String(s||'').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|#160);/gi,' ').replace(/&(?:quot|#34);/gi,'"').replace(/&(?:amp|#38);/gi,'&').replace(/\s+/g,'').replace(/[·.,:;()[\]{}"'‘’“”]/g,'').toLowerCase()}
function officialUrl(s){
 try{
  const u=new URL(String(s||''));
  if(u.protocol!=='https:'||u.username||u.password||u.port||!['law.go.kr','www.law.go.kr'].includes(u.hostname.toLowerCase()))return null;
  if(!/\/(?:LSW\/)?precInfoP\.do$/i.test(u.pathname))return null;
  if(!u.searchParams.has('precSeq')&&!u.searchParams.has('evtNo'))return null;
  u.searchParams.delete('utm_source');return u.toString();
 }catch{return null}
}
function visibleText(html){
 return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ');
}
async function verifyPrecedent(row){
 const url=officialUrl(row.url);if(!url)return {ok:false,reason:'invalid_official_url'};
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
 try{
  const response=await fetch(url,{signal:ctrl.signal,redirect:'follow',headers:{accept:'text/html'}});
  if(!response.ok)return {ok:false,reason:'http_'+response.status};
  if(!officialUrl(response.url))return {ok:false,reason:'redirected_outside_official'};
  const text=visibleText((await response.text()).slice(0,2000000));
  const header=text.slice(0,15000);
  // Verify the actual ruling header, never references to other cases in the body.
  const headers=[...header.matchAll(/(?:대법원|[가-힣]+법원)\s+(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*선고\s+(\d{2,4}[가-힣]+\d+)\s*(?:전원합의체\s*)?판결/g)];
  if(!headers.length)return {ok:false,reason:'header_not_found'};
  // The official page's ruling heading is authoritative; the AI's number/date may be wrong.
  const found=headers[0];
  const actualNumber=found[4];
  const actualDate=`${found[1]}. ${Number(found[2])}. ${Number(found[3])}.`;
  // Search AFTER the ruling title, not the site's navigation bar.
  const body=text.slice(Math.max(0,header.indexOf(found[0])+found[0].length));
  const section=body.match(/【판결요지】\s*([\s\S]*?)(?=【(?:참조조문|참조판례|전\s*문|주\s*문)】|$)/);
  const fallback=body.match(/【판시사항】\s*([\s\S]*?)(?=【(?:판결요지|참조조문|참조판례|전\s*문)】|$)/);
  const summary=clean((section?.[1]||fallback?.[1]||'').slice(0,1800)).slice(0,650);
  if(summary.length<25)return {ok:false,reason:'official_holding_missing',actual:actualNumber,textLength:text.length,hasHolding:body.includes('【판결요지】')};
  return {ok:true,item:{caseNumber:actualNumber,date:actualDate,court:found[0].split(/\s+/)[0],name:row.name,summary,relevance:actualNumber===String(row.caseNumber).replace(/\s/g,'')?row.relevance:'공식 원문 사건번호가 검색 제안과 달라 관련성을 재검토해야 합니다.',caution:row.caution||'판결의 사실관계와 이 사건의 차이, 기망행위·처분행위·고의의 입증 여부를 별도로 검토해야 합니다.',url,verification:'국가법령정보센터 원문 기준 사건번호·선고일·판결요지 확인'},corrected:actualNumber!==String(row.caseNumber).replace(/\s/g,'')};
 }catch(e){return {ok:false,reason:e?.name==='AbortError'?'timeout':'fetch_or_parse_error'}}finally{clearTimeout(timer)}
}
function parsePrecedents(raw){
 let parsed;try{parsed=JSON.parse(raw.replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/,''))}catch{return []}
 const rows=Array.isArray(parsed?.precedents)?parsed.precedents:[],seen=new Set(),out=[];
 for(const row of rows){
  const caseNumber=clean(row?.caseNumber).replace(/\s/g,'');
  if(!/^\d{2,4}[가-힣]+\d{1,9}$/.test(caseNumber)||seen.has(caseNumber))continue;
  const date=clean(row.date),court=clean(row.court);
  if(!/^\d{4}[.-]\s*\d{1,2}[.-]\s*\d{1,2}\.?$/.test(date)||!court||!officialUrl(row.url))continue;
  seen.add(caseNumber);
  out.push({caseNumber,date,court,name:clean(row.name),summary:clean(row.summary).slice(0,650),relevance:clean(row.relevance).slice(0,650),caution:clean(row.caution).slice(0,400),url:row.url,originalExcerpt:clean(row.originalExcerpt).slice(0,350)});
  if(out.length>=8)break;
 }
 return out;
}
async function savedLegalContext(user,id,jobId){
 const job=await getJob(user,id,jobId);
 if(!job)return {error:'REPORT_JOB_NOT_FOUND',status:404};
 if(job.status!=='completed')return {error:'REPORT_NOT_COMPLETE',status:409};
 const path=job.checkpoint?.legalCustomerReport;
 const root='squidlaw/analysis-jobs/'+casePrefix(user,id).split('/')[2]+'/'+id+'/'+jobId+'/';
 if(path!==root+'legal-customer-report.json'&&path!==root+'legal-customer-report-final.json')return {error:'REPORT_PATH_MISMATCH',status:409};
 const r=await get(path,{access:'private'});
 if(!r||r.statusCode!==200)return {error:'REPORT_STORAGE_UNAVAILABLE',status:503};
 const chunks=[];let size=0;
 for await(const part of r.stream){size+=part.length;if(size>4*1024*1024)throw Error('REPORT_TOO_LARGE');chunks.push(Buffer.from(part))}
 const report=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(report?.caseId!==id||report?.reportType!=='gpt_legal_analysis'||report?.sourceVersion!==job.documentVersion)return {error:'REPORT_SOURCE_MISMATCH',status:409};
 return {legalSearchKeywords:report.legalSearchKeywords||[],reportJobId:jobId};
}
export default async function handler(req,res){
 const auth=guard(req);if(auth.error)return respond(res,auth.status,{error:auth.error});
 if(req.method!=='GET')return respond(res,405,{error:'GET만 지원'});
 const id=String(req.query?.caseId||'');if(!validId(id))return respond(res,400,{error:'사건 ID 오류'});
 try{
  const user=auth.user;
  const jobId=String(req.query?.jobId||'');
  if(!/^[0-9a-f-]{36}$/.test(jobId))return respond(res,400,{code:'REPORT_JOB_ID_REQUIRED',error:'완료보고서 작업 ID가 필요합니다.'});
  // Use the original National Law Information Center DRF API, not GPT web_search.
  const legalReport=await savedLegalContext(user,id,jobId);
  if(legalReport?.error)return respond(res,legalReport.status,{code:legalReport.error,error:'완료보고서의 판례 검색 키워드를 조회하지 못했습니다.'});
  const keywords=Array.isArray(legalReport.legalSearchKeywords)?unique(legalReport.legalSearchKeywords.map(clean).filter(Boolean)).slice(0,3):[];
  if(!keywords.length)return respond(res,409,{code:'LEGAL_KEYWORDS_REQUIRED',error:'완료보고서에 판례 검색 키워드가 없습니다.'});
  const oc=process.env.LAW_GO_KR_OC||process.env.LAW_API_OC;
  if(!oc)return respond(res,503,{code:'PRECEDENT_SOURCE_NOT_CONFIGURED',error:'국가법령정보센터 판례 검색 API 인증값이 없습니다.'});
  const strip=s=>String(s||'').replace(/<[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').trim();
  const tag=(s,n)=>strip(s.match(new RegExp('<'+n+'(?:\\\\s[^>]*)?>([\\\\s\\\\S]*?)<\\\\/'+n+'>','i'))?.[1]||'');
  const rows=[],failures=[];
  for(const keyword of keywords){
   const url=new URL('https://www.law.go.kr/DRF/lawSearch.do');
   url.searchParams.set('OC',oc);url.searchParams.set('target','prec');url.searchParams.set('type','XML');url.searchParams.set('query',keyword);url.searchParams.set('display','20');
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
   try{
    const response=await fetch(url,{signal:controller.signal,headers:{accept:'application/xml,text/xml'}});
    if(!response.ok)throw Error('HTTP_'+response.status);
    const xml=await response.text();
    if(!xml.includes('<')||/인증 실패|인증오류/.test(xml.slice(0,450)))throw Error('INVALID_XML_RESPONSE');
    const blocks=[...xml.matchAll(/<prec(?:\\s[^>]*)?>([\\s\\S]*?)<\\/prec>/gi)].map(m=>m[1]);
    for(const block of blocks){
     const caseNumber=clean(tag(block,'사건번호'));
     const id=clean(tag(block,'판례일련번호'));
     if(!caseNumber&&!id)continue;
     const summary=clean(tag(block,'판시사항'));
     const name=clean(tag(block,'사건명'));
     const officialLink=clean(tag(block,'판례상세링크'));
     const url=officialLink.startsWith('https://www.law.go.kr/')?officialLink:
       id?'https://www.law.go.kr/LSW/precInfoP.do?precSeq='+encodeURIComponent(id):'';
     rows.push({caseNumber,name,court:clean(tag(block,'법원명')),date:clean(tag(block,'선고일자')),summary,id,url,relevance:'검색 키워드: '+keyword,caution:'원문을 확인하여 사건의 사실관계 및 적용 법리를 검토해야 합니다.',verification:'국가법령정보센터 판례 검색 API',keyword});
    }
   }catch(e){failures.push({keyword,code:String(e?.name==='AbortError'?'TIMEOUT':e?.message||'API_ERROR').slice(0,60)})}
   finally{clearTimeout(timer)}
  }
  if(failures.length===keywords.length)return respond(res,502,{code:'OFFICIAL_PRECEDENT_API_FAILED',error:'국가법령정보센터 판례 검색 API 호출에 실패했습니다.',failures});
  const dedup=[...new Map(rows.map(x=>[x.caseNumber||x.id,x])).values()];
  const words=s=>clean(s).split(/[^가-힣A-Za-z0-9]+/).filter(x=>x.length>=2);
  const scored=dedup.map(x=>{
   const hay=(x.name+' '+x.summary).toLowerCase();
   const score=keywords.reduce((n,k)=>n+words(k).filter(w=>hay.includes(w.toLowerCase())).length,0);
   return {...x,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,6);
  console.info('precedent_official_api',{keywords:keywords.length,raw:rows.length,unique:dedup.length,relevant:scored.length,failed:failures.length});
  return respond(res,200,{caseId:id,source:'국가법령정보센터 판례 검색 API',query:keywords.join(', '),count:scored.length,results:scored,report:'',citations:[],notice:scored.length?'국가법령정보센터 검색 결과 중 키워드가 판시사항 또는 사건명에 포함된 판례입니다. 사건 적용은 원문 확인이 필요합니다.':'공식 API 검색 결과에서 키워드가 판시사항 또는 사건명에 일치하는 판례를 찾지 못했습니다.',diagnostics:{raw:rows.length,unique:dedup.length,failed:failures}});
 }catch(e){console.error('PRECEDENT_SEARCH_STAGE_FAILURE',JSON.stringify({code:String(e?.code||'UNKNOWN').slice(0,40),type:String(e?.name||'Error').slice(0,40)}));return respond(res,502,{code:'PRECEDENT_SEARCH_ERROR',error:'판례 검색 처리 실패 ('+String(e?.code||e?.name||'UNKNOWN').slice(0,40)+')'})}
}
