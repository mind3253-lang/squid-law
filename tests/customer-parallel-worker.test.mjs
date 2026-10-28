import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 customerWorkerParallelism,workerMayBeginCycle,
 WORKER_MEMORY_PER_JOB_BYTES
} from '../lib/customer-worker-capacity.mjs';
const MiB=1024*1024;
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('analysis capacity increases with Gabia resources, not customer count',()=>{
 const slots=(cores,gib)=>customerWorkerParallelism({cpuCount:cores,totalMemoryBytes:gib*1024*MiB});
 assert.equal(slots(1,1),1);
 assert.equal(slots(1,2),2);
 assert.equal(slots(2,4),4);
 assert.equal(slots(4,8),8);
 assert.equal(slots(4,1),1);
 assert.throws(()=>customerWorkerParallelism({cpuCount:0,totalMemoryBytes:4*1024*MiB}),/INVALID_WORKER_RESOURCE_BUDGET/);
});

test('memory pressure pauses only additional lanes, never all progress',()=>{
 assert.equal(workerMayBeginCycle({availableMemoryBytes:0,activeCycles:0}),true);
 assert.equal(workerMayBeginCycle({availableMemoryBytes:WORKER_MEMORY_PER_JOB_BYTES-1,activeCycles:1}),false);
 assert.equal(workerMayBeginCycle({availableMemoryBytes:WORKER_MEMORY_PER_JOB_BYTES,activeCycles:1}),true);
 assert.throws(()=>workerMayBeginCycle({availableMemoryBytes:-1,activeCycles:1}),/INVALID_WORKER_MEMORY_STATUS/);
});

test('worker starts independent lanes and drains on stop',()=>{
 const worker=read('worker/continuous-worker.mjs');
 assert.match(worker,/customerWorkerParallelism\(/);
 assert.match(worker,/Promise\.all\(Array\.from\(\{length:parallelLanes\},\(\)=>runLane\(\)\)\)/);
 assert.match(worker,/activeCycles\+\+/);
 assert.match(worker,/finally\{activeCycles--\}/);
 assert.match(worker,/if\(!stopping\)await sleep/);
 assert.doesNotMatch(worker,/WORKER_SINGLE_CUSTOMER|analysisConcurrency===1/);
});

test('independent leases preserve fencing and transient API failures back off',()=>{
 const jobs=read('api/customer-analysis-jobs-db.js');
 assert.match(jobs,/FOR UPDATE SKIP LOCKED LIMIT 1/);
 assert.match(jobs,/owner_token=\$4 AND fence=\$5 AND status='running'/);
 assert.match(jobs,/next_run_at=CASE WHEN \$8='retry' AND \$6='error' THEN/);
 assert.match(jobs,/make_interval\(secs=>LEAST\(3600,POWER/);
 const worker=read('api/customer-analysis-worker.js');
 assert.match(worker,/const visionHttp=\/\^VISION_PDF_\(API\|UPLOAD\)_/);
 assert.match(worker,/visionFailureDisposition\(safeCode/);
});
