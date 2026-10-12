import test from 'node:test';import assert from 'node:assert/strict';import {parsePlannerResponse} from '../lib/skynet-ai-planner.mjs';import {planToJob} from '../lib/skynet-ai-plan-job.mjs';
const plan=(name='github.read')=>({summary:'Inspect',tasks:[{id:'inspect',title:'Inspect project',toolCalls:[{name,args:{owner:'acme',repo:'demo',path:'README.md'}}]}]});
test('planner accepts read-only repository inspection',()=>assert.equal(parsePlannerResponse(JSON.stringify(plan())).tasks[0].id,'inspect'));
test('planner rejects write calls before approval',()=>assert.throws(()=>parsePlannerResponse(JSON.stringify(plan('github.commit'))),/UNSUPPORTED_PLAN_TOOL/));
test('job conversion does not grant write access',()=>assert.deepEqual(planToJob({goal:'Inspect project code',repository:'acme/demo',plan:plan()}).scopes,['repository:read']));
test('job conversion rejects generated write calls',()=>assert.throws(()=>planToJob({goal:'Inspect project code',repository:'acme/demo',plan:plan('github.commit')}),/WRITE_PLAN_REQUIRES_SEPARATE_APPROVAL/));
