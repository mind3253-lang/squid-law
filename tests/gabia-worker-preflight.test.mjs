import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workerPreflight} from '../lib/gabia-worker-preflight.mjs';
const base={SQUIDLAW_WORKER_RUN_APPROVED:'YES',SQUIDLAW_WORKER_CUTOVER_APPROVED:'YES',SQUIDLAW_CUSTOMER_WORKER_OWNER:'gabia',SQUIDLAW_OBJECT_BACKEND:'gabia',SQUIDLAW_OBJECT_ROOT:'/var/lib/squidlaw/objects',CRON_SECRET:'test-secret',SQUID_CUSTOMER_DATABASE_URL:'postgresql://test.invalid/db',SQUIDLAW_LEGAL_API_ENABLED:'true',OPENAI_API_KEY:'test-key'};
test('Gabia worker preflight accepts local storage without Blob token',()=>assert.equal(workerPreflight(base).ok,true));
test('Gabia worker refuses missing owner approval',()=>assert.ok(workerPreflight({...base,SQUIDLAW_WORKER_CUTOVER_APPROVED:'NO'}).errors.includes('WORKER_CUTOVER_NOT_APPROVED')));
test('Gabia worker rejects legacy Vercel storage backend',()=>assert.ok(workerPreflight({...base,SQUIDLAW_OBJECT_BACKEND:'vercel'}).errors.includes('WORKER_INVALID_OBJECT_BACKEND')));
test('Gabia backend requires explicit object root',()=>assert.ok(workerPreflight({...base,SQUIDLAW_OBJECT_ROOT:''}).errors.includes('WORKER_MISSING_SQUIDLAW_OBJECT_ROOT')));
test('Worker requires database connection',()=>assert.ok(workerPreflight({...base,SQUID_CUSTOMER_DATABASE_URL:''}).errors.includes('WORKER_MISSING_DATABASE_URL')));
