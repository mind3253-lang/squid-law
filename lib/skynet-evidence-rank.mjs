// Pure ranking and source-diversity policy for historical SKYNET retrieval.
// Never equate a repeated handover summary with multiple independent records.
const STOP=new Set('어떻게 무엇 무엇인가 무엇이 이유 설명 설명해라 구체적인 내용 기록 확인 현재 이번 질문 직접 찾아 찾아라 찾아야 하는 것은 했는가 무엇이며 관련 기존 자료 내가 우리가 네가 내게 대한 그리고 있다 있다면 없다 있는 없는 어떤 때에 하는 것이 했던 하였는가 정리 차이 차이는 대해 것은 했어 있는가 일단 자체 말고'.split(' '));
const ENDINGS=['에게서는','으로부터','에서부터','으로서는','에게서','에서는','이라는','이라고','였던','했던','한다는','했다는','들은','한테','까지','처럼','보다','부터','에는','에도','에서','으로','이고','이며','에게','로는','과는','와는','으로','이는','의','은','는','이','가','을','를','에','와','과','도','만'];
function strip(word){
 let s=word.toLowerCase();
 for(const suf of ENDINGS){if(s.length>=suf.length+2&&s.endsWith(suf)){s=s.slice(0,-suf.length);break}}
 return s;
}
export function retrievalTerms(input,cap=28){
 const original=(String(input||'').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu)||[]);
 const terms=[],seen=new Set();
 for(const raw of original){
  const t=strip(raw);
  if(t.length<2||STOP.has(t)||STOP.has(raw)||seen.has(t))continue;
  seen.add(t);terms.push(t);
  if(terms.length>=cap)break;
 }
 return terms;
}
export const sourceKind=source=>String(source||'').startsWith('skynet/episodes/')?'correction':
 String(source||'').startsWith('skynet/imports/')?'import':
 String(source||'').startsWith('skynet/documents/')||String(source||'').startsWith('skynet/document-segments/')?'document':
 String(source||'').startsWith('skynet/records/')?'record':
 String(source||'').startsWith('skynet/db/')?'snapshot':
 String(source||'').startsWith('skynet/memory/')?'memory':'other';

export function scoredEvidence(candidates,query){
 const terms=retrievalTerms(query,30);
 const question=String(query||'').normalize('NFKC').toLowerCase().trim();
 const normalized=candidates.map(x=>{
  const content=String(x.content||'').normalize('NFKC').toLowerCase();
  const title=String(x.title||'').normalize('NFKC').toLowerCase();
  const hits=terms.filter(t=>content.includes(t));
  return {...x,kind:sourceKind(x.source),_content:content,_title:title,_hits:hits};
 });
 const frequency=new Map(terms.map(t=>[t,normalized.filter(x=>x._content.includes(t)).length]));
 const n=Math.max(1,normalized.length);
 return normalized.map(x=>{
  const exact=x._hits.reduce((score,t)=>score+Math.max(1,Math.min(5,Math.log2((n+1)/(frequency.get(t)+1))+2)),0);
  const titleHits=terms.filter(t=>x._title.includes(t)).length;
  const contentRatio=x._hits.length/Math.max(1,terms.length);
  const anchor=terms.filter(t=>/\d/.test(t)&&x._content.includes(t)).length;
  const isEcho=question.length>80&&x._content.includes(question.slice(0,Math.min(90,question.length)));
  const genericSummary=x.kind==='memory'&&(/통합 인계서|제\d+차 게놈|이번 시험|시험 규칙/.test(x.content)||isEcho);
  let score=exact*2+x._hits.length*2+contentRatio*12+anchor*8+Math.min(titleHits,3)*0.7;
  score+=x.kind==='correction'?13:x.kind==='import'?6:x.kind==='document'?6:x.kind==='record'?5:x.kind==='snapshot'?3:0;
  if(genericSummary)score-=16;
  if(x.role==='user'&&isEcho)score-=20;
  return {...x,score,matchedTerms:x._hits.length,matchedKeywords:x._hits,contentCoverage:contentRatio,isEcho,sourceKind:x.kind};
 }).filter(x=>x.matchedTerms>0).sort((a,b)=>b.score-a.score||b.matchedTerms-a.matchedTerms)
  .map(({_content,_title,_hits,kind,...rest})=>rest);
}

export function selectDiverseEvidence(candidates,query,{limit=12,maxPerSource=2}={}){
 const ordered=scoredEvidence(candidates,query);
 const selected=[],seen=new Set(),counts=new Map();
 // Prefer diverse sources before allowing extra parts of a long transcript.
 for(const item of ordered){
  const path=String(item.source||'unknown');
  if((counts.get(path)||0)>=maxPerSource)continue;
  const signature=item.content.normalize('NFKC').trim().slice(0,600);
  if(seen.has(signature))continue;
  counts.set(path,(counts.get(path)||0)+1);seen.add(signature);selected.push(item);
  if(selected.length===limit)return selected;
 }
 // Permit additional segments only if the available sources are genuinely sparse.
 for(const item of ordered){
  if(selected.includes(item))continue;
  const signature=item.content.normalize('NFKC').trim().slice(0,600);
  if(seen.has(signature))continue;
  seen.add(signature);selected.push(item);
  if(selected.length===limit)break;
 }
 return selected;
}
