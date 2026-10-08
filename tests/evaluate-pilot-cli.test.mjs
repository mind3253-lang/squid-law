import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'squidlaw-eval-'));
try{
 const resultPath=join(dir,'result.json'),fixturePath=new URL('../fixtures/synthetic-lease-evaluation.json',import.meta.url).pathname,reportPath=join(dir,'report.json');
 const result={schema:'squidlaw-merged-analysis-v1',sourceReady:true,findings:[
  {title:'원고는 5년을 주장한다',citationChecks:[{verification:{status:'matched'}}]},
  {title:'피고는 2년을 주장한다',citationChecks:[{verification:{status:'matched'}}]}
 ]};
 const run=()=>spawnSync(process.execPath,['--experimental-default-type=module',new URL('../evaluate-pilot-cli.js',import.meta.url).pathname,resultPath,fixturePath,reportPath],{encoding:'utf8'});
 writeFileSync(resultPath,JSON.stringify(result));
 let outcome=run();
 assert.equal(outcome.status,0,outcome.stderr);
 assert.equal(JSON.parse(readFileSync(reportPath,'utf8')).passed,true);
 const second=run();
 assert.equal(second.status,2);
 assert.match(second.stderr,/EEXIST/);
 const failedPath=join(dir,'failed-report.json');
 writeFileSync(resultPath,JSON.stringify({...result,sourceReady:false}));
 outcome=spawnSync(process.execPath,['--experimental-default-type=module',new URL('../evaluate-pilot-cli.js',import.meta.url).pathname,resultPath,fixturePath,failedPath],{encoding:'utf8'});
 assert.equal(outcome.status,1);
 assert.equal(JSON.parse(readFileSync(failedPath,'utf8')).passed,false);
 console.log('PASS: offline pilot evaluator reports pass/review and protects existing files');
}finally{rmSync(dir,{recursive:true,force:true});}
