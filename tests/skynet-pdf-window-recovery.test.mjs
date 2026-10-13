import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../admin/skynet.html',import.meta.url),'utf8');
const api=readFileSync(new URL('../api/skynet-document-range.js',import.meta.url),'utf8');
const begin=html.indexOf('async function indexArchivedPdfInWindows(');
const end=html.indexOf('async function sendArchiveFiles(',begin);
if(begin<0||end<=begin)throw Error('PDF_INDEX_ROUTINE_NOT_FOUND');

const hash='b'.repeat(64);
function createHarness(respond){
 const requested=[],status=[];
 const make=new Function('fetch','ensureSkynetAnalysisActive','trackSkynetPending',
  'releaseSkynetPending','AbortController','setTimeout','clearTimeout','el',
  'setSkynetPipelineProgress',
  html.slice(begin,end)+'return indexArchivedPdfInWindows;');
 const fetch=async(url,options)=>{
  const body=JSON.parse(options.body);
  requested.push(body);
  const r=await respond(body,requested.length);
  return {ok:r.status===200,status:r.status,json:async()=>r.data};
 };
 const fn=make(fetch,()=>{},c=>c,()=>{},class{constructor(){this.signal={}}abort(){}},
  ()=>1,()=>{},name=>({set textContent(t){status.push({name,t})}}),
  (...args)=>status.push({stage:args[0],label:args[3]}));
 return {requested,status,run:(...args)=>fn(...args)};
}
const success=(startPage,pages=33)=>({status:200,data:{
 ok:true,hash,pages,processedPages:Math.min(pages,startPage+15),
 nextPage:Math.min(pages,startPage+15)+1,complete:startPage+15>=pages
}});

test('missing legacy receipt recovers from raw original using isolated generation',async()=>{
 const h=createHarness(body=>{
  if(body.recoveryMode==='normal'&&body.startPage===17)
   return {status:409,data:{error:'PREVIOUS_PDF_WINDOW_MISSING',
    recoverable:true,nextPage:1}};
  return success(body.startPage);
 });
 const completed=await h.run('batch_0123456789',3,'부천지원_2026가단12878.pdf',()=>{});
 assert.equal(completed.complete,true);
 assert.equal(completed.processedPages,33);
 assert.deepEqual(h.requested.map(r=>[r.startPage,r.recoveryMode]),[
  [1,'normal'],[17,'normal'],
  [1,'rebuild-v2'],[17,'rebuild-v2'],[33,'rebuild-v2']
 ]);
 assert.equal(h.status.some(x=>String(x.t||x.label||'').includes('자동 복구')),true);
});

test('a missing predecessor during the rebuild stops rather than falsely confirming complete',async()=>{
 const h=createHarness(body=>{
  if(body.startPage===17)return {status:409,data:{
   error:'PREVIOUS_PDF_WINDOW_MISSING',recoverable:body.recoveryMode==='normal'
  }};
  return success(body.startPage);
 });
 await assert.rejects(()=>h.run('batch_0123456789',3,'12878.pdf',()=>{}),
  /복구용 색인에서도 연결되지 않아/);
 assert.equal(h.requested.filter(x=>x.recoveryMode==='rebuild-v2'&&x.startPage===1).length,1);
});

test('backend separates normal and recovery receipts and reports recoverable 409',()=>{
 assert.match(api,/mode==='rebuild-v2'\?'skynet\/document-ingest-rebuild-v2\//);
 assert.match(api,/const recoveryMode=body\.recoveryMode==='rebuild-v2'/);
 assert.match(api,/receiptPath\(hash,startPage,recoveryMode\)/);
 assert.match(api,/receiptPath\(hash,startPage-WINDOW_PAGES,recoveryMode\)/);
 assert.match(api,/recoverable:recoveryMode==='normal'/);
 assert.match(api,/PREVIOUS_PDF_WINDOW_MISSING/);
 assert.match(api,/receiptPath\(hash,startPage,recoveryMode\),JSON\.stringify\(next\)/);
 assert.match(html,/response\.status===409&&info\.error==='PREVIOUS_PDF_WINDOW_MISSING'/);
});
