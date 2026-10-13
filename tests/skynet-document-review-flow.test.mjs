import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
const html=readFileSync(new URL('../admin/skynet.html',import.meta.url),'utf8');
const first=html.indexOf('async function reviewFingerprint(');
const last=html.indexOf('el("sendChat").onclick=async()=>{',first);
assert.ok(first>=0&&last>first,'review helper boundaries');
const helpers=html.slice(first,last);
const hash='a'.repeat(64);
const sourceName='성남지원_2026가단12498_임대차보증금.pdf';
const sourceQuestion='첨부한 문서에서 사실관계와 핵심 쟁점을 원문 근거로 분석해 줘.';
function createApp({askSkynet,history=[],fetchImpl,states={}}){
 const factory=new Function('crypto','fetch','TextEncoder','URLSearchParams','AbortController',
  'setTimeout','clearTimeout','el','askSkynet','history','splitLongText',
  helpers+'\nreturn {reviewSourceText,documentReviewCheckpoint,analyzeAttachedDocuments,'+
  'isResumeReviewRequest,previousAttachedReview,reviewFingerprint};');
 // No real 1.8-second delays in retry tests; keep abort timeout cancellable.
 const timed=new Set();
 let next=0;
 const fakeTimeout=(fn,ms)=>{
  if(ms<=6000){queueMicrotask(fn);return ++next}
  const timer=setTimeout(fn,ms);timed.add(timer);return timer;
 };
 const fakeClear=id=>{if(typeof id==='object'){clearTimeout(id);timed.delete(id)}};
 const api=factory(webcrypto,fetchImpl,TextEncoder,URLSearchParams,AbortController,
  fakeTimeout,fakeClear,()=>({textContent:''}),askSkynet,history,
  (text,max)=>{
   const pieces=[];for(let i=0;i<text.length;i+=max)pieces.push(text.slice(i,i+max));
   return pieces;
  });
 return {api,dispose:()=>{for(const x of timed)clearTimeout(x)}};
}
function mockEndpoints(){
 const checkpoints=new Map();
 let documentGets=0,checkpointReads=0,checkpointWrites=0;
 const response=data=>({ok:true,status:200,json:async()=>data});
 const fetchImpl=async url=>{
  const query=new URL(url,'https://local.invalid');
  if(query.pathname==='/admin/skynet-document-context'){
   const offset=Number(query.searchParams.get('offset'));
   assert.equal(query.searchParams.get('hash'),hash);
   documentGets++;
   assert.ok(offset>=0&&offset<3,'document position');
   return response({ok:true,hash,kind:'pdf',pageCount:3,totalCharacters:330,
    text:'[PDF '+(offset+1)+'쪽 / 구간 1]\n'+('사실관계 '+(offset+1)+'. ').repeat(14),
    offset:offset+1,position:0,done:offset===2,ocrRequired:[],
    pages:[offset+1]});
  }
  if(query.pathname==='/admin/skynet-document-review'&&query.search){
   checkpointReads++;
   const key=[query.searchParams.get('documentHash'),query.searchParams.get('questionHash'),
    query.searchParams.get('chunkHash'),query.searchParams.get('chunkNumber')].join(':');
   const entry=checkpoints.get(key);
   return response({ok:true,found:!!entry,summary:entry?.summary||null,
    pages:entry?.pages||[],reviewStatus:entry?'AI_DRAFT_NOT_INDEPENDENTLY_VERIFIED':null});
  }
  if(query.pathname==='/admin/skynet-document-review'){
   // POST-only calls are passed with a request body.
   throw Error('POST was not configured in test harness');
  }
  throw Error('unexpected endpoint '+url);
 };
 const fetch=async (url,opts={})=>{
  const parsed=new URL(url,'https://local.invalid');
  if(parsed.pathname==='/admin/skynet-document-review'&&opts.method==='POST'){
   const input=JSON.parse(opts.body),key=[input.documentHash,input.questionHash,
    input.chunkHash,input.chunkNumber].join(':');
   checkpointWrites++;
   checkpoints.set(key,{summary:input.summary,pages:input.pages});
   return response({ok:true,reused:false});
  }
  return fetchImpl(url);
 };
 return {fetch,checkpoints,getCounts:()=>({documentGets,checkpointReads,checkpointWrites})};
}
test('transient failure in one PDF chunk retries and completed checkpoints are reused',async()=>{
 const endpoints=mockEndpoints();let segmentCalls=0,finalCalls=0,failedOnce=false;
 const model=async prompt=>{
  if(prompt.includes('원문 구간 2/3')&&!failedOnce){
   failedOnce=true;
   const error=new Error('provider temporarily unavailable');error.retryable=true;error.status=502;
   throw error;
  }
  if(prompt.startsWith('사용자 요청:')){finalCalls++;return '최종 종합 분석 완료'}
  segmentCalls++;
  return '원문 쪽수에 근거한 구간 검토, 청구·반박·증거관계';
 };
 const {api,dispose}=createApp({askSkynet:model,fetchImpl:endpoints.fetch});
 try{
  const answers=[],docs=[{name:sourceName,hash,pages:3}];
  await api.analyzeAttachedDocuments(docs,sourceQuestion,[],'low',
   async answer=>answers.push(answer),'123e4567e89b42d3');
  assert.equal(endpoints.checkpoints.size,3);
  assert.equal(endpoints.getCounts().checkpointWrites,3);
  assert.equal(answers.length,1);
  assert.match(answers[0],/최종 종합 분석 완료/);
  const after=segmentCalls;
  await api.analyzeAttachedDocuments(docs,sourceQuestion,[],'low',
   async answer=>answers.push(answer),'anotherturnid12');
  assert.equal(segmentCalls,after,'cached successful source windows must not re-call AI');
  assert.equal(finalCalls,2,'synthesis still runs on saved notes');
  assert.equal(endpoints.getCounts().checkpointWrites,3,'checkpoint writes are idempotent');
 }finally{dispose()}
});
test('a repeatedly failing large window is subdivided without omitting the source',async()=>{
 let calls=0;
 const model=async prompt=>{
  calls++;
  if(prompt.length>9000){
   const error=new Error('gateway timed out');
   error.retryable=true;error.status=504;
   throw error;
  }
  return '원문 분할 검토 완료 '+String(prompt.length);
 };
 const {api,dispose}=createApp({askSkynet:model,fetchImpl:async()=>{throw Error('unused')}});
 try{
  const result=await api.reviewSourceText({name:sourceName},
   {index:1,pages:[1],text:'확인 자료 '.repeat(1400)},1,sourceQuestion,'low');
  assert.match(result,/복구 분할 1\//);
  assert.match(result,/복구 분할 2\//);
  assert.ok(calls>=5);
 }finally{dispose()}
});
test('resuming from chat history reuses original question and PDF handle',()=>{
 const content=sourceQuestion+'\n[이번 대화에 직접 첨부: '+sourceName+
  ' / 문서 식별번호 '+hash+' / 146쪽]';
 const {api,dispose}=createApp({
  askSkynet:async()=>'',fetchImpl:async()=>{throw Error('unused')},
  history:[{role:'user',content},{role:'user',content:'이어서 분석해'}]
 });
 try{
  assert.equal(api.isResumeReviewRequest('이어서 분석해'),true);
  assert.equal(api.isResumeReviewRequest('재개'),true);
  const previous=api.previousAttachedReview();
  assert.equal(previous.docs[0].hash,hash);
  assert.equal(previous.docs[0].pages,146);
  assert.equal(previous.question,sourceQuestion);
 }finally{dispose()}
});
