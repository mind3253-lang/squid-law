import test from 'node:test';import assert from 'node:assert/strict';
import {parseMultiCodeResponse} from '../lib/skynet-ai-multi-code-proposal.mjs';
const sha='a'.repeat(40);const files=[{path:'a.js',sha,source:'x'},{path:'b.js',sha,source:'y'}];
const change=path=>({path,sha,message:'Update '+path,content:'export default 1;'});
test('accepts exact target set regardless of returned order',()=>{const r=parseMultiCodeResponse(JSON.stringify({changes:[change('b.js'),change('a.js')]}),{repository:'example/app',branch:'main',files});assert.deepEqual(r.map(x=>x.args.path),['b.js','a.js'])});
test('rejects fabricated targets',()=>assert.throws(()=>parseMultiCodeResponse(JSON.stringify({changes:[change('a.js'),change('other.js')]}),{repository:'example/app',branch:'main',files}),/UNREQUESTED/));
test('rejects mismatched sha',()=>assert.throws(()=>parseMultiCodeResponse(JSON.stringify({changes:[change('a.js'),{...change('b.js'),sha:'b'.repeat(40)}]}),{repository:'example/app',branch:'main',files}),/TARGET_MISMATCH/));
