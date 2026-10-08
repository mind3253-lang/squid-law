import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const html=await readFile(new URL('../customer.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(new RegExp('<script\\b([^>]*)>([\\s\\S]*?)<\\/script>','gi'))];
const moduleScript=scripts.find(m=>/type="module"/.test(m[1])&&m[2].includes('buildVerifiedComparisonReport'));
assert.ok(moduleScript,'customer browser module script must exist');
const parsed=spawnSync(process.execPath,['--input-type=module','--check'],{input:moduleScript[2],encoding:'utf8'});
assert.equal(parsed.status,0,parsed.stderr);
for(const id of ['comparison-preview','compare-documents','copy-comparison','save-comparison','comparison-status','comparison-results']){
 assert.ok(html.includes('id="'+id+'"'),'Missing UI element: '+id);
}
assert.match(moduleScript[2],/comparisonResults\.addEventListener\('click'/);
assert.match(moduleScript[2],/buildVerifiedComparisonReport\(documents/);
assert.match(moduleScript[2],/comparisonText='';comparisonResults\.replaceChildren\(\)/);
for(const id of ['run-operator-ai','copy-ai-report','save-ai-report','ai-integrated-report']){
 assert.ok(html.includes('id="'+id+'"'),'Missing AI report UI element: '+id);
}
assert.match(moduleScript[2],/aiReportText=payload\.text/);
assert.match(moduleScript[2],/navigator\.clipboard\.writeText\(aiReportText\)/);
assert.match(moduleScript[2],/link\.download='SQUIDLAW_AI_통합보고서\.txt'/);
assert.match(moduleScript[2],/aiReportText='';copyAiReport\.disabled=true;saveAiReport\.disabled=true/);
assert.match(html,/전송 160KB/);
assert.match(moduleScript[2],/AI 입력 확인: PDF/);
assert.match(moduleScript[2],/서버가 JSON 응답을 반환하지 않았습니다/);
assert.match(moduleScript[2],/서면 비교 '\+comparisonCount/);
assert.match(html,/AI 통합 분석 실행/);
assert.match(html,/\/api\/analyze/);
assert.match(html,/원문 기반/);
const {ANALYSIS_SYSTEM_PROMPT}=await import('../analysis-model-prompt.js');
const {COMPARISON_SYSTEM_PROMPT}=await import('../analysis-comparison-prompt.js');
const {formatCaseReportText}=await import('../analysis-case-report-text.js');
for(const term of ['소송 절차','증거번호','계약의 성립','자료 범위'])assert.ok(ANALYSIS_SYSTEM_PROMPT.includes(term),'Missing analysis instruction: '+term);
for(const term of ['조건문','계산 기준','작성자'])assert.ok(COMPARISON_SYSTEM_PROMPT.includes(term),'Missing comparison instruction: '+term);
const report=formatCaseReportText({schema:'squidlaw-case-analysis-v1',status:'source_checked_partial',
 findings:[{title:'원고 주장',citations:[{document:'계약서.pdf',page:1,quote:'계약기간은 5년입니다'}],citationChecks:[{verification:{status:'matched'}}]}],
 comparisons:[{reference:'갑 제1호증',relation:'conflict_candidate',explanation:'서로 다른 기간',citations:[]}],
 diagnostics:{unreadableDetails:[{document:'계약서.pdf',page:2,totalPages:2}],missingBatches:[3],comparisonSourceReady:false,analysisSourceReady:true},notices:[]});
for(const term of ['일부 페이지 미식별','원문 일치가 확인된 인용 문서: 1개','충돌 가능성 검토: 1건','결과가 누락된 분석 묶음: 3','읽지 못한 페이지'])assert.ok(report.includes(term),'Missing report detail: '+term);
for(const term of ['서로 다른 원문 페이지','출처 인용 총수','원문 일치 인용','원문 확인 필요 인용','인용 확인이 필요한 분석 항목','출처 확인이 필요한 비교 후보'])assert.ok(report.includes(term),'Missing audit field: '+term);
for(const term of ['계약서 원문','공탁','인도일','관리비','일부만 부인'])assert.ok(COMPARISON_SYSTEM_PROMPT.includes(term),'Missing comparison safeguard: '+term);
const {validateFindingsPayload}=await import('../findings-schema.js');
const enriched=validateFindingsPayload({schema:'squidlaw-findings-v1',findings:[{title:'계약기간',analysis:'원고가 계약기간 5년을 주장하지만 별도 자료 검토가 필요합니다.',citations:[{document:'계약서.pdf',page:1,quote:'계약기간은 5년입니다'}]}]});
assert.match(enriched.findings[0].analysis,/계약기간 5년/);
assert.throws(()=>validateFindingsPayload({schema:'squidlaw-findings-v1',findings:[{title:'계약기간',analysis:'x'.repeat(1801),citations:[]}]}),/INVALID_FINDING_ANALYSIS/);
assert.match(formatCaseReportText({schema:'squidlaw-case-analysis-v1',status:'source_checked',findings:[{title:'계약기간',analysis:'원문에 기초한 검토 설명',citations:[]}],comparisons:[],diagnostics:{},notices:[]}),/쟁점 검토: 원문에 기초한 검토 설명/);
for(const term of ['입증책임','반박의 가능성','불리한 내용','청구취지 변경','증거번호'])assert.ok(ANALYSIS_SYSTEM_PROMPT.includes(term),'Missing reasoning safeguard: '+term);
assert.match(report,/쟁점별 설명 누락: 1건/);
assert.match(formatCaseReportText({schema:'squidlaw-case-analysis-v1',status:'needs_source_review',findings:[{title:'검토',citations:[{document:'가.pdf',page:1,quote:'원문 문장입니다.'},{document:'나.pdf',page:2,quote:'상대방 주장입니다.'}]}],comparisons:[],diagnostics:{},notices:[]}),/복수 출처: 2건/);
const structured=validateFindingsPayload({schema:'squidlaw-findings-v1',findings:[{title:'계약기간',claim:'원고 5년 주장',evidence:'계약서 5년 문구',rebuttal:'피고 2년 주장',proofGap:'변경합의 확인 필요',citations:[]}]});
assert.equal(structured.findings[0].proofGap,'변경합의 확인 필요');
assert.throws(()=>validateFindingsPayload({schema:'squidlaw-findings-v1',findings:[{title:'초과',claim:'x'.repeat(901),citations:[]}]}),/INVALID_FINDING_SECTION/);
const structuredText=formatCaseReportText({schema:'squidlaw-case-analysis-v1',status:'needs_source_review',findings:structured.findings,comparisons:[],diagnostics:{},notices:[]});
for(const term of ['주장: 원고 5년 주장','근거: 계약서 5년 문구','반박·반증: 피고 2년 주장','추가 입증사항: 변경합의 확인 필요'])assert.ok(structuredText.includes(term));
for(const term of ['반박·반증 기재 항목: 1건','추가 입증사항 기재 항목: 1건','반박·반증이 확인된 쟁점','추가 입증 검토가 필요한 쟁점','원문 인용 검산: 원문 대조 필요'])assert.ok(structuredText.includes(term),'Missing structured report summary: '+term);
assert.match(report,/원문 인용 검산: 인용 일치/);
const inventoried=formatCaseReportText({schema:'squidlaw-case-analysis-v1',status:'needs_source_review',findings:[{title:'검토',citations:[{document:'가.pdf',page:1,quote:'계약기간은 5년입니다'}]}],comparisons:[],diagnostics:{submittedDocuments:[{name:'가.pdf',pageCount:3},{name:'나.pdf',pageCount:2}],unreadableDetails:[{document:'나.pdf',page:2,totalPages:2}]},notices:[]});
for(const term of ['제출된 문서: 2개','제출 문서 전체 페이지: 5쪽','텍스트 식별 가능 페이지: 4쪽','분석 인용에 등장하지 않은 제출 문서: 1개','인용되지 않은 제출 문서:','  · 나.pdf'])assert.ok(inventoried.includes(term),'Missing document coverage: '+term);
assert.match(formatCaseReportText({schema:'squidlaw-case-analysis-v1',status:'needs_source_review',findings:[{title:'출처 누락',citations:[],citationChecks:[]}],comparisons:[],diagnostics:{},notices:[]}),/인용 확인이 필요한 분석 항목: 1건/);
console.log('PASS: customer module syntax and comparison preview wiring are valid');
