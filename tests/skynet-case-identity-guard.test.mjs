import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../admin/skynet.html',import.meta.url),'utf8');
const first=html.indexOf('function courtCaseReferences(');
const last=html.indexOf('function expectedPdfPageCount(',first);
if(first<0||last<=first)throw Error('CASE_AWARE_SOURCE_ROUTING_NOT_INSTALLED');
const engine=new Function('indexedSourceCandidates','fetch','console',
 html.slice(first,last)+
 'return {courtCaseReferences,mismatchedPdfCase,pdfSourceScope,resolveCaseRelevantPdf}');
const stale={name:'수원지방법원 성남지원_2026가단12498_000001_임대차보증금_1.pdf',
 hash:'a'.repeat(64),pages:146};
const original={name:'부천지원_2026가단12878_000001_본소.pdf',
 hash:'b'.repeat(64),pages:258};

test('12878 is recognized as distinct from attached 12498, without throwing or faking original review',async()=>{
 const methods=engine(()=>[],async()=>({ok:true,json:async()=>({items:[]})}),console);
 const mismatch=methods.mismatchedPdfCase('2026가단12878 사건의 쟁점과 최종 반박',stale);
 assert.equal(mismatch.actual,'2026가단12498');
 assert.equal(mismatch.requested,'2026가단12878');
 const result=await methods.resolveCaseRelevantPdf('2026가단12878 사건 재분석',stale);
 assert.equal(result.doc.hash,stale.hash);
 assert.match(result.sourceScope,/관련 사건 자료로만 사용해/);
 assert.match(result.sourceScope,/다른 사건의 원본 소장/);
 assert.equal(result.autoSelected,false);
});
test('automatically restores exact original from prior conversation or indexed server, without a click',async()=>{
 const inHistory=engine(()=>[original],async()=>{throw Error('should not search server')},console);
 const local=await inHistory.resolveCaseRelevantPdf('2026가단12878 본건 분석',stale);
 assert.equal(local.doc.hash,original.hash);
 assert.equal(local.sourceScope,'');
 assert.equal(local.autoSelected,true);
 const inServer=engine(()=>[],async()=>({
  ok:true,json:async()=>({items:[{hash:original.hash,name:original.name,pageCount:original.pages}]})
 }),console);
 const remote=await inServer.resolveCaseRelevantPdf('2026가단12878의 상계 쟁점',stale);
 assert.equal(remote.doc.hash,original.hash);
 assert.equal(remote.doc.pages,258);
});
test('uncertain originals remain transparently related material rather than arbitrarily selecting',async()=>{
 const another={...original,hash:'c'.repeat(64),name:'부천지원_2026가단12878_000002_답변서.pdf'};
 const methods=engine(()=>[original,another],async()=>({ok:false}),console);
 const result=await methods.resolveCaseRelevantPdf('2026가단12878의 공방 분석',stale);
 assert.equal(result.doc.hash,stale.hash);
 assert.ok(result.sourceScope.includes('관련 사건 자료'));
 assert.equal(methods.mismatchedPdfCase('2026가단12878와 2026가단12498의 비교',stale),null);
 assert.equal(methods.mismatchedPdfCase('2026가단12498 사건',stale),null);
});
test('case-aware provenance is injected in whole PDF and follow-up analysis paths',()=>{
 assert.match(html,/const selections=await Promise\.all\(docs\.map\(doc=>resolveCaseRelevantPdf\(question,doc\)\)\)/);
 assert.match(html,/reviewPromptQuestion=sourceScope/);
 assert.match(html,/sourceScope\?'\\[관련 사건 원문 분석/);
 assert.match(html,/const resolvedSource=await resolveCaseRelevantPdf\(question,doc\)/);
 assert.doesNotMatch(html,/ensurePdfMatchesQuestion/);
 assert.doesNotMatch(html,/사건 원본 불일치 · 요청/);
});
