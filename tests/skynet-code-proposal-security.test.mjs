import test from 'node:test';import assert from 'node:assert/strict';import {assertSafeCodeTarget} from '../lib/skynet-code-proposal-security.mjs';
test('rejects sensitive and execution-control paths',()=>{for(const path of ['.env','.env.production','.github/workflows/deploy.yml','node_modules/pkg/index.js','a/../b.js'])assert.throws(()=>assertSafeCodeTarget(path))});
test('allows ordinary source paths',()=>assert.equal(assertSafeCodeTarget('lib/skynet-code-proposal-security.mjs'),'lib/skynet-code-proposal-security.mjs'));
