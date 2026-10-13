import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {searchTerms} from '../lib/skynet-search-db.mjs';
const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('search index understands Korean legal case terms with endings',()=>{
 const tokens=searchTerms('임대차보증금은 차임을 제외하고 관리비를 정산한다.');
 assert.ok(tokens.includes('차임'));
 assert.ok(tokens.includes('관리비'));
 assert.ok(tokens.includes('임대차보증금'));
});
test('ordinary memory retrieval attempts private GIN lookup before whole-archive scanning',()=>{
 const code=source('api/skynet-search-index.js');
 const q=code.indexOf("const sql=await querySearchExcerpts(question");
 const scan=code.indexOf("const files=await listIndex();",q);
 assert.ok(q>=0&&scan>q);
 assert.match(code,/independent>=4\)return ranked/);
 assert.match(code,/\.{3}sqlMatches,\.{3}found\.values\(\)/);
 const db=source('lib/skynet-search-db.mjs');
 assert.match(db,/USING gin\(terms\)/);
 assert.match(db,/WHERE terms && \$1::text\[\]/);
 assert.match(db,/ON CONFLICT\(id\) DO UPDATE/);
});
test('PDF indexed source retrieval is one batch request not one HTTP request per 30k characters',()=>{
 const client=source('admin/skynet.html'),server=source('api/skynet-document-fulltext.js');
 assert.match(client,/analyzeWholeIndexedPdf\(docs\[0\]/);
 assert.match(client,/if\(await analyzeWholeIndexedPdf/);
 assert.match(client,/PDF 원문 전체 텍스트 통합 분석/);
 assert.match(client,/documentReviewCheckpoint\(doc,questionHash,digest,1,reply,data.pageNumbers\|\|\[\]\)/);
 assert.match(server,/Promise\.all\(starts\.slice\(groupStart,groupStart\+4\)/);
 assert.match(server,/SOURCE_SEGMENT_COVERAGE_INCOMPLETE/);
 assert.match(server,/visualVerified:false/);
});
test('memory and document uploads ACK storage before search index operations complete',()=>{
 const memory=source('api/skynet-memory.js');
 const pdf=source('api/skynet-document.js');
 assert.match(memory,/waitUntil\(indexSource\(pathname,saved\)/);
 assert.match(pdf,/waitUntil\(indexingWork\)/);
 assert.match(pdf,/indexing:'background_pending'/);
});
test('background historical migration is leased and resumable',()=>{
 const state=source('lib/skynet-search-db.mjs'),backfill=source('api/skynet-search-backfill.js');
 assert.match(state,/lease_until/);
 assert.match(state,/processed=processed\+\$3/);
 assert.match(backfill,/claimSearchBackfill\(owner\)/);
 assert.match(backfill,/advanceSearchBackfill\(owner/);
 assert.match(backfill,/indexSearchExcerpts\(index\.source,index\.entries,\{complete:false\}\)/);
 assert.ok(JSON.parse(source('vercel.json')).crons.some(x=>x.path==='/api/skynet-search-backfill'));
});
