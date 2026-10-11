import {createHash} from 'node:crypto';
const digest=s=>createHash('sha256').update(s).digest('hex').slice(0,24);
const tokens=s=>[...new Set((String(s).toLowerCase().match(/[가-힣a-z0-9]{2,}/g)||[]).filter(x=>!['그리고','그런데','문서','증거','사건','대한','관련','합니다','있습니다'].includes(x)))];
export function searchChunks(pages,query,limit=18,maxChars=36000){
 const words=tokens(query),chunks=[];
 for(const p of pages){if(!p.readable)continue;for(let offset=0;offset<p.text.length;offset+=2000){const text=p.text.slice(Math.max(0,offset-150),offset+2300),lower=text.toLowerCase();const hits=words.reduce((n,w)=>n+(lower.includes(w)?Math.min(5,lower.split(w).length-1):0),0);chunks.push({...p,text,offset,score:hits+(words.some(w=>p.filename.toLowerCase().includes(w))?4:0)})}}
 chunks.sort((a,b)=>b.score-a.score||a.documentId.localeCompare(b.documentId)||a.page-b.page||a.offset-b.offset);
 const selected=[],perDoc=new Map();let used=0;
 for(const c of chunks){if(selected.length>=limit||used>=maxChars)break;if((perDoc.get(c.documentId)||0)>=Math.max(3,Math.ceil(limit/3)))continue;const text=c.text.slice(0,maxChars-used);if(!text.trim())continue;selected.push({...c,text});used+=text.length;perDoc.set(c.documentId,(perDoc.get(c.documentId)||0)+1)}
 const pageKeys=new Set(selected.map(x=>x.id));
 return {pages:selected,used,totalPages:pages.length,omitted:pages.filter(x=>!pageKeys.has(x.id)).length,unreadable:pages.filter(x=>!x.readable).map(x=>({filename:x.filename,page:x.page})).slice(0,100),excludedDocumentIds:[...new Set(pages.map(x=>x.documentId))].filter(x=>!perDoc.has(x))};
}
export function directQuoteCheck(reply,pages){const found=[];const rx=/[“"]([^“"\n]{8,180})[”"]\s*\[([^\[\]\n]{1,160}),\s*(\d{1,4})쪽\]/g;
 for(const m of reply.matchAll(rx)){const matches=pages.filter(p=>p.filename===m[2].trim()&&p.page===Number(m[3]));const normalize=s=>s.replace(/\s+/g,'');found.push({quote:m[1],filename:m[2].trim(),page:Number(m[3]),status:matches.some(p=>normalize(p.text).includes(normalize(m[1])))?'verified':'unverified'})}return found}
export function claimGraph(question,pages){const parts=String(question).split(/[\n。!?]/).map(x=>x.trim()).filter(x=>x.length>=12).slice(0,12);return parts.map(statement=>{const words=tokens(statement).filter(w=>w.length>=2),scores=pages.map(p=>({p,score:words.reduce((n,w)=>n+(p.text.toLowerCase().includes(w)?1:0),0)})).filter(x=>x.score>=Math.max(2,Math.ceil(words.length*.3))).sort((a,b)=>b.score-a.score).slice(0,5);return {id:digest(statement),statement,kind:'customer_claim',status:'미검증 주장',links:scores.map(({p,score})=>({documentId:p.documentId,filename:p.filename,page:p.page,relation:'관련 텍스트 후보·지지/반박 미판정',score})),missingEvidence:scores.length?'추가 검토 필요':'관련 페이지 검색 결과 없음',counterarguments:[]}})}
