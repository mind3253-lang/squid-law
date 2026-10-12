import test from 'node:test';import assert from 'node:assert/strict';import {summarizeCodeDiff} from '../lib/skynet-code-proposal-diff.mjs';
test('shows bounded changed lines',()=>{const d=summarizeCodeDiff('a\nb\nc','a\nx\nc');assert.equal(d.changed,true);assert.equal(d.firstChangedLine,2);assert.match(d.preview,/\- b/);assert.match(d.preview,/\+ x/)});
test('unchanged files report no change',()=>assert.equal(summarizeCodeDiff('a','a').changed,false));
