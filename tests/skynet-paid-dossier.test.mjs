import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CASE_DOSSIER_VERSION,CASE_DOSSIER_SECTIONS,
 dossierSectionPrompt,assembleCaseDossier,dossierClientPerspective,directIndexedPdfExcerpt,reportRequestsAlreadyIndexedPdf} from '../lib/skynet-case-dossier.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('full-record report has two concise customer-oriented evidence chapters',()=>{
 assert.equal(typeof CASE_DOSSIER_VERSION,'string');
 assert.equal(CASE_DOSSIER_SECTIONS.length,2);
 assert.deepEqual(CASE_DOSSIER_SECTIONS.map(s=>s.id),
  ['claim-map','contradictions']);
 for(const chapter of CASE_DOSSIER_SECTIONS){
  const sourceExcerpts=directIndexedPdfExcerpt([
   {pages:[1],text:'[PDF 1쪽] 2026가단12498 준비서면 최초 주장'},
   {pages:[245],text:'[PDF 245쪽] 보증금 상계에 대한 원고 주장'},
   {pages:[257],text:'[PDF 257쪽] 2026.10.12 최신 준비서면 재반박'}
  ],chapter);
  const prompt=dossierSectionPrompt(chapter,{question:'원문 전체 검토',pageCount:258,
   mainNotes:'원고 주장: [PDF 245쪽]',lateNotes:'최근 피고 반박 [PDF 257쪽]',sourceExcerpts});
  assert.match(prompt,/\[실제 색인 PDF 원문/);
  assert.match(prompt,/보증금 상계/);
  assert.match(prompt,/245쪽/);
  assert.match(prompt,/257쪽/);
  assert.match(prompt,/서버 내부 Blob 경로/);
  if(chapter.id==='claim-map')assert.match(prompt,/마크다운 파이프 표/);
  else assert.match(prompt,/원고.*피고.*모순/s);
 }
 const sections=CASE_DOSSIER_SECTIONS.map(x=>({
  id:x.id,text:'| 쟁점 | 주장 | 반박 |\n|---|---|---|\n| 차임 | 주장의 위치 [PDF 245쪽] | 반박 [PDF 257쪽] |\n이 장에서 관련 쟁점을 구체적으로 검토하고 다른 사건의 상계를 구분해 재검증해야 한다.'
 }));
 const result=assembleCaseDossier({sections,pageCount:258,sourceName:'258p.pdf',ocrRequired:[9]});
 assert.match(result,/258쪽/);
 assert.equal(dossierClientPerspective('피고 입장에서 사건 분석해줘'),'피고');
 assert.equal(dossierClientPerspective('원고 입장에서 사건 분석해줘'),'원고');
 assert.equal(dossierClientPerspective('사건 전체를 분석해줘'),'중립');
 assert.match(dossierSectionPrompt(CASE_DOSSIER_SECTIONS[0],{question:'피고 입장에서 분석해줘',pageCount:258,mainNotes:'근거',lateNotes:'반박',sourceExcerpts:'[실제 색인 PDF 원문]'}),/의뢰인은 피고입니다/);
 assert.match(result,/제1장\. 쟁점 도표 정리/);
 assert.match(result,/제2장\. 분석/);
 assert.match(result,/제3장\. 결과/);
 assert.match(result,/청구취지/);
 assert.match(result,/채팅방에서 어떠한 법률 상담도 하지 않습니다/);
 assert.doesNotMatch(result,/날짜순 사실관계와 최신 서면 공방/);
 assert.match(result,/별도 확인할 원본:\*\* PDF 9쪽/);
 for(const chapter of CASE_DOSSIER_SECTIONS)assert.ok(result.includes(chapter.title));
 assert.ok(result.indexOf('245쪽')<result.lastIndexOf('257쪽'));
 assert.throws(()=>assembleCaseDossier({sections:sections.slice(0,1),pageCount:258}),/INCOMPLETE/);
});

test('SKYNET does not append internal server paths to customer-visible answers',()=>{
 const source=read('admin/skynet.html');
 assert.doesNotMatch(source,/const note='\[서버 자동검색:/);
 assert.match(source,/function hideSkynetServerSearchFooter\(/);
 const from=source.indexOf('function hideSkynetServerSearchFooter(');
 const to=source.indexOf('function drawChat(){',from);
 assert.ok(from>=0&&to>from);
 const fn=new Function(source.slice(from,to)+'return hideSkynetServerSearchFooter;')();
 const old='[PDF 257쪽] 피고의 주장과 상계 문제\n\n[서버 자동검색: 과거 원본·문서 12건 / 대화기록 4건 · 관련 출처: skynet/document-segments/abc/batch-00000100.json (9)]';
 assert.equal(fn(old),'[PDF 257쪽] 피고의 주장과 상계 문제');
 assert.equal(fn('[PDF 257쪽] 정확한 출처'),'[PDF 257쪽] 정확한 출처');
});

test('large PDF review routes through chapter persistence not the one-call fast summary',()=>{
 const source=read('admin/skynet.html');
 assert.match(source,/async function compileSkynetCaseDossier\(/);
 assert.match(source,/compileSkynetCaseDossier\(/);
 assert.match(source,/contract\.CASE_DOSSIER_SECTIONS/);
 assert.match(source,/contract\.assembleCaseDossier/);
 assert.match(source,/documentReviewCheckpoint\(doc,fingerprint,digests\[i\],i\+1/);
 assert.match(source,/questionHash,report:reply/);
 assert.match(source,/last|최근|최신/);
 assert.match(source,/for\(let d=0;d<docs\.length;d\+\+\)/);
 assert.match(source,/pageCounts\.push\(pageCount\)/);
 assert.match(source,/const reply=docs\.length===1/);
 assert.ok(source.includes('/\\.pdf$/i.test(String(docs[0].name||\'\'))'),
  'real .pdf filename must enter deep dossier instead of notes-only fallback');
 assert.equal(reportRequestsAlreadyIndexedPdf('이번 메시지는 중간 분석 노트야. 실제 추출 텍스트를 보내줘'),true);
 assert.equal(reportRequestsAlreadyIndexedPdf('[PDF 140쪽] 상계 합의 증거는 미제출됐다'),false);
 assert.match(source,/한두|간단히/);
 const script=[...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
 for(const m of script){if(m[0].includes('src='))continue;assert.doesNotThrow(()=>new Function(m[1]));}
});
