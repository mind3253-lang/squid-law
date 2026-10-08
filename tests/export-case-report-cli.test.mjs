import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const dir=await mkdtemp(join(tmpdir(),'squidlaw-report-'));
try{
 const input=join(dir,'case.json'),output=join(dir,'case.txt');
 const report={schema:'squidlaw-case-analysis-v1',status:'needs_source_review',
  findings:[{title:'원고 주장',citations:[{document:'원고.pdf',page:3,quote:'계약기간은 5년이다'}],citationChecks:[{verification:{status:'unmatched'}}]}],
  comparisons:[],notices:['원문 대조 필요']};
 await writeFile(input,JSON.stringify(report));
 const run=()=>spawnSync(process.execPath,['--experimental-default-type=module','export-case-report-cli.js',input,output],{encoding:'utf8'});
 const first=run();
 assert.equal(first.status,0,first.stderr);
 const text=await readFile(output,'utf8');
 assert.match(text,/원고.pdf · 3쪽 · 출처 확인 필요/);
 assert.match(text,/계약기간은 5년이다/);
 const second=run();
 assert.equal(second.status,1,'existing report must not be overwritten');
 assert.match(second.stderr,/Report export failed/);
 const missing=spawnSync(process.execPath,['--experimental-default-type=module','export-case-report-cli.js'],{encoding:'utf8'});
 assert.equal(missing.status,2);
 console.log('PASS: offline TXT export preserves source warnings, is copyable and refuses overwrites');
}finally{await rm(dir,{recursive:true,force:true});}
