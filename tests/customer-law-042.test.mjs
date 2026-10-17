import test from 'node:test';
import assert from 'node:assert/strict';
import {CASE_DOSSIER_SECTIONS,dossierSectionPrompt,assembleCaseDossier} from '../lib/skynet-case-dossier.mjs';
const sections=CASE_DOSSIER_SECTIONS.map(s=>({id:s.id,text:'쟁점별 청구와 반박을 원문 증거에 연결해 검토합니다. '.repeat(6)}));
test('LAW-042 financial claim reconciliation prompt applies regardless of source page count',()=>{
 const prompt=dossierSectionPrompt(CASE_DOSSIER_SECTIONS[0],{question:'사건 분석',pageCount:1500,sourceExcerpts:'[실제 색인 PDF 원문] PDF 1500쪽',mainNotes:'',lateNotes:''});
 assert.match(prompt,/원금·기지급액·공제·상계·잔액·귀속자/);
 assert.doesNotMatch(prompt,/200~500쪽/);
});
test('LAW-042 blocks invalid source citations and internal blob paths',()=>{
 assert.throws(()=>assembleCaseDossier({sections:[{...sections[0],text:sections[0].text+' PDF 999쪽'},sections[1]],pageCount:20}),/INVALID_PAGE_CITATION/);
 assert.throws(()=>assembleCaseDossier({sections:[{...sections[0],text:sections[0].text+' squidlaw/analysis-jobs/private'},sections[1]],pageCount:20}),/INTERNAL_SOURCE_PATH_EXPOSED/);
});
