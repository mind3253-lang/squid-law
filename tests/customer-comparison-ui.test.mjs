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
 findings:[{title:'원고 주장',citations:[{document:'계약서.pdf',page:1,quote:'계약기간 5년'}],citationChecks:[{verification:{status:'matched'}}]}],
 comparisons:[{reference:'갑 제1호증',relation:'conflict_candidate',explanation:'서로 다른 기간',citations:[]}],
 diagnostics:{unreadableDetails:[{document:'계약서.pdf',page:2,totalPages:2}],missingBatches:[3],comparisonSourceReady:false,analysisSourceReady:true},notices:[]});
for(const term of ['일부 페이지 미식별','분석에서 인용된 문서: 1개','충돌 가능성 검토: 1건','결과가 누락된 분석 묶음: 3','읽지 못한 페이지'])assert.ok(report.includes(term),'Missing report detail: '+term);
console.log('PASS: customer module syntax and comparison preview wiring are valid');
