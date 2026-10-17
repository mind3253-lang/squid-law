import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../api/customer-analysis-jobs-db.js',import.meta.url),'utf8');
test('LAW-034 global job claim is serialized across worker invocations',()=>{
 assert.match(source,/pg_advisory_xact_lock\(208387541, 1\)/);
 assert.match(source,/status='running' AND lease_expires_at>now\(\) LIMIT 1/);
 assert.match(source,/FOR UPDATE SKIP LOCKED LIMIT 1/);
});
test('LAW-034 checkpoint transitions require active running owner and fence',()=>{
 const advance=source.slice(source.indexOf('export async function advanceJob'),source.indexOf('export async function renewJobLease'));
 assert.match(advance,/checkpoint=\$7::jsonb,status=\$8/);
 assert.match(advance,/owner_token=\$4 AND fence=\$5 AND status='running' AND lease_expires_at>now\(\)/);
 assert.match(advance,/if\(!r.rows\[0\]\)throw Error\('JOB_LEASE_LOST'\)/);
});
test('LAW-034 lease renewal and resume cannot override an active checkpoint',()=>{
 const renew=source.slice(source.indexOf('export async function renewJobLease'),source.indexOf('export async function resumeJob'));
 assert.match(renew,/owner_token=\$4/);
 assert.match(renew,/fence=\$5 AND status='running'/);
 const resume=source.slice(source.indexOf('export async function resumeJob'),source.indexOf('export async function queueSnapshot'));
 assert.match(resume,/status IN \('blocked','failed'\)/);
});
