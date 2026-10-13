import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('PDF and user prompt are linked in the same send, not replaced with past memory',()=>{
 const chat=read('admin/skynet.html');
 assert.match(chat,/uploadedDocs=outcomes\.filter/);
 assert.match(chat,/outcome\.hash=info\.hash/);
 assert.match(chat,/analyzeAttachedDocuments\(uploadedDocs,msg,previous,effort,saveAnswer,turnId\)/);
 assert.match(chat,/첨부 파일 연결 실패/);
 assert.match(chat,/원문을 읽지 못했으므로 과거 기록으로 대신 답하지 않았어/);
});

test('attached document review reads all segments and refuses to claim unverified completion',()=>{
 const chat=read('admin/skynet.html');
 const api=read('api/skynet-document-context.js');
 assert.match(chat,/for\(let tries=0;tries<250;tries\+\+\)/);
 assert.match(chat,/if\(data\.done\)break/);
 assert.match(chat,/if\(!advanced\)throw Error/);
 assert.match(chat,/Promise\.allSettled\(group\.map/);
 assert.match(chat,/ocrRequired\.length/);
 assert.match(api,/DOCUMENT_SEGMENT_MISSING_AT_/);
 assert.match(api,/document-segments\//);
 assert.match(api,/offset:i,position:pos,done,pageCount/);
 assert.match(api,/textCoverageComplete:done/);
});

test('direct document chunks avoid unrelated long-term memory retrieval',()=>{
 const prompt=read('admin/skynet.html'),server=read('api/skynet-chat.js');
 assert.match(prompt,/skipMemorySearch:options\.skipMemorySearch===true/);
 assert.match(prompt,/skipMemorySearch:true,suppressSearchNote:true/);
 assert.match(server,/if\(input\.skipMemorySearch!==true\)try/);
 assert.match(server,/첨부 문서 분석 전용: 과거 기억 자동검색을 생략함/);
});

test('direct PDF endpoint is authenticated and has registered route',()=>{
 const endpoint=read('api/skynet-document-context.js');
 const config=JSON.parse(read('vercel.json'));
 assert.match(endpoint,/if\(!authorized\(req\)\)/);
 assert.match(endpoint,/\^\[a-f0-9\]\{64\}\$/);
 assert.ok(config.rewrites.some(x=>x.source==='/admin/skynet-document-context'&&x.destination==='/api/skynet-document-context'));
});
