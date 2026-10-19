import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const entry=new URL('../worker/continuous-worker.mjs',import.meta.url);
const base={...process.env};
for(const name of ['SQUIDLAW_WORKER_RUN_APPROVED','SQUIDLAW_WORKER_CUTOVER_APPROVED','CRON_SECRET','BLOB_READ_WRITE_TOKEN','SQUID_CUSTOMER_DATABASE_URL','SQUID_CUSTOMER_DATABASE_DATABASE_URL','OPENAI_API_KEY'])delete base[name];

function run(extra={}){
 return spawnSync(process.execPath,[entry.pathname],{env:{...base,...extra},encoding:'utf8',timeout:10000});
}
test('no approval fails closed before imports and DB access',()=>{
 const r=run();
 assert.equal(r.status,78);
 assert.match(r.stderr,/WORKER_NOT_APPROVED/);
});
test('run approval alone cannot claim production work',()=>{
 const r=run({SQUIDLAW_WORKER_RUN_APPROVED:'YES'});
 assert.equal(r.status,78);
 assert.match(r.stderr,/WORKER_CUTOVER_NOT_APPROVED/);
});
test('both approvals still require connection configuration',()=>{
 const r=run({SQUIDLAW_WORKER_RUN_APPROVED:'YES',SQUIDLAW_WORKER_CUTOVER_APPROVED:'YES'});
 assert.equal(r.status,78);
 assert.match(r.stderr,/WORKER_CONFIGURATION_MISSING/);
});
