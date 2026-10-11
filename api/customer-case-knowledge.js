import {createHash,randomUUID} from 'node:crypto';
import {put} from '@vercel/blob';
import {casePrefix,all,readJson} from './customer-case.js';
const h=s=>createHash('sha256').update(s).digest('hex').slice(0,24);
const dates=s=>[...new Set((s.match(/(?:19|20)\d{2}[.\-/]\s*(?:0?[1-9]|1[0-2])[.\-/]\s*(?:0?[1-9]|[12]\d|3[01])/g)||[]))].slice(0,12);
const amounts=s=>[...new Set((s.match(/\d[\d,]*(?:\.\d+)?\s*(?:억\s*)?(?:만\s*)?(?:원|만원|억원)/g)||[]))].slice(0,12);
const terms=s=>[...new Set((s.match(/[가-힣A-Za-z]{2,12}/g)||[]).filter(x=>!['그리고','그러나','계약서','당사자','증거자료','내용증명','준비서면','원고는','피고는'].includes(x)))].slice(0,20);
export function extractFacts(pages,limit=2500){const facts=[];for(const p of pages){const lines=p.text.split(/[\n。]/).map(s=>s.trim()).filter(s=>s.length>=12);for(const line of lines){const ds=dates(line),ms=amounts(line);if(!ds.length&&!ms.length)continue;const snippet=line.slice(0,380),source={documentId:p.documentId,filename:p.filename,page:p.page};facts.push({id:h(p.id+snippet),kind:'source_observation',status:'원문 발췌·의미 미확정',statement:snippet,dates:ds,amounts:ms,entities:terms(snippet),source,eventDate:null,documentDate:null,filingDate:null,extractedAt:new Date().toISOString()});if(facts.length>=limit)return facts}}return facts}
export function candidateConflicts(facts,limit=200){const out=[];const byEntity=new Map();for(const f of facts){for(const e of f.entities.slice(0,8)){const a=byEntity.get(e)||[];a.push(f);byEntity.set(e,a)}}const seen=new Set();for(const [entity,fs] of byEntity){if(fs.length>70)continue;for(let i=0;i<fs.length;i++)for(let j=i+1;j<fs.length;j++){const a=fs[i],b=fs[j];if(a.source.documentId===b.source.documentId||(!a.amounts.length&&!a.dates.length)||(!b.amounts.length&&!b.dates.length))continue;const amountDifference=a.amounts.length&&b.amounts.length&&!a.amounts.some(x=>b.amounts.includes(x));const dateDifference=a.dates.length&&b.dates.length&&!a.dates.some(x=>b.dates.includes(x));if(!amountDifference&&!dateDifference)continue;const key=[a.id,b.id].sort().join(':');if(seen.has(key))continue;seen.add(key);out.push({id:h(key),type:amountDifference?'금액 차이 후보':'날짜 차이 후보',entity,status:'미확정·동일 사건인지 확인 필요',left:{factId:a.id,source:a.source,statement:a.statement},right:{factId:b.id,source:b.source,statement:b.statement}});if(out.length>=limit)return out}}return out}
export function timelineFromFacts(facts){return facts.filter(f=>f.dates.length).flatMap(f=>f.dates.map(date=>({id:h(f.id+date),date,event:f.statement,source:f.source,dateType:'원문에 등장한 날짜·사건일 미확정',status:'검토 필요'}))).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,1000)}
export const checklist={
'b':['금전 교부','반환 약정','변제기','변제·상계 항변'],
'c':['임대차계약','기간·차임','해지·종료','인도·보증금·원상회복'],
'd':['매매 합의','목적물 인도','대금 지급','하자·계약해제'],
'e':['계약 범위','이행·검수','대금·기성고','하자·지체'],
'f':['위법행위 또는 이득','손해·손실','인과관계','과실·항변'],
'g':['계약 성립','의무 내용','위반 여부','손해·해제·항변'],
'h':['피보전채권','보전 필요성','채무자 재산','집행·이의']
};
export function caseChecklist(caseId){const type=String(caseId).toLowerCase();const m=type.match(/(?:^|-)case([bcdefgh])(?:-|$)/);return checklist[checklist[type]?type:m?.[1]]||Object.fromEntries(Object.entries(checklist))}
export async function writeSnapshot(user,caseId,kind,data,stableId=null){
 const now=new Date().toISOString(),id=stableId||randomUUID(),prefix=casePrefix(user,caseId)+'analysis/'+kind+'/';
 const path=stableId?prefix+'request-'+id+'.json':prefix+now.replace(/[:.]/g,'-')+'-'+id+'.json';
 if(stableId){const prior=await readJson(path);if(prior?.complete&&prior.id===id)return {id,path}}
 const item={...data,id,kind,caseId,createdAt:now,version:2};
 const write=async(p,value)=>{if(stableId){const prior=await readJson(p);if(prior)return prior}try{return await put(p,JSON.stringify(value),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'})}catch(e){if(stableId){const prior=await readJson(p);if(prior)return prior}throw e}};
 const parts={},main={...item};
 for(const key of ['facts','timeline','conflicts','claimGraph']){
  if(!Array.isArray(main[key]))continue;
  const values=main[key];delete main[key];parts[key]=[];let batch=[];
  for(const value of values){
   batch.push(value);
   if(Buffer.byteLength(JSON.stringify(batch))>600000){
    const last=batch.pop();if(!batch.length)throw Error('분할 항목 크기 초과');
    const n=parts[key].length,p=prefix+'parts/'+id+'/'+key+'-'+n+'.json';
    await write(p,{snapshotId:id,key,part:n,values:batch});parts[key].push(p);batch=[last];
   }
  }
  if(batch.length){const n=parts[key].length,p=prefix+'parts/'+id+'/'+key+'-'+n+'.json';await write(p,{snapshotId:id,key,part:n,values:batch});parts[key].push(p)}
 }
 main.parts=parts;main.complete=true;
 if(Buffer.byteLength(JSON.stringify(main))>1700000)throw Error('스냅샷 매니페스트 크기 초과');
 await write(path,main);return {id,path};
}
async function hydrate(item){
 if(!item||item.version!==2||!item.parts)return item;
 if(item.complete!==true)throw Error('스냅샷 미완료');
 for(const [key,paths] of Object.entries(item.parts)){
  item[key]=[];
  for(const path of paths){
   const part=await readJson(path);
   if(!part||part.snapshotId!==item.id||part.key!==key)throw Error('분할 데이터 누락');
   item[key].push(...part.values);
  }
 }
 return item;
}
export async function latestSnapshot(user,caseId,kind){
 const rows=await all(casePrefix(user,caseId)+'analysis/'+kind+'/',500);
 const candidates=rows.filter(x=>x.pathname.endsWith('.json')&&!x.pathname.includes('/parts/')).sort((a,b)=>String(b.uploadedAt||b.pathname).localeCompare(String(a.uploadedAt||a.pathname)));
 for(const row of candidates){try{const item=await hydrate(await readJson(row.pathname));if(item)return item}catch{}}
 return null;
}
export async function analysisHistory(user,caseId){const rows=await all(casePrefix(user,caseId)+'analysis/result/',500);return (await Promise.all(rows.filter(x=>x.pathname.endsWith('.json')&&!x.pathname.includes('/parts/')).map(x=>readJson(x.pathname).catch(()=>null)))).filter(Boolean).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
