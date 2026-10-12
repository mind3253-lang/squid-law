import test from 'node:test';import assert from 'node:assert/strict';
import {parseCodeProposal} from '../lib/skynet-ai-code-proposal.mjs';
const ctx={repository:'acme/demo',branch:'main',path:'src/index.js',sha:'a'.repeat(40)};
const raw=overrides=>JSON.stringify({path:ctx.path,sha:ctx.sha,message:'Update module',content:'export const value = 2;',...overrides});
test('code proposal is a nonexecuting github write request',()=>{const p=parseCodeProposal(raw(),ctx);assert.equal(p.tool,'github.commit');assert.equal(p.args.owner,'acme');assert.equal(p.args.sha,ctx.sha)});
test('rejects mismatched file path',()=>assert.throws(()=>parseCodeProposal(raw({path:'elsewhere.js'}),ctx),/CODE_TARGET_MISMATCH/));
test('rejects mismatched source sha',()=>assert.throws(()=>parseCodeProposal(raw({sha:'b'.repeat(40)}),ctx),/CODE_TARGET_MISMATCH/));
test('rejects oversized generated source',()=>assert.throws(()=>parseCodeProposal(raw({content:'x'.repeat(100001)}),ctx),/INVALID_CONTENT/));
