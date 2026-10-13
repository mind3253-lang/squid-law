import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CASE_DOSSIER_VERSION,CASE_DOSSIER_SECTIONS,
 dossierSectionPrompt,assembleCaseDossier} from '../lib/skynet-case-dossier.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('full-record report has four independently grounded evidence chapters',()=>{
 assert.equal(typeof CASE_DOSSIER_VERSION,'string');
 assert.equal(CASE_DOSSIER_SECTIONS.length,4);
 assert.deepEqual(CASE_DOSSIER_SECTIONS.map(s=>s.id),
  ['claim-map','chronology-rebuttals','money-and-offsets','evidence-and-issues']);
 for(const chapter of CASE_DOSSIER_SECTIONS){
  const prompt=dossierSectionPrompt(chapter,{question:'원문 전체 검토',pageCount:258,
   mainNotes:'원고 주장: [PDF 245쪽]',lateNotes:'최근 피고 반박 [PDF 257쪽]'});
  assert.match(prompt,/245쪽/);
  assert.match(prompt,/257쪽/);
  assert.match(prompt,/서버 내부 Blob 경로/);
  assert.match(prompt,/마크다운 파이프 표/);
 }
 const sections=CASE_DOSSIER_SECTIONS.map(x=>({
  id:x.id,text:'| 쟁점 | 주장 | 반박 |\n|---|---|---|\n| 차임 | 주장의 위치 [PDF 245쪽] | 반박 [PDF 257쪽] |'
 }));
 const result=assembleCaseDossier({sections,pageCount:258,sourceName:'258p.pdf',ocrRequired:[9]});
 assert.match(result,/258쪽/);
 assert.match(result,/시각 확인이 필요한 쪽: 9쪽/);
 for(const chapter of CASE_DOSSIER_SECTIONS)assert.ok(result.includes(chapter.title));
 assert.ok(result.indexOf('245쪽')<result.lastIndexOf('257쪽'));
 assert.throws(()=>assembleCaseDossier({sections:sections.slice(0,3),pageCount:258}),/INCOMPLETE/);
});

test('SKYNET does not append internal server paths to customer-visible answers',()=>{
 const source=read('admin/skynet.html');
 assert.doesNotMatch(source,/const note='\[서버 자동검색:/);
 assert.match(source,/function hideSkynetServerSearchFooter\(/);
 const from=source.indexOf('function hideSkynetServerSearchFooter(');
 const to=source.indexOf('try{localStorage.removeItem(chatKey)}catch{}',from);
 assert.ok(from>=0&&to>from);
 const fn=new Function(source.slice(from,to)+'return hideSkynetServerSearchFooter;')();
 const old='[PDF 257쪽] 피고의 주장과 상계 문제\n\n[서버 자동검색: 과거 원본·문서 12건 / 대화기록 4건 · 관련 출처: skynet/document-segments/abc/batch-00000100.json (9)]';
 assert.equal(fn(old),'[PDF 257쪽] 피고의 주장과 상계 문제');
 assert.equal(fn('[PDF 257쪽] 정확한 출처'),'[PDF 257쪽] 정확한 출처');
});

test('large PDF review routes through chapter persistence not the one-call fast summary',()=>{
 const source=read('admin/skynet.html');
 assert.match(source,/compileSkynetCaseDossier\(/);
 assert.match(source,/contract\.CASE_DOSSIER_SECTIONS/);
 assert.match(source,/contract\.assembleCaseDossier/);
 assert.match(source,/documentReviewCheckpoint\(doc,qhash,hashes\[i\],i\+1/);
 assert.match(source,/questionHash,report:reply/);
 assert.match(source,/last|최근|최신/);
 assert.match(source,/for\(let d=0;d<docs\.length;d\+\+\)/);
 assert.match(source,/pageCounts\.push\(pageCount\)/);
 assert.match(source,/const reply=docs\.length===1&&\/\\\.pdf\$\/i\.test/);
 assert.match(source,/한두\\s\*줄|한두/);
 const script=[...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
 for(const m of script){if(m[0].includes('src='))continue;assert.doesNotThrow(()=>new Function(m[1]));}
});
