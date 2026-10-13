import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../admin/skynet.html',import.meta.url),'utf8');
const api=readFileSync(new URL('../api/skynet-warehouse.js',import.meta.url),'utf8');
const start=html.indexOf('function courtCaseReferences(');
const end=html.indexOf('function expectedPdfPageCount(',start);
if(start<0||end<=start)throw Error('CASE_PDF_RESOLVER_NOT_FOUND');

const stale={name:'수원지방법원 성남지원_2026가단12498_000001_임대차보증금_1.pdf',
 hash:'a'.repeat(64),pages:146};
const valid={name:'부천지원_2026가단12878_000001_본소.pdf',
 hash:'b'.repeat(64),pageCount:258,indexed:true};
const fakeAbort=class {constructor(){this.signal={}}abort(){}};
const makeResolver=({items=[],error=null,rawIndex=null}={})=>{
 const fetch=async()=>{
  if(error)throw Error(error);
  return {ok:true,json:async()=>({mode:'case-pdf',docket:'2026가단12878',items})};
 };
 const code=html.slice(start,end)+
  '\nreturn {mismatchedPdfCase,resolveCaseRelevantPdf};';
 return new Function('fetch','AbortController','setTimeout','clearTimeout',
  'encodeURIComponent','setSkynetPipelineProgress','indexArchivedPdfInWindows',
  code)(fetch,fakeAbort,()=>1,()=>{},encodeURIComponent,()=>{},
  rawIndex||(async()=>{throw Error('unexpected reindex')}));
};
test('12878 request never analyzes a 12498 PDF when exact original is missing',async()=>{
 const resolver=makeResolver();
 const result=await resolver.resolveCaseRelevantPdf('2026가단 12878 사건 다시 분석해 줘',stale);
 assert.equal(result.doc,null);
 assert.match(result.reason,/12878/);
 assert.match(result.reason,/다른 12498 문서/);
 assert.equal(resolver.mismatchedPdfCase('2026가단12878 다시 분석',stale).actual,
  '2026가단12498');
});
test('indexed 12878 original is chosen automatically by its hash and page count',async()=>{
 const resolver=makeResolver({items:[valid]});
 const result=await resolver.resolveCaseRelevantPdf('2026가단 12878 사건 다시 분석해 줘',stale);
 assert.equal(result.doc.hash,valid.hash);
 assert.equal(result.doc.pages,258);
 assert.equal(result.doc.name,valid.name);
 assert.equal(result.autoSelected,true);
});
test('a saved but unindexed 12878 original is reindexed, not replaced by 12498',async()=>{
 const raw={name:valid.name,hash:valid.hash,indexed:false,batch:'batch_12345678',parts:4};
 let calls=0;
 const resolver=makeResolver({items:[raw],rawIndex:async(batch,parts,name,onProgress)=>{
  calls++;assert.equal(batch,raw.batch);
  onProgress({pages:258,processedPages:258});
  return {hash:raw.hash,pages:258};
 }});
 const result=await resolver.resolveCaseRelevantPdf('2026가단12878 사건 재분석',stale);
 assert.equal(calls,1);
 assert.equal(result.doc.hash,valid.hash);
});
test('multiple PDFs for same case and lookup failure both decline auto-analysis',async()=>{
 const ambiguous=makeResolver({items:[valid,{...valid,hash:'c'.repeat(64)}]});
 const result=await ambiguous.resolveCaseRelevantPdf('2026가단12878 사건 분석',stale);
 assert.equal(result.doc,null);
 assert.match(result.reason,/2개/);
 const unavailable=makeResolver({error:'server unavailable'});
 const failure=await unavailable.resolveCaseRelevantPdf('2026가단12878 사건 분석',stale);
 assert.equal(failure.doc,null);
 assert.match(failure.reason,/조회가 아직 실패/);
});
test('no stale 32 percent PDF bar or billed analysis is started when wrong source is selected',()=>{
 assert.match(html,/if\(unresolved\.length\)\{/);
 assert.match(html,/clearSkynetPipelineProgress\(\);\s*await saveAnswer\('\*\*해당 사건 원본 연결 확인 필요/);
 assert.match(html,/if\(!resolvedSource\.doc\)\{/);
 assert.match(html,/if\(!running\)\{\s*panel\.hidden=true;return/);
 assert.doesNotMatch(html,/관련 사건 자료로만 사용해/);
 assert.match(api,/mode==='case-pdf'/);
 assert.match(api,/skynet\/warehouse\//);
 assert.match(api,/skynet\/documents\//);
});
