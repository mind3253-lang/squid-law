import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'squidlaw-offline-'));
try{
 const input=join(dir,'input.json'),output=join(dir,'output.json');
 writeFileSync(input,JSON.stringify([
  {name:'원고.pdf',pages:[{text:'원고는 임대차계약 기간이 5년이라고 주장한다.'},{text:''}]},
  {name:'피고.pdf',pages:[{text:'피고는 임대차계약 기간이 2년이라고 주장한다.'}]}
 ]));
 const run=()=>spawnSync(process.execPath,['--experimental-default-type=module',new URL('../dry-run-analysis-cli.js',import.meta.url).pathname,input,output],{encoding:'utf8',env:{...process.env,OPENAI_API_KEY:'',SQUIDLAW_AI_MODEL:''}});
 const first=run();
 assert.equal(first.status,0,first.stderr);
 const result=JSON.parse(readFileSync(output,'utf8'));
 assert.equal(result.mode,'offline-fixture-not-ai');
 assert.equal(result.sourceReady,true);
 assert.equal(result.findings.length,2);
 assert.equal(result.diagnostics.unreadablePages,1);
 assert.equal(result.findings[0].citationChecks[0].verification.status,'matched');
 const second=run();
 assert.equal(second.status,1);
 assert.match(second.stderr,/EEXIST/);
 console.log('PASS: full offline CLI creates verified report without keys or network and refuses overwrite');
}finally{rmSync(dir,{recursive:true,force:true});}
