import test from 'node:test';import assert from 'node:assert/strict';import {validateProposalPaths} from '../lib/skynet-code-proposal-paths.mjs';
test('allows unique bounded source paths',()=>assert.deepEqual(validateProposalPaths(['lib/a.mjs','api/a.js']),['lib/a.mjs','api/a.js']));
test('rejects duplicate paths',()=>assert.throws(()=>validateProposalPaths(['a','a']),/DUPLICATE/));
test('rejects path traversal',()=>assert.throws(()=>validateProposalPaths(['../secret']),/INVALID/));
test('rejects excessive batch',()=>assert.throws(()=>validateProposalPaths(Array.from({length:13},(_,i)=>'a'+i)),/INVALID/));
