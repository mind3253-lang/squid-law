import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../admin/skynet.html',import.meta.url),'utf8');
const job=readFileSync(new URL('../api/skynet-document-job.js',import.meta.url),'utf8');
const warehouse=readFileSync(new URL('../api/skynet-warehouse.js',import.meta.url),'utf8');
const style=readFileSync(new URL('../admin/skynet-layout.css',import.meta.url),'utf8');

test('an explicit 258-page source cannot silently use the last active 146-page PDF',()=>{
 const first=html.indexOf('function expectedPdfPageCount(');
 const last=html.indexOf('function previousAttachedReview(',first);
 assert.ok(first>0&&last>first);
 const previous=[{role:'user',content:'분석해\n[이번 대화에 직접 첨부: 법원기록_1.pdf / 문서 식별번호 '+
  'a'.repeat(64)+' / 146쪽]'},
  {role:'user',content:'분석해\n[이번 대화에 직접 첨부: 법원기록_전체.pdf / 문서 식별번호 '+
   'b'.repeat(64)+' / 258쪽]'}];
 const f=new Function('history',html.slice(first,last)+
  'return {parse:expectedPdfPageCount,candidates:indexedSourceCandidates};')(previous);
 assert.equal(f.parse('258페이지인데 왜 뒤쪽 공방이 없지?'),258);
 assert.equal(f.parse('총 258쪽 기록 다시 검토'),258);
 assert.equal(f.parse('이어서 분석해'),null);
 assert.deepEqual(f.candidates().map(x=>x.pages),[146,258]);
 assert.match(html,/uploadedDocs=\[matches\[0\]\]/);
 assert.match(html,/146쪽을 258쪽으로 간주하지 않았어/);
 assert.match(html,/선택한 PDF '\+doc.pages\+'쪽과 실제 색인 '\+pageCount/);
});

test('percentage never exceeds confirmed checkpoint progress and advances by integer 1% increments',()=>{
 const begin=html.indexOf('let displayedReviewPercent=0,reviewPercentTimer');
 const end=html.indexOf('function renderReviewState(',begin);
 assert.ok(begin>=0&&end>begin);
 const dom={skynetReviewProgress:{value:0},skynetReviewPercent:{textContent:'0%'}};
 const intervals=[];
 const f=new Function('el','setInterval','clearInterval',
  html.slice(begin,end)+
  'return {target:reviewPercentTarget,animate:animateVerifiedReviewProgress,read:()=>displayedReviewPercent};')(
   name=>dom[name],fn=>{intervals.push(fn);return intervals.length},()=>{}
  );
 assert.equal(f.target(2,8),25);
 assert.equal(f.target(1,8),12);
 assert.equal(f.target(0,8),0);
 f.animate({key:'source-one',target:25,finished:false});
 assert.equal(f.read(),0);
 const step=intervals[0];
 for(let i=1;i<=25;i++){step();assert.equal(f.read(),i);assert.equal(dom.skynetReviewProgress.value,i)}
 assert.equal(dom.skynetReviewPercent.textContent,'25%');
 f.animate({key:'source-one',target:50,finished:false});
 assert.equal(f.read(),25);
 assert.match(html,/let displayedReviewPercent=0/);
 assert.match(html,/lastCheckpointAt:data.lastCheckpointAt/);
 assert.match(job,/lastCheckpointAt:lastCheckpointAt\?new Date\(lastCheckpointAt\)/);
 assert.match(style,/skynet-review-pulse/);
});

test('report not yet complete must not masquerade as verified source pages',()=>{
 assert.match(html,/원문 분석 '\+done\+'\/'\+total\+'구간 확인 완료/);
 assert.match(html,/완료한 구간만 실제 %에 반영/);
 assert.match(html,/documentKey=String\(activeReview.documentHash/);
 assert.match(html,/if\(kind==='pdf'&&Number.isSafeInteger\(doc.pages\)&&doc.pages!==pageCount\)/);
});

test('indexed source picker selects immutable stored PDF records without re-extracting',()=>{
 assert.match(html,/id="skynetReviewChooseSource"/);
 assert.match(html,/mode=indexed-pdfs/);
 assert.match(html,/pendingRestoredDocs=\[\{name:selected.name,hash:selected.hash,pages:selected.pageCount\}\]/);
 assert.match(html,/!pendingRestoredDocs.length&&isResumeReviewRequest\(msg\)/);
 assert.match(warehouse,/if\(req.query\?\.mode==='indexed-pdfs'\)/);
 assert.match(warehouse,/Number\.isSafeInteger\(row\.pageCount\)/);
 assert.match(warehouse,/x.pathname==='skynet\/documents\/'\+row.hash\+'\.json'/);
 assert.doesNotMatch(warehouse,/indexed-pdfs[^]{0,1000}indexArchivedPdfInWindows/);
});
