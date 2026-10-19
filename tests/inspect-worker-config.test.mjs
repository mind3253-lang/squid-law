import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const script=new URL('../deploy/inspect-worker-config.mjs',import.meta.url);
test('prints variable names and presence without leaking secrets',()=>{
 const dir=mkdtempSync(join(tmpdir(),'squidlaw-inspect-'));
 try{
  const file=join(dir,'env');
  writeFileSync(file,'CRON_SECRET=do-not-print-this-secret\nOPENAI_API_KEY=\n');
  const r=spawnSync(process.execPath,[script.pathname,file],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/CRON_SECRET present/);
  assert.match(r.stdout,/OPENAI_API_KEY empty/);
  assert.doesNotMatch(r.stdout,/do-not-print-this-secret/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
