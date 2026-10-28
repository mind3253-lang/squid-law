import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CUSTOMER_PRODUCT_CONTRACT as contract} from '../lib/customer-product-contract.mjs';

const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('owner-approved product contract: a full case, independent parallel customers and API usage billing',()=>{
 assert.equal(contract.analysisConcurrency,'resource_bounded_parallel');
 assert.equal(contract.billingUnit,'estimated_then_metered_api_usage');
 assert.equal(contract.submission,'one_customer_action_for_entire_case');
 assert.equal(contract.execution,'durable_checkpoints_with_retry_and_resume');
 assert.equal(contract.customerFileSizeTier,'not_a_pricing_or_product_boundary');
 assert.match(contract.queue,/fifo_only_when_processing_capacity_is_busy/);
});

test('customer worker claiming is row-scoped, never globally serialized',()=>{
 const jobs=src('api/customer-analysis-jobs-db.js');
 const start=jobs.indexOf('export async function claimJob(){');
 const end=jobs.indexOf('export async function advanceJob(',start);
 assert.ok(start>=0&&end>start);
 const claim=jobs.slice(start,end);
 const transaction=claim.indexOf("await client.query('BEGIN')");
 const candidate=claim.indexOf('FOR UPDATE SKIP LOCKED');
 const commit=claim.indexOf("await client.query('COMMIT')",candidate);
 assert.ok(transaction>=0&&transaction<candidate&&candidate<commit);
 assert.doesNotMatch(claim,/pg_advisory_xact_lock|SELECT 1 FROM customer_analysis_jobs WHERE status='running'/);
 assert.match(claim,/finally\{client\.release\(\)\}/);
 assert.match(claim,/fence=fence\+1/);
 assert.match(claim,/owner_token=\$1/);
});

test('existing checkpoint and pending-job FIFO paths remain intact',()=>{
 const jobs=src('api/customer-analysis-jobs-db.js');
 assert.match(jobs,/export async function advanceJob\(/);
 assert.match(jobs,/export async function renewJobLease\(/);
 assert.match(jobs,/export async function queueSnapshot\(/);
 assert.match(jobs,/estimatedStartSeconds/);
 assert.match(jobs,/position:eligible\?v\.ahead\+1:null/);
 assert.match(jobs,/estimatedStartSeconds:null/);
 assert.match(src('api/customer-analysis-worker.js'),/await claimJob\(\)/);
});

test('permanent developer instructions reject arbitrary PDF MB increases as a product fix',()=>{
 for(const path of ['AGENTS.md','docs/SQUIDLAW_FULL_RESUME_COMMAND.md','docs/SKYNET_RESUME_COMMAND.md']){
  const value=src(path);
  assert.match(value,/100MB/);
  assert.match(value,/페이지/);
  assert.match(value,/대기열|대기시간|대기/);
 }
 const instructions=src('AGENTS.md');
 assert.match(instructions,/임의 변경 금지/);
 assert.match(instructions,/lib\/customer-product-contract\.mjs/);
 assert.match(instructions,/현재 남은 격차/);
});

test('an admin-only 100MB PDF workaround is NOT counted as finished customer-scale streaming',()=>{
 const admin=src('api/skynet-document.js');
 assert.match(admin,/PDF_MAX_BYTES=100\*1048576/);
 assert.match(admin,/Buffer\.concat\(buffers,total\)/);
 assert.match(src('AGENTS.md'),/구조 보완 및 E2E 테스트가 필요/);
});

test('SKYNET admin chat reloads the product contract after a new conversation',()=>{
 const chat=src('api/skynet-chat.js');
 assert.match(chat,/import \{customerProductDirective\} from '\.\.\/lib\/customer-product-contract\.mjs'/);
 assert.match(chat,/\]:\[\{role:'system',content:customerProductDirective\(\)\}/);
 // Single-pass PDF evidence review must remain source-focused.
 assert.match(chat,/input\.skipMemorySearch===true\?\[/);
 assert.doesNotMatch(chat.slice(chat.indexOf('input.skipMemorySearch===true?['),
  chat.indexOf(']:[{role:\'system\',content:customerProductDirective()}')),/customerProductDirective\(\)/);
});
