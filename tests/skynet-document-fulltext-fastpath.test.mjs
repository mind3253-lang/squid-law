import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
const repoFile=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const hash='a'.repeat(64);
const auth='Basic '+Buffer.from('admin:testpassword').toString('base64');
const source='skynet/documents/'+hash+'.json';
function mockHandler({documentLength=146,characters=75000,dropBatch=false}={}){
 const db=new Map(),reads=[];
 db.set(source,{hash,name:'법원기록.pdf',pageCount:documentLength,
  segmentCount:documentLength,characters,ocrRequired:[12,38]});
 for(let start=0;start<documentLength;start+=20){
  const path='skynet/document-segments/'+hash+'/batch-'+String(start).padStart(8,'0')+'.json';
  if(dropBatch&&start===20)continue;
  db.set(path,{segments:Array.from({length:Math.min(20,documentLength-start)},(_,i)=>({
   page:start+i+1,part:0,text:'차임, 보증금 및 공사비 협의 '.repeat(12)
  }))});
 }
 const read=async pathname=>{
  reads.push(pathname);
  if(!db.has(pathname))return {statusCode:404};
  const bytes=Buffer.from(JSON.stringify(db.get(pathname)));
  return {statusCode:200,stream:(async function*(){yield bytes})()};
 };
 const src=repoFile('api/skynet-document-fulltext.js')
  .replace(/^import\s+\{get\}\s+from\s+['"][^'"]+['"];?\s*$/m,'')
  .replace('export default async function handler','return async function handler');
 const handler=new Function('get','process','Buffer','console',src)(
  read,{env:{ADMIN_PASSWORD:'testpassword'}},Buffer,console
 );
 const invoke=async({method='GET',query={hash},headers={authorization:auth}}={})=>{
  const response={statusCode:200,payload:null,
   status(n){this.statusCode=n;return this},
   setHeader(){return this},
   json(obj){this.payload=obj;return this}};
  await handler({method,query,headers},response);
  return {httpStatus:response.statusCode,...response.payload};
 };
 return {invoke,reads};
}
test('146-page indexed PDF is read completely in one endpoint request and ordered',async()=>{
 const {invoke,reads}=mockHandler();
 const result=await invoke();
 assert.equal(result.httpStatus,200);
 assert.equal(result.mode,'whole_extracted_text');
 assert.equal(result.pageCount,146);
 assert.equal(result.segmentCount,146);
 assert.equal(result.pageNumbers.length,146);
 assert.ok(result.text.indexOf('[PDF 1쪽')<result.text.indexOf('[PDF 20쪽'));
 assert.ok(result.text.indexOf('[PDF 20쪽')<result.text.indexOf('[PDF 146쪽'));
 assert.equal(result.visualVerified,false);
 assert.equal(result.textSourceComplete,true);
 assert.deepEqual(result.ocrRequired,[12,38]);
 assert.equal(reads.length,1+Math.ceil(146/20));
});
test('oversized PDF returns explicit fallback without reading all segments',async()=>{
 const {invoke,reads}=mockHandler({characters:104001});
 const result=await invoke();
 assert.equal(result.httpStatus,413);
 assert.equal(result.error,'FULL_TEXT_TOO_LARGE');
 assert.equal(result.mode,'segmented');
 assert.equal(reads.length,1);
});
test('missing PDF index batch fails closed',async()=>{
 const {invoke}=mockHandler({dropBatch:true});
 const result=await invoke();
 assert.equal(result.httpStatus,503);
 assert.equal(result.error,'DOCUMENT_FULLTEXT_UNAVAILABLE');
});
test('private PDF endpoint rejects unauthenticated access',async()=>{
 const {invoke,reads}=mockHandler();
 const result=await invoke({headers:{}});
 assert.equal(result.httpStatus,401);
 assert.equal(reads.length,0);
});
function fastClientFixture({oversize=false,reply='원문 통합 분석 초안',visualVerified=false}={}){
 const html=repoFile('admin/skynet.html');
 const start=html.indexOf('async function reviewFingerprint(');
 const end=html.indexOf('el("sendChat").onclick=async()=>{',start);
 assert.ok(start>=0&&end>start);
 const section=html.slice(start,end);
 const map=new Map(),calls=[],models=[],answers=[];
 const response=(status,payload)=>({ok:status===200,status,json:async()=>payload});
 let job=null,receipt=null,report=null;
 const fetch=async (url,options={})=>{
  const pathname=new URL(url,'https://test.invalid').pathname;
  calls.push(pathname);
  if(pathname==='/admin/skynet-document-fulltext'){
   if(oversize)return response(413,{error:'FULL_TEXT_TOO_LARGE',retryable:false});
   return response(200,{ok:true,hash,kind:'pdf',mode:'whole_extracted_text',
    name:'법원기록.pdf',pageCount:146,segmentCount:146,
    totalCharacters:52,text:'[PDF 1쪽]\n소장\n[PDF 146쪽]\n준비서면',
    pageNumbers:[1,146],ocrRequired:[12,38],visualVerified,textSourceComplete:true});
  }
  if(pathname==='/admin/skynet-document-job'){
   if(options.method==='POST'){
    const input=JSON.parse(options.body);
    if(input.action==='start'){job=input;return response(200,{ok:true,reused:false})}
    if(input.action==='finish'){assert.ok(receipt);report=input.report;return response(200,{ok:true,complete:true})}
   }
   if(!job)return response(404,{error:'REVIEW_NOT_REGISTERED'});
   return response(200,{ok:true,found:true,complete:!!report,
    report,completedChunks:receipt?1:0,totalChunks:1,pageCount:146,ocrRequired:[12,38]});
  }
  if(pathname==='/admin/skynet-document-review'){
   if(options.method==='POST'){receipt=JSON.parse(options.body);return response(200,{ok:true})}
   return response(200,{ok:true,found:!!receipt,summary:receipt?.summary||null});
  }
  throw Error('Unexpected fetch '+url);
 };
 const fields=new Map();
 const el=id=>{
  if(!fields.has(id))fields.set(id,{hidden:false,value:0,onclick:null,textContent:''});
  return fields.get(id);
 };
 const store=new Map(),localStorage={
  getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)
 };
 const create=new Function('crypto','fetch','TextEncoder','URLSearchParams','AbortController',
  'setTimeout','clearTimeout','el','askSkynet','history','splitLongText',
  'localStorage','saveTurn','drawChat',section+
  '\nreturn {analyzeWholeIndexedPdf,analyzeAttachedDocuments};');
 const api=create(webcrypto,fetch,TextEncoder,URLSearchParams,AbortController,
  setTimeout,clearTimeout,el,async prompt=>{models.push(prompt);return reply},
  [],text=>[text],localStorage,async()=>{},()=>{});
 return {api,models,calls,answers,
  saveAnswer:async text=>answers.push(text),report:()=>report};
}
test('fast PDF path sends all indexed text in exactly one AI call and saves a text-only report',async()=>{
 const mock=fastClientFixture();
 const finished=await mock.api.analyzeWholeIndexedPdf({name:'법원기록.pdf',hash},
  '사건을 검토해 줘','low',mock.saveAnswer);
 assert.equal(finished,true);
 assert.equal(mock.models.length,1);
 assert.match(mock.models[0],/PDF 146쪽/);
 assert.match(mock.models[0],/소장/);
 assert.match(mock.models[0],/이미지/);
 assert.match(mock.report(),/통합 분석/);
 assert.equal(mock.answers.length,1);
 assert.match(mock.answers[0],/이미지 증거 미검증/);
});
test('over-input fulltext falls back without invoking the AI',async()=>{
 const mock=fastClientFixture({oversize:true});
 assert.equal(await mock.api.analyzeWholeIndexedPdf({name:'법원기록.pdf',hash},
  '사건을 검토해 줘','low',mock.saveAnswer),false);
 assert.equal(mock.models.length,0);
});
