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
 assert.match(html,/requestedPages&&requestedPages!==pageCount/);
 assert.match(html,/「분석할 PDF 선택」에서 맞는 파일을 선택해/);
 assert.match(html,/expectedPdfPageCount\(question\)!==pageCount/);
 assert.match(html,/146쪽을 258쪽으로 간주하지 않았어/);
 assert.match(html,/선택한 PDF '\+doc.pages\+'쪽과 실제 색인 '\+pageCount/);
});

test('one bar covers upload through final report, advances by verified 1% steps and disappears',()=>{
 const begin=html.indexOf('let displayedReviewPercent=0,reviewPercentTimer');
 const end=html.indexOf('function renderReviewState(',begin);
 assert.ok(begin>=0&&end>begin);
 const dom={skynetReviewProgress:{value:0},skynetReviewPercent:{textContent:'0%'},
  skynetReviewPanel:{hidden:false}};
 const intervals=[];
 const f=new Function('el','setInterval','clearInterval',
  html.slice(begin,end)+
  'return {target:verifiedPipelinePercent,animate:animateVerifiedReviewProgress,'+
  'read:()=>displayedReviewPercent,clear:clearSkynetPipelineProgress};')(
   name=>dom[name],fn=>{intervals.push(fn);return intervals.length},()=>{}
  );
 assert.equal(f.target('upload',1,2),2);
 assert.equal(f.target('index',1,2),12);
 assert.equal(f.target('review',2,8),37);
 assert.equal(f.target('review',8,8),90);
 assert.equal(f.target('report',4,4),99);
 assert.equal(f.target('delivery',1,1),99);
 f.animate({key:'146page-case',target:37});
 assert.equal(f.read(),0);
 const tick=intervals[0];
 for(let n=1;n<=37;n++){tick();assert.equal(f.read(),n);assert.equal(dom.skynetReviewProgress.value,n)}
 f.animate({key:'146page-case',target:90});
 assert.equal(f.read(),37);
 f.clear();
 assert.equal(dom.skynetReviewPanel.hidden,true);
 assert.match(html,/setSkynetPipelineProgress\('upload'/);
 assert.match(html,/setSkynetPipelineProgress\('index'/);
 assert.match(html,/setSkynetPipelineProgress\('review'/);
 assert.match(html,/setSkynetPipelineProgress\('report'/);
 assert.match(html,/setSkynetPipelineProgress\('delivery'/);
 assert.doesNotMatch(html,/id="skynetReviewRefresh"/);
 assert.match(html,/lastCheckpointAt:data.lastCheckpointAt/);
 assert.match(job,/lastCheckpointAt:lastCheckpointAt\?new Date\(lastCheckpointAt\)/);
 assert.match(style,/skynet-review-pulse/);
});
test('completed report hides its progress and never exposes internal chunk counts',()=>{
 const section=html.slice(html.indexOf('function renderReviewState('),
  html.indexOf('async function reviewJobRequest(',html.indexOf('function renderReviewState(')));
 assert.match(section,/panel\.hidden=true;return/);
 assert.doesNotMatch(section,/원문 분석 '\+done\+'\/'\+total\+'구간/);
 assert.doesNotMatch(section,/텍스트 구간 검토 및 종합 보고서 저장 완료/);
 assert.match(html,/if\(skynetPipeline\?\.active\)clearSkynetPipelineProgress\(\)/);
 assert.match(html,/if\(kind==='pdf'&&Number\.isSafeInteger\(doc\.pages\)&&doc\.pages!==pageCount\)/);
});
test('indexed source picker selects immutable stored PDF records without re-extracting',()=>{
 assert.match(html,/id="skynetReviewChooseSource"/);
 assert.match(html,/mode=indexed-pdfs/);
 assert.match(html,/pendingRestoredDocs=\[\{name:selected.name,hash:selected.hash,pages:selected.pageCount\}\]/);
 assert.match(html,/!pendingRestoredDocs.length&&!uploadedDocs.length&&isResumeReviewRequest\(msg\)/);
 assert.match(warehouse,/if\(req.query\?\.mode==='indexed-pdfs'\)/);
 assert.match(warehouse,/Number\.isSafeInteger\(row\.pageCount\)/);
 assert.match(warehouse,/x.pathname==='skynet\/documents\/'\+row.hash\+'\.json'/);
 assert.doesNotMatch(warehouse,/indexed-pdfs[^]{0,1000}indexArchivedPdfInWindows/);
});
