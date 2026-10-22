import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../api/skynet-document-job.js',import.meta.url),'utf8');
function fixture(){
 const store=new Map();
 const createResponse=()=>({
  statusCode:200,headers:{},body:null,
  status(code){this.statusCode=code;return this},
  setHeader(name,value){this.headers[name]=value;return this},
  json(value){this.body=value;return this}
 });
 const get=async path=>{
  if(!store.has(path))return {statusCode:404};
  const contents=Buffer.from(JSON.stringify(store.get(path)));
  return {statusCode:200,stream:(async function*(){yield contents})()};
 };
 const put=async (path,content,{allowOverwrite}={})=>{
  if(store.has(path)&&allowOverwrite===false)throw Error('already exists');
  store.set(path,JSON.parse(content));
 };
 const list=async({prefix})=>({blobs:[...store.keys()].filter(p=>p.startsWith(prefix))
  .map(pathname=>({pathname})),cursor:null,hasMore:false});
 const code=src.replace(/^import\s+\{get,put,list\}\s+from\s+['"][^'"]+['"];?\s*$/m,'')
  .replace('export default async function handler','return async function handler');
 const fn=new Function('get','put','list','process','Buffer','console',code);
 const handler=fn(get,put,list,{env:{ADMIN_PASSWORD:'testpass',BLOB_READ_WRITE_TOKEN:'testblob'}},Buffer,console);
 const auth={authorization:'Basic '+Buffer.from('admin:testpass').toString('base64')};
 const run=async(method,body)=>{
  const req={method,headers:{...auth},query:method==='GET'?body:{},body:method==='POST'?body:{}},
   res=createResponse();
  await handler(req,res);
  return {httpStatus:res.statusCode,...res.body};
 };
 return {store,run};
}
const doc='a'.repeat(64),question='b'.repeat(64),chunks=['c'.repeat(64),'d'.repeat(64),'e'.repeat(64)];
const sourcePath='skynet/documents/'+doc+'.json';
const reviewPath=i=>'skynet/document-review/v1/'+doc+'/'+question+'/'+
 String(i+1).padStart(4,'0')+'-'+chunks[i]+'.json';
test('PDF review final report requires every original source window receipt',async()=>{
 const {store,run}=fixture();
 store.set(sourcePath,{hash:doc,name:'case.pdf',pageCount:146,segmentCount:146,ocrRequired:[12,38]});
 let res=await run('POST',{action:'start',documentHash:doc,questionHash:question,
  question:'원문을 빠짐없이 검토해',effort:'low',chunks});
 assert.equal(res.httpStatus,200);
 assert.equal(res.ok,true);
 res=await run('GET',{documentHash:doc,questionHash:question});
 assert.equal(res.httpStatus,200);
 assert.equal(res.completedChunks,0);
 assert.deepEqual(res.missingChunks,[1,2,3]);
 res=await run('POST',{action:'finish',documentHash:doc,questionHash:question,
  report:'완성 보고서 '.repeat(40)});
 assert.equal(res.httpStatus,409);
 assert.equal(res.error,'REVIEW_TEXT_CHUNKS_INCOMPLETE');
 // Unknown or wrong source digests cannot pass the completion gate.
 store.set('skynet/document-review/v1/'+doc+'/'+question+'/0001-'+'f'.repeat(64)+'.json',{summary:'wrong source'});
 for(let i=0;i<chunks.length;i++){
  store.set(reviewPath(i),{summary:'검증되지 않은 모델 요약 '+i});
 }
 res=await run('GET',{documentHash:doc,questionHash:question});
 assert.equal(res.completedChunks,3);
 assert.equal(res.totalChunks,3);
 res=await run('POST',{action:'finish',documentHash:doc,questionHash:question,
  report:'완성 보고서 '.repeat(40)});
 assert.equal(res.httpStatus,200);
 res=await run('GET',{documentHash:doc,questionHash:question});
 assert.equal(res.complete,true);
 assert.equal(res.status,'TEXT_COMPLETE_VISUAL_PENDING');
 assert.equal(res.ocrRequired.length,2);
 assert.equal(res.visualVerified,false);
 assert.match(res.report,/완성 보고서/);
});
test('PDF review cannot start without registered source or with forged source bounds',async()=>{
 const {store,run}=fixture();
 let res=await run('POST',{action:'start',documentHash:doc,questionHash:question,
  question:'이 문서 분석',effort:'low',chunks});
 assert.equal(res.httpStatus,404);
 store.set(sourcePath,{hash:doc,name:'case.pdf',pageCount:146,segmentCount:146,ocrRequired:[]});
 res=await run('POST',{action:'start',documentHash:doc,questionHash:question,
  question:'이 문서 분석',effort:'low',chunks:[...chunks,'invalid']});
 assert.equal(res.httpStatus,400);
 res=await run('POST',{action:'start',documentHash:doc,questionHash:question,
  question:'이 문서 분석',effort:'low',chunks});
 assert.equal(res.httpStatus,200);
 res=await run('POST',{action:'start',documentHash:doc,questionHash:question,
  question:'다른 요청',effort:'low',chunks});
 assert.equal(res.httpStatus,409);
});
test('SKYNET PDF status questions do not fall through to memory-only chat',()=>{
 const html=readFileSync(new URL('../admin/skynet.html',import.meta.url),'utf8');
 const nginx=readFileSync(new URL('../deploy/nginx-gabia-direct.conf.example',import.meta.url),'utf8');
 assert.match(html,/function isReviewStatusQuestion/);
 assert.match(html,/서버의 실제 PDF 분석 진행 기록 확인 중/);
 assert.match(html,/if\(activeReview&&!archiveFiles\.length&&!attached\.length&&isReviewStatusQuestion\(msg\)\)/);
 assert.match(html,/const previous=previousAttachedReview\(\)/);
 assert.match(html,/if\(request&&!\/\^\(\?:이어서\|계속\|재개\)/);
 assert.match(html,/reviewJobRequest\('start'/);
 assert.match(html,/reviewJobRequest\('finish'/);
 assert.match(html,/showReviewJobStatus\(\{showReport:true\}\)/);
 assert.match(nginx,/location = \/admin\/skynet-document-job/);
});
