/**
 * SKYNET episodic continuity.
 *
 * This module does not ask the LLM to infer its own memory. It builds a bounded
 * retrieval query from the actual adjacent turns, and records explicit user
 * disputes of previous assistant statements as unverified correction events.
 *
 * Events are evidence of what was SAID, not independent proof of the fact.
 */
import {createHash} from 'node:crypto';

const RELATIVE=/(?:^|[\s,.;!?])(?:그거|그것|이거|이것|그때|아까|전에|저번에|지난번|오늘|어제|이번|그런데|근데|그러니까|그래서|그랬|그렇게|그건|이건|너도|니가|네가|그놈|저놈|그 사건|그 일|뭐였|뭐라고|끝이야|끝났|기억나|알잖|왜 또|이미|방금)/u;
const CORRECTION=/(?:아니[,.!?\s]|틀렸|틀린|잘못|오류|착각|거짓말|뻥|사실이\s*아니|그게\s*아니|그거\s*아니|그런\s*말\s*안|누가\s*그랬|정정|수정해|기억\s*못|앞서\s*말했|이미\s*말했|왜\s*또\s*묻|다시\s*확인|어제\s*설명|말도\s*안\s*되|그렇게\s*말한\s*적\s*없)/u;

const TOPIC_PATTERNS=[
 /(?:20\d\d[가-힣]{1,5}\d{2,9})/gu,
 /(?:20\d\d금\d{2,9})/gu,
 /(?:공탁계|담보취소|공탁|보험증권|현금공탁|확정증명원|송달증명원|부천법원|부천지원|부천지방법원|법원)/gu,
 /(?:임대차|임대보증금|차임|관리비|부당이득|대여금|가압류|소장|서면|반소|합의서)/gu,
 /(?:스카이넷|스키드로우|스퀴드로우|서브마린|시화성|민지|바우어|고고다이브|황현수|이서현)/gu
];
function normalize(s){return String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim()}
export function topicAnchors(text,{limit=18}={}){
 const source=normalize(text),out=[],seen=new Set();
 for(const pattern of TOPIC_PATTERNS){
  for(const match of source.matchAll(pattern)){
   const label=match[0];
   if(!seen.has(label)){seen.add(label);out.push(label)}
   if(out.length>=limit)return out;
  }
 }
 // Other exact identifiers and dates are useful when a subject was not one
 // of the hard-coded domain labels. Never fabricate names/entities.
 for(const match of source.matchAll(/(?:[가-힣A-Za-z]{2,16}(?:사건|소송|공탁계)|\d{4}[.-]\d{1,2}[.-]\d{1,2})/gu)){
  if(!seen.has(match[0])){seen.add(match[0]);out.push(match[0])}
  if(out.length>=limit)break;
 }
 return out;
}
export function buildContextualRecall(messages,{retrievalQuery='',maxChars=6000}={}){
 const valid=Array.isArray(messages)?messages.filter(m=>m&&
  (m.role==='user'||m.role==='assistant')&&typeof m.content==='string'):[];
 const current=normalize(retrievalQuery||valid.at(-1)?.content||'').slice(0,5000);
 if(!current)return {query:'',anchors:[],contextDependent:false};
 // Pure source ingestion and substantive standalone questions do not inherit
 // unrelated topics from the preceding dialogue.
 const contextDependent=current.length<=230&&(
  RELATIVE.test(current)||current.length<95||/\b(?:뭐|왜|어떻게)\b/u.test(current)
 );
 if(!contextDependent)return {query:current.slice(0,maxChars),anchors:topicAnchors(current),contextDependent:false};
 const previous=valid.slice(0,-1).slice(-8);
 const recentUser=previous.filter(x=>x.role==='user').slice(-3);
 const recentAssistant=previous.filter(x=>x.role==='assistant').slice(-2);
 const carry=[...recentUser.reverse(),...recentAssistant.reverse()];
 const currentAnchors=topicAnchors(current);
 const additional=topicAnchors(carry.map(x=>x.content.slice(0,1600)).join('\n'),{limit:24})
  .filter(x=>!currentAnchors.includes(x));
 // Do not flood lexical search with an entire previous conversation.
 // Use topic identifiers, dates, and named concrete concepts, not summaries
 // of assistant speculation treated as independent facts.
 const anchors=[...currentAnchors,...additional].slice(0,20);
 const carryover=additional.slice(0,12);
 const query=(current+(carryover.length?'\n관련 대화 주제 식별자: '+carryover.join(' '):''))
  .slice(0,maxChars);
 return {query,anchors,contextDependent,carryover};
}
export function buildCorrectionEpisode({userText,recentTurns,turnId,at=new Date().toISOString()}){
 const message=normalize(userText);
 if(message.length<5||message.length>30000||!CORRECTION.test(message))return null;
 if(!/^[a-zA-Z0-9_-]{12,100}$/.test(String(turnId||'')))return null;
 const earlier=Array.isArray(recentTurns)?recentTurns.filter(x=>x&&
  ['assistant','user'].includes(x.role)&&typeof x.content==='string').slice(-8):[];
 const lastAssistant=[...earlier].reverse().find(x=>x.role==='assistant'&&x.content.trim());
 if(!lastAssistant)return null;
 const parentUser=[...earlier].reverse().find(x=>x.role==='user'&&x.content.trim());
 const anchors=topicAnchors([
  message,parentUser?.content||'',lastAssistant.content.slice(0,2200)
 ].join('\n'),{limit:22});
 const prevAssistant=normalize(lastAssistant.content).slice(0,2400);
 const prevUser=normalize(parentUser?.content||'').slice(0,900);
 const correction=message.slice(0,2500);
 const sourceHash=createHash('sha256').update(turnId+'\n'+message).digest('hex');
 const text=[
  '[SKYNET 과거 답변 오류 지적 · 독립 사실검증 전 / USER_DISPUTED]',
  '관련 사건·주제: '+(anchors.join(', ')||'특정되지 않음'),
  '이전 사용자 발언: '+(prevUser||'(이전 사용자 문장은 현재 기록에 없음)'),
  '지적받은 이전 AI 답변: '+prevAssistant,
  '사용자의 후속 지적·정정 요청: '+correction,
  '확인 상태: 사용자가 AI 답변을 잘못됐다고 지적한 사실만 확인됨. 지적의 사실적 정당성은 원문·계약서·공식 확인자료와 별도 대조해야 함. 이후 같은 주제에 답할 때 이전 AI의 단정적 주장을 반복하지 말고, 사건 경과와 정정 이유를 확인할 것.'
 ].join('\n');
 return {id:sourceHash,turnId,at,kind:'user-disputed-assistant-answer',
  verification:'unverified',anchors,text,category:'assistant_correction',
  title:'사용자가 바로잡은 이전 AI 판단: '+(anchors.slice(0,5).join(' · ')||'미분류'),
  sourceAssistantExcerpt:prevAssistant,userCorrectionExcerpt:correction};
}
export function isCorrectionMemory(item){
 return typeof item?.source==='string'&&item.source.startsWith('skynet/episodes/');
}
