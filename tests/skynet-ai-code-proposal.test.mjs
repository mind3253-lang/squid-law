import test from 'node:test';import assert from 'node:assert/strict';import {parseCodeProposal} from '../lib/skynet-ai-code-proposal.mjs';
test('accept a full-file proposal for review',()=>{const p=parseCodeProposal(JSON.stringify({path:'src/main.js',content:'export const x=1;',summary:'Update export'}));assert.equal(p.requiresApproval,true)});
test('reject path traversal',()=>assert.throws(()=>parseCodeProposal(JSON.stringify({path:'../secret',content:'x',summary:'x'})),/INVALID_CODE_PATH/));
test('reject empty replacement',()=>assert.throws(()=>parseCodeProposal(JSON.stringify({path:'src/a.js',content:'',summary:'x'})),/INVALID_CODE_CONTENT/));
test('reject non-json AI response',()=>assert.throws(()=>parseCodeProposal('hello'),/CODE_JSON_REQUIRED/));
