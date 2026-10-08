import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const html=await readFile(new URL('../customer.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)];
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
assert.match(html,/AI 사건 분석은 아직 연결되지 않았습니다/);
console.log('PASS: customer module syntax and comparison preview wiring are valid');
