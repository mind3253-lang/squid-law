import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const dir=await mkdtemp(join(tmpdir(),'squidlaw-verified-'));
try{
 const paths=['documents.json','analysis.json','comparison.json','report.txt'].map(x=>join(dir,x));
 const documents=[{name:'원고.pdf',pages:[{text:'계약기간은 5년으로 정하였다.'}]},{name:'피고.pdf',pages:[{text:'계약기간은 2년이라고 주장한다.'}]}];
 const quote={document:'원고.pdf',page:1,quote:'계약기간은 5년으로 정하였다'};
 const defense={document:'피고.pdf',page:1,quote:'계약기간은 2년이라고 주장한다'};
 const analysis={schema:'squidlaw-merged-analysis-v1',sourceReady:true,diagnostics:{},findings:[{title:'기간 다툼',citations:[quote],citationChecks:[{verification:{status:'matched'}}]}]};
 const comparison={schema:'squidlaw-private-comparisons-v1',sourceReady:true,diagnostics:{},comparisons:[{reference:'소갑 제3호증',relation:'different_positions',explanation:'기간 주장 상이',sourceReady:true,citations:[{...quote,verification:{status:'matched'}},{...defense,verification:{status:'matched'}}]}]};
 for(const [i,value] of [documents,analysis,comparison].entries())await writeFile(paths[i],JSON.stringify(value));
 const run=()=>spawnSync(process.execPath,['--experimental-default-type=module','export-verified-case-cli.js',...paths],{encoding:'utf8'});
 let result=run();assert.equal(result.status,0,result.stderr);
 let txt=await readFile(paths[3],'utf8');assert.match(txt,/출처 검산: 원문 일치/);assert.match(txt,/원고.pdf · 1쪽 · 원문 일치/);
 result=run();assert.equal(result.status,1,'must not overwrite existing report');
 await rm(paths[3]);
 const forged={...analysis,findings:[{...analysis.findings[0],citations:[{...quote,quote:'원문에 없는 9년 계약'}]}]};
 await writeFile(paths[1],JSON.stringify(forged));
 result=run();assert.equal(result.status,0,result.stderr);
 txt=await readFile(paths[3],'utf8');assert.match(txt,/출처 검산: 확인 필요/);assert.match(txt,/원고.pdf · 1쪽 · 출처 확인 필요/);
 console.log('PASS: offline export rechecks originals, rejects forged citation status and refuses overwrites');
}finally{await rm(dir,{recursive:true,force:true});}
