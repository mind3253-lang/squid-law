import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../analysis-input.js',import.meta.url),'utf8');
const {prepareAnalysisInput}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(src));
const docs=[{name:'원고.pdf',pages:[{text:'2026.10.07 계약기간 5년 주장'},{text:''}]},{name:'피고.pdf',pages:[{text:'계약기간 2년 주장'}]}];
const input=prepareAnalysisInput(docs);
assert.equal(input.schema,'squidlaw-analysis-input-v1');
assert.deepEqual(input.pages.map(p=>[p.document,p.page]),[['원고.pdf',1],['피고.pdf',1]]);
assert.equal(input.diagnostics.unreadablePages,1);
assert.equal(input.documents[0].pageCount,2);
assert.throws(()=>prepareAnalysisInput([]),/NO_DOCUMENTS/);
assert.throws(()=>prepareAnalysisInput([docs[0],docs[0]]),/DUPLICATE_DOCUMENT_NAME/);
assert.throws(()=>prepareAnalysisInput(docs,{maxPages:2}),/PAGE_LIMIT_EXCEEDED/);
assert.throws(()=>prepareAnalysisInput(docs,{maxChars:10}),/TEXT_LIMIT_EXCEEDED/);
assert.throws(()=>prepareAnalysisInput([{name:'scan.pdf',pages:[{text:''}]}]),/NO_READABLE_TEXT/);
assert.throws(()=>prepareAnalysisInput([{name:'bad.pdf',pages:[{}]}]),/INVALID_PAGE_TEXT/);
console.log('PASS: bounded source-addressable analysis input, page references, duplicates, unreadable pages and limits');

assert.throws(()=>prepareAnalysisInput([{name:'empty.pdf',pages:[]}]),/EMPTY_DOCUMENT_PAGES/);
