import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CASE_DOSSIER_SECTIONS,dossierSectionPrompt,assembleCaseDossier,
 directIndexedPdfExcerpt,reportRequestsAlreadyIndexedPdf,
 reportHasInvalidPageCitations} from '../lib/skynet-case-dossier.mjs';
const html=readFileSync(new URL('../admin/skynet.html',import.meta.url),'utf8');

test('a 146-page PDF actually routes to evidence dossier, never the notes-only fallback',()=>{
 const begin=html.indexOf('const reply=docs.length===1&&');
 const end=html.indexOf('?\n',begin);
 assert.ok(begin>=0&&end>begin);
 const expression=html.slice(begin,end).replace('const reply=','');
 const route=new Function('docs','return '+expression+';');
 assert.equal(route([{name:'수원지방법원_2026가단12498.pdf'}]),true);
 assert.equal(route([{name:'legal-notes.txt'}]),false);
 assert.equal(route([]),false);
 assert.match(html,/sourceWindows:originalSourceWindows\[0\]/);
 assert.match(html,/sourceWindows:span\.chunks/);
 assert.match(html,/skynet-pdf-review-v5-dossier-with-original-text/);
});

test('every dossier chapter sees actual original PDF page text, including late pleadings',()=>{
 const windows=Array.from({length:8},(_,i)=>({
  pages:Array.from({length:i===7?20:18},(_,n)=>i*18+n+1).filter(n=>n<=146),
  text:'[PDF '+(i*18+1)+'쪽] '+(i>=6?
   '2026.10.12. 준비서면 상대방 반박 상계 대여금 보증금':
   '원고 피고 임대차계약 차임 청구서 답변서 채권 귀속')+
   '\n'+('제출된 원문 계약조항과 입금 내역 검증. ').repeat(45)
 }));
 assert.equal(windows[7].pages.includes(146),true);
 for(const section of CASE_DOSSIER_SECTIONS){
  const excerpts=directIndexedPdfExcerpt(windows,section);
  assert.match(excerpts,/실제 색인 PDF 원문/);
  assert.match(excerpts,/PDF 145,146쪽|PDF 127,128,129/);
  const prompt=dossierSectionPrompt(section,{question:'2026가단12498 최신 공방을 검토해',
   mainNotes:'원고 상계 주장 [PDF 88쪽]',lateNotes:'피고 재반박 [PDF 145쪽]',
   pageCount:146,sourceExcerpts:excerpts});
  assert.match(prompt,/서버의 원문 전체 검토 기록/);
  assert.match(prompt,/실제 색인 PDF 원문 발췌/);
  assert.match(prompt,/2026\.10\.12/);
 }
});
test('the exact failed answer is rejected, with no fabricated 258-page citations',()=>{
 const rejected='이번 메시지에 들어 있는 건 PDF 추출 원문이 아니라 중간 분석 노트야. '+
  'PDF 81~146쪽의 실제 추출 텍스트를 쪽 구분과 함께 보내줘.';
 assert.equal(reportRequestsAlreadyIndexedPdf(rejected),true);
 assert.equal(reportHasInvalidPageCitations('[PDF 145쪽] 마지막 반박',146),false);
 assert.equal(reportHasInvalidPageCitations('[PDF 258쪽] 미확인 재반박',146),true);
 const chapters=CASE_DOSSIER_SECTIONS.map(section=>({
  id:section.id,
  text:'| 쟁점 | 원고 | 피고 | PDF 근거 |\n|---|---|---|---|\n'+
   '| 상계 | 확인 필요 | 확인 필요 | [PDF 145쪽] |\n'+
   '최근 준비서면과 원문 증거의 관계를 원고와 피고의 관점에서 나누어 검토했다.'
 }));
 const report=assembleCaseDossier({sections:chapters,pageCount:146,sourceName:'2026가단12498.pdf'});
 assert.equal(report.includes('146쪽'),true);
 assert.equal(report.includes('258쪽'),false);
 assert.equal(reportRequestsAlreadyIndexedPdf(report),false);
});
