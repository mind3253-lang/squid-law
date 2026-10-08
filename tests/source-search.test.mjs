import test from 'node:test';
import assert from 'node:assert/strict';
import {searchDocumentPages} from '../source-search.js';
const docs=[{name:'a.pdf',pages:[{text:'첫 줄\n둘째 줄 계약 해지 통보'},{text:'계약 내용 확인'}]},{name:'b.pdf',pages:[{text:'계약금 반환'}]}];
test('search matches Korean text across pages',()=>{const r=searchDocumentPages(docs,'계약');assert.equal(r.total,3);assert.equal(r.results.length,3)});
test('search snippet collapses whitespace',()=>{const r=searchDocumentPages(docs,'둘째');assert.equal(r.results[0].snippet.includes('\n'),false)});
test('search is case insensitive',()=>assert.equal(searchDocumentPages([{name:'a',pages:[{text:'ABC Document'}]}],'abc').total,1));
test('search caps results but preserves total',()=>{const r=searchDocumentPages(docs,'계약',{limit:1});assert.equal(r.total,3);assert.equal(r.results.length,1);assert.equal(r.truncated,true)});
test('short search is rejected',()=>assert.throws(()=>searchDocumentPages(docs,'가'),/INVALID_SEARCH_QUERY/));
test('oversized search is rejected',()=>assert.throws(()=>searchDocumentPages(docs,'가'.repeat(201)),/INVALID_SEARCH_QUERY/));
test('invalid search limit is rejected',()=>assert.throws(()=>searchDocumentPages(docs,'계약',{limit:101}),/INVALID_SEARCH_LIMIT/));
test('search preserves document and page navigation',()=>{const r=searchDocumentPages(docs,'반환');assert.equal(r.results[0].documentIndex,1);assert.equal(r.results[0].pageIndex,0)});

test('search matches phrases spanning a PDF line break',()=>assert.equal(searchDocumentPages(docs,'첫 줄 둘째 줄').total,1));
test('search normalizes compatibility Unicode',()=>assert.equal(searchDocumentPages([{name:'a',pages:[{text:'ＡＢＣ 서류'}]}],'ABC').total,1));

test('search paginates without repeating prior matches',()=>{
 const first=searchDocumentPages(docs,'계약',{limit:1,offset:0});
 const second=searchDocumentPages(docs,'계약',{limit:1,offset:1});
 const last=searchDocumentPages(docs,'계약',{limit:1,offset:2});
 assert.equal(first.results[0].pageIndex,0);
 assert.equal(second.results[0].pageIndex,1);
 assert.equal(last.results[0].documentIndex,1);
 assert.equal(first.hasNext,true);
 assert.equal(last.hasNext,false);
 assert.equal(last.hasPrevious,true);
});
test('invalid search offsets are rejected',()=>{
 assert.throws(()=>searchDocumentPages(docs,'계약',{offset:-1}),/INVALID_SEARCH_OFFSET/);
 assert.throws(()=>searchDocumentPages(docs,'계약',{offset:1.5}),/INVALID_SEARCH_OFFSET/);
});

test('out of range pagination suggests the final populated page',()=>{
 const r=searchDocumentPages(docs,'계약',{limit:1,offset:100});
 assert.equal(r.total,3);
 assert.equal(r.results.length,0);
 assert.equal(r.offsetOutOfRange,true);
 assert.equal(r.suggestedOffset,2);
});
test('empty search has no previous page even when offset was supplied',()=>{
 const r=searchDocumentPages(docs,'없는표현',{offset:100});
 assert.equal(r.total,0);
 assert.equal(r.hasPrevious,false);
 assert.equal(r.suggestedOffset,0);
});
