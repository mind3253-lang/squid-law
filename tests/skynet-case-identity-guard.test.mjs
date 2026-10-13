import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../admin/skynet.html',import.meta.url),'utf8');
const first=source.indexOf('function courtCaseReferences(');
const last=source.indexOf('function expectedPdfPageCount(',first);
if(first<0||last<=first)throw Error('CASE_ID_GUARD_NOT_INSTALLED');
const {courtCaseReferences,mismatchedPdfCase,ensurePdfMatchesQuestion}=
 new Function(source.slice(first,last)+
  'return {courtCaseReferences,mismatchedPdfCase,ensurePdfMatchesQuestion}')();
const oldPdf={name:'수원지방법원 성남지원_2026가단12498_000001_임대차보증금_1.pdf',
 hash:'a'.repeat(64),pages:146};
test('does not analyze 12498 PDF as if it were requested 12878 case',()=>{
 const mismatch=mismatchedPdfCase('2026가단12878 사건의 쟁점 도표와 최종 반박을 정리해',oldPdf);
 assert.equal(mismatch.actual,'2026가단12498');
 assert.equal(mismatch.requested,'2026가단12878');
 assert.throws(()=>ensurePdfMatchesQuestion('2026가단12878 사건 재분석',oldPdf),
  /원문처럼 분석하지 않았어/);
 assert.ok(mismatchedPdfCase('12878 사건 다시 분석해',oldPdf));
});
test('correct same-case questions and explicit cross-case comparisons remain allowed',()=>{
 assert.equal(mismatchedPdfCase('2026가단12498 사건의 공방 정리',oldPdf),null);
 assert.equal(mismatchedPdfCase('2026가단12878와 2026가단12498 사건의 비교 검토',oldPdf),null);
 assert.equal(mismatchedPdfCase('이 PDF의 입증 자료 정리',oldPdf),null);
 assert.equal(mismatchedPdfCase('원고 보증금 30000000원',oldPdf),null);
 assert.deepEqual(courtCaseReferences('2026가단12878의 반소와 12498 사건').map(x=>x.number),
  ['12878','12498']);
});
test('source identity is validated in all PDF analysis routes, not just the UI text',()=>{
 assert.match(source,/const doc=docs\[d\];ensurePdfMatchesQuestion\(question,doc\)/);
 assert.match(source,/if\(doc\)ensurePdfMatchesQuestion\(question,doc\)/);
 assert.match(source,/ensurePdfMatchesQuestion\(question,doc\);\n \/\/ Manifest/);
 assert.match(source,/mismatchedPdfCase\(reviewQuestion,uploadedDocs\[0\]\)/);
 assert.match(source,/사건 원본 불일치/);
});
