import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../admin/skynet.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../api/skynet-document-verify.js',import.meta.url),'utf8');
const chat=readFileSync(new URL('../api/skynet-chat.js',import.meta.url),'utf8');
const nginx=readFileSync(new URL('../deploy/nginx-gabia-direct.conf.example',import.meta.url),'utf8');
const begin=ui.indexOf('function isSkynetPdfExistenceQuestion(');
const end=ui.indexOf('function isReviewStatusQuestion(',begin);
if(begin<0||end<begin)throw Error('PDF_VERIFY_ROUTE_MISSING');
const fakeAbort=class {constructor(){this.signal={}}abort(){}};
const makeVerify=(fetch)=>{
 return new Function('fetch','AbortController','setTimeout','clearTimeout','URLSearchParams',
  ui.slice(begin,end)+
  'return {matches:isSkynetPdfExistenceQuestion,verify:verifySkynetPdfPresence};')(
  fetch,fakeAbort,()=>1,()=>{},URLSearchParams);
};
const doc={name:'2026가단12878(이서현).pdf',hash:'a'.repeat(64),pages:258};
test('storage-only question is recognized and does not begin PDF analysis',()=>{
 const p=makeVerify(async()=>{throw Error('not called')});
 assert.equal(p.matches('이 파일 서버에 있는것은 확실해?'),true);
 assert.equal(p.matches('이 파일 서버에 있는 것은 확실해?'),true);
 assert.equal(p.matches('258쪽 원본 PDF 서버 저장 확인해'),true);
 assert.equal(p.matches('2026가단12878 다시 분석해'),false);
 assert.equal(p.matches('PDF 전체 분석해'),false);
 const send=ui.slice(ui.indexOf('el("sendChat").onclick=async()=>{'));
 assert.match(send,/if\(isSkynetPdfExistenceQuestion\(msg\)\)\{/);
 assert.match(send,/await verifySkynetPdfPresence\(candidates\[0\]\)/);
 assert.match(send,/await analyzeAttachedDocuments\(/);
 assert.match(send,/if\(isSkynetPdfExistenceQuestion\(msg\)\)\{/);
 assert.doesNotMatch(ui.slice(begin,end),/askSkynet\(/);
});
test('stored PDF answer requires exact hash, file name and 258 pages',async()=>{
 const server={verified:true,hash:doc.hash,name:doc.name,pageCount:258,
  verifiedBatches:9,originalVerified:true};
 const f=makeVerify(async(url)=>({ok:true,json:async()=>server}));
 const result=await f.verify(doc);
 assert.match(result,/서버 저장 확인됨/);
 assert.match(result,/258쪽/);
 assert.match(result,/원본 조각도 서버에서 확인/);
 assert.match(result,/AI 분석은 실행하지 않았어/);
 const wrong=makeVerify(async()=>({ok:true,json:async()=>({...server,pageCount:146})}));
 assert.match(await wrong.verify(doc),/같은 파일로 확인하지 않았고/);
});
test('missing or partial PDF index must not produce a confident yes',async()=>{
 const f=makeVerify(async()=>({ok:false,status:409,
  json:async()=>({error:'INDEX_SEGMENTS_MISSING'})}));
 const result=await f.verify(doc);
 assert.match(result,/확인할 수 없어/);
 assert.doesNotMatch(result,/서버 저장 확인됨/);
});
test('server checks durable manifest, every expected segment blob and raw archive bytes',()=>{
 assert.match(source,/skynet\/documents\//);
 assert.match(source,/manifest\.hash!==hash/);
 assert.match(source,/manifest\.textCoverageComplete!==true/);
 assert.match(source,/skynet\/document-segments\//);
 assert.match(source,/i<manifest\.segmentCount;i\+=20/);
 assert.match(source,/INDEX_SEGMENTS_MISSING/);
 assert.match(source,/skynet\/warehouse\//);
 assert.match(source,/skynet\/uploads\//);
 assert.match(source,/originalVerified/);
 assert.match(nginx,/location = \/admin\/skynet-document-verify/);
});
test('billing exhaustion is an explicitly non-retryable 429',()=>{
 assert.match(chat,/credit_balance_exhausted/);
 assert.match(chat,/quotaExhausted/);
 assert.match(chat,/retryable=!quotaExhausted/);
 assert.match(ui,/error\.quotaExhausted=result\?\.quotaExhausted===true/);
 assert.match(ui,/error\.retryable=!error\.quotaExhausted/);
 assert.match(ui,/if\(e\.quotaExhausted\)/);
});
