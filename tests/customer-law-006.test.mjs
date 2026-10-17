import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../customer.html',import.meta.url),'utf8');
const api=readFileSync(new URL('../api/customer-analysis-job.js',import.meta.url),'utf8');
test('LAW-006: source page progress is distinct from final analysis',()=>{assert.match(ui,/원문 페이지 검증률이며, 전체 법률 분석 완료율이 아닙니다/);assert.match(ui,/전체 분석 완료율은 최종 보고서 생성 전 산정하지 않습니다/);assert.match(ui,/const overall=state==='completed'\?'100%':'산정 불가'/);assert.match(api,/pageCountVerified:verifiedSourcePages\(allDocs\)/);});
