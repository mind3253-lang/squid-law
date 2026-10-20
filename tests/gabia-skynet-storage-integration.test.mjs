import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const consumers=['api/skynet-chat.js','api/skynet-recall-batch.js','api/auth/naver/callback.js'];
test('SKYNET recall and Naver account storage use a shared backend-aware adapter',()=>{
 for(const file of consumers){
  const source=readFileSync(file,'utf8');
  assert.match(source,/from ['"][.\/]+lib\/customer-object-storage\.mjs['"]/);
  assert.doesNotMatch(source,/from ['"]@vercel\/blob['"]/);
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert.equal(result.status,0,file+': '+result.stderr);
 }
});
test('legacy Blob token only required for Vercel backend',()=>{
 for(const file of ['api/skynet-recall-batch.js','api/auth/naver/callback.js']){
  const source=readFileSync(file,'utf8');
  assert.match(source,/SQUIDLAW_OBJECT_BACKEND/);
  assert.match(source,/BLOB_READ_WRITE_TOKEN/);
 }
});
