import {guard,respond,readJson,casePrefix,documents} from './customer-case.js';
const okId=s=>/^SL-[A-Za-z0-9-]{5,40}$/.test(s);
const strip=s=>String(s||'').replace(/<[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').trim();
const tag=(s,n)=>strip(s.match(new RegExp('<'+n+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+n+'>','i'))?.[1]||'');
const compact=s=>String(s||'').replace(/\s+/g,' ').trim();
function keywords(record,docs){
 const text=[record.title,record.type,record.intake?.claimSummary,record.intake?.caseSummary,...docs.map(d=>d.name)].filter(Boolean).join(' ');
 const stop=new Set(['원고','피고','사건','자료','소장','의견서','준비서면','증거','첨부','분석','보고서','관련','사실','주장']);
 return [...new Set((text.match(/[가-힣]{2,12}/g)||[]).filter(x=>!stop.has(x)))].slice(0,8);
}
export default async function handler(req,res){
 const auth=guard(req);if(auth.error)return respond(res,auth.status,{error:auth.error});
 if(req.method!=='GET')return respond(res,405,{error:'GET만 지원'});
 const id=String(req.query?.caseId||'');if(!okId(id))return respond(res,400,{error:'사건 ID 오류'});
 const oc=process.env.LAW_GO_KR_OC||process.env.LAW_API_OC;
 if(!oc)return respond(res,503,{code:'PRECEDENT_SOURCE_NOT_CONFIGURED',error:'공식 판례 검색 API 인증값이 설정되지 않았습니다. 검색 결과를 만들어내지 않았습니다.'});
 try{
  const user=auth.user;
  const path=casePrefix(user,'_index').replace(/_index\/$/,'')+'registry/'+id+'.json';
  const record=await readJson(path);if(!record||record.id!==id)return respond(res,404,{error:'사건을 찾을 수 없습니다.'});
  const docs=await documents(user,id);
  const terms=keywords(record,docs);if(!terms.length)return respond(res,422,{error:'검색어를 추출할 사건 정보가 없습니다.'});
  const search=terms.slice(0,3).join(' ');
  const url=new URL('https://www.law.go.kr/DRF/lawSearch.do');
  url.searchParams.set('OC',oc);url.searchParams.set('target','prec');url.searchParams.set('type','XML');url.searchParams.set('query',search);url.searchParams.set('display','20');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
  let response;try{response=await fetch(url,{signal:controller.signal,headers:{accept:'application/xml,text/xml'}})}finally{clearTimeout(timer)}
  if(!response.ok)throw Error('공식 판례 검색 서버 응답 '+response.status);
  const xml=await response.text();
  if(!xml.includes('<')||/오류|인증 실패|인증오류/.test(xml.slice(0,450)))throw Error('공식 판례 검색 응답 확인 실패');
  const blocks=[...xml.matchAll(/<prec(?:\s[^>]*)?>([\s\S]*?)<\/prec>/gi)].map(m=>m[1]);
  const results=blocks.map(x=>({caseNumber:tag(x,'사건번호'),name:tag(x,'사건명'),court:tag(x,'법원명'),date:tag(x,'선고일자'),summary:tag(x,'판시사항'),id:tag(x,'판례일련번호'),url:tag(x,'판례상세링크')})).filter(x=>x.caseNumber||x.id);
  return respond(res,200,{caseId:id,query:search,source:'국가법령정보센터 판례검색 API',count:results.length,results,notice:'검색 결과는 판례 원문을 확인해야 합니다. 사건 적용 여부를 자동 판단하지 않습니다.'});
 }catch(e){return respond(res,502,{code:'PRECEDENT_SOURCE_ERROR',error:'공식 판례 검색에 실패했습니다: '+String(e.message||e).slice(0,160)})}
}
