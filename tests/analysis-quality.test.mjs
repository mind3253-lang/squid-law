import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../analysis-quality.js',import.meta.url),'utf8');
const {summarizeCitationChecks,isSourceReadyForReview}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(src));
const matched={verification:{status:'matched'}};
const missing={verification:{status:'missing_document'}};
const good=[{citations:[{document:'a.pdf',page:1,quote:'원문 인용 첫 번째'},{document:'a.pdf',page:2,quote:'원문 인용 두 번째'}],citationChecks:[matched,matched]},{citations:[{document:'b.pdf',page:1,quote:'원문 인용 세 번째'}],citationChecks:[matched]}];
assert.deepEqual({...summarizeCitationChecks(good).byStatus},{matched:3});
assert.equal(summarizeCitationChecks(good).verifiedFindings,2);
assert.equal(isSourceReadyForReview(good),true);
const mixed=[...good,{citations:[{document:'c.pdf',page:1,quote:'원문 인용 네 번째'},{document:'c.pdf',page:2,quote:'원문 인용 다섯 번째'}],citationChecks:[matched,missing]},{citations:[],citationChecks:[]}];
const result=summarizeCitationChecks(mixed);
assert.equal(result.findings,4);
assert.equal(result.verifiedFindings,2);
assert.equal(result.needsReviewFindings,2);
assert.equal(result.matched,4);
assert.equal(result.unmatched,1);
assert.equal(result.missingCitations,1);
assert.equal(result.byStatus.missing_document,1);
assert.equal(isSourceReadyForReview(mixed),false);
assert.equal(isSourceReadyForReview([]),false);
console.log('PASS: citation coverage counts, missing citations, and source readiness gate');

const mismatched=[{citations:[{document:'a.pdf',page:1,quote:'인용 1'},{document:'a.pdf',page:2,quote:'인용 2'}],citationChecks:[matched]}];
assert.equal(summarizeCitationChecks(mismatched).verifiedFindings,0);
assert.equal(summarizeCitationChecks(mismatched).needsReviewFindings,1);
assert.equal(isSourceReadyForReview(mismatched),false);
assert.equal(isSourceReadyForReview([null]),false);

const excessChecks=[{citations:[{document:'a.pdf',page:1,quote:'원문 인용'}],citationChecks:[matched,matched]}];
assert.equal(isSourceReadyForReview(excessChecks),false);
const noCitationDespiteCheck=[{citations:[],citationChecks:[matched]}];
assert.equal(isSourceReadyForReview(noCitationDespiteCheck),false);

assert.equal(isSourceReadyForReview([{citationChecks:[matched]}]),false);
assert.equal(isSourceReadyForReview([{citations:null,citationChecks:[matched]}]),false);

assert.equal(isSourceReadyForReview([{citations:[null],citationChecks:[matched]}]),false);
assert.equal(isSourceReadyForReview([{citations:[{document:'a.pdf',page:'1',quote:'원문 인용'}],citationChecks:[matched]}]),false);

assert.equal(isSourceReadyForReview([{citations:[{document:'a.pdf',page:1,quote:'짧은말'}],citationChecks:[matched]}]),false);

assert.equal(isSourceReadyForReview([{citations:[{document:'a.pdf',page:1,quote:'가          나'}],citationChecks:[matched]}]),false);

for(const invalid of [{},'not-an-array',42])assert.throws(()=>summarizeCitationChecks(invalid),/INVALID_CHECKED_FINDINGS/);
