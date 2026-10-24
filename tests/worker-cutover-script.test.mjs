import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const path=new URL('../deploy/worker-cutover.sh',import.meta.url);
const script=readFileSync(path,'utf8');
test('cutover helper parses',()=>{
 const r=spawnSync('bash',['-n',path.pathname],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
test('cutover helper never enables or starts production worker',()=>{
 assert.doesNotMatch(script,/systemctl\s+(start|enable|restart)\b/);
 assert.doesNotMatch(script,/SQUIDLAW_WORKER_RUN_APPROVED=YES/);
});
test('rollback disables Gabia and requires independent job-owner verification',()=>{
 assert.match(script,/systemctl stop/);
 assert.match(script,/systemctl disable/);
 assert.match(script,/verify the active job owner and scheduler routing separately/);
});
