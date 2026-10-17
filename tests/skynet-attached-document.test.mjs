import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('PDF and user prompt are linked in the same send, not replaced with past memory',()=>{
 const chat=read('admin/skynet.html');
 assert.match(chat,/uploadedDocs=outcomes\.filter/);
 assert.match(chat,/outcome\.hash=info\.hash/);
 assert.match(chat,/analyzeAttachedDocuments\(uploadedDocs,reviewQuestion,previous,effort,saveAnswer,turnId\)/);
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

test('resumable PDF review uses durable keyed checkpoints and no file reupload',()=>{
 const chat=read('admin/skynet.html');
 const endpoint=read('api/skynet-document-review.js');
 const config=JSON.parse(read('vercel.json'));
 assert.match(chat,/function previousAttachedReview\(\)/);
 assert.match(chat,/if\(!archiveFiles\.length&&!attached\.length&&isResumeReviewRequest\(msg\)\)/);
 assert.match(chat,/uploadedDocs=resume\.docs;reviewQuestion=resume\.question/);
 assert.match(chat,/function isResumeReviewRequest\(message\)/);
 assert.match(chat,/documentReviewCheckpoint\(doc,questionHash,hash,chunk\.index\)/);
 assert.match(chat,/const saved=await documentReviewCheckpoint\(doc,questionHash,hash,chunk\.index,summary,chunk\.pages\)/);
 assert.match(chat,/resumed\+\+/);
 assert.match(chat,/Promise\.allSettled\(group\.map/);
 assert.match(chat,/if\(errors\.length\)/);
 assert.match(chat,/failure\?\.retryable&&failure\.status!==429/);
 assert.match(chat,/await waitReview\(attempt\*1800\)/);
 assert.match(endpoint,/AI_DRAFT_NOT_INDEPENDENTLY_VERIFIED/);
 assert.match(endpoint,/allowOverwrite:false/);
 assert.match(endpoint,/SOURCE_DOCUMENT_NOT_FOUND/);
 assert.ok(config.rewrites.some(x=>x.source==='/admin/skynet-document-review'&&x.destination==='/api/skynet-document-review'));
});

test('temporary OpenAI errors are retryable but bad model input is not',()=>{
 const api=read('api/skynet-chat.js');
 const chat=read('admin/skynet.html');
 assert.match(api,/const retryable=!quotaExhausted&&\(upstream\.status===429\|\|upstream\.status>=500\)/);
 assert.match(api,/upstream\.status===400\|\|upstream\.status===422\?422/);
 assert.match(api,/SKYNET_OPENAI_UPSTREAM_ERROR/);
 assert.match(chat,/error\.retryable=!error\.quotaExhausted&&/);
 assert.match(chat,/result\?\.retryable===true/);
});
