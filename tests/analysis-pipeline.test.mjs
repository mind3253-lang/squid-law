import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
async function load(path){
 const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
}
const {buildLocalIndex,buildCandidateFindings}=await load('analysis-local.js');
const {validateFindingsPayload}=await load('findings-schema.js');
const {verifyFindings}=await load('source-verification.js');
const documents=[
 {name:'원고서면.pdf',pages:[{text:'2026.10.07. 원고는 계약기간이 5년이라고 주장하였다.\n소갑 제1호증 계약서에 기재되어 있다.'}]},
 {name:'피고서면.pdf',pages:[{text:'2026.10.08. 피고는 계약기간이 2년이라고 주장하였다.\n소을 제2호증 문서를 제출하였다.'}]}
];
const index=buildLocalIndex(documents);
assert.ok(index.timeline.length>=2,'Date mentions must be indexed');
assert.ok(index.references.length>=2,'Evidence references must be indexed');
const candidates=buildCandidateFindings(index,100);
const validated=validateFindingsPayload(candidates);
const checked=verifyFindings(documents,validated.findings);
assert.ok(checked.length>=2,'Expected candidate findings');
const failures=checked.flatMap(f=>f.citationChecks).filter(c=>c.verification.status!=='matched');
assert.equal(failures.length,0,'Every local candidate should match its source PDF page');
const tampered=structuredClone(validated.findings);
tampered[0].citations[0].quote='이 문장은 실제 PDF에 존재하지 않는 허위 인용입니다.';
assert.equal(verifyFindings(documents,tampered)[0].citationChecks[0].verification.status,'unmatched');
console.log('PASS: local PDF index → candidate findings → schema → citations; tampered quote rejected');
