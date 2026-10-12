import test from 'node:test';import assert from 'node:assert/strict';import {parseTargetSelection} from '../lib/skynet-ai-target-selector.mjs';
test('accepts selected existing targets',()=>assert.deepEqual(parseTargetSelection('{"paths":["lib/a.mjs"]}',['lib/a.mjs','lib/b.mjs']),['lib/a.mjs']));
test('rejects nonexistent targets',()=>assert.throws(()=>parseTargetSelection('{"paths":["lib/x.mjs"]}',['lib/a.mjs']),/TARGET_NOT_IN_REPOSITORY/));
test('rejects duplicate targets',()=>assert.throws(()=>parseTargetSelection('{"paths":["lib/a.mjs","lib/a.mjs"]}',['lib/a.mjs']),/DUPLICATE_TARGET/));
import {selectCodeTargets} from '../lib/skynet-ai-target-selector.mjs';
test('selects targets from authenticated repository tree and rejects invented files',async()=>{
 const previous={token:process.env.SKYNET_GITHUB_TOKEN,key:process.env.OPENAI_API_KEY};process.env.SKYNET_GITHUB_TOKEN='test-token';process.env.OPENAI_API_KEY='test-key';
 const calls=[];const fetchImpl=async(url,options)=>{calls.push(url);if(url.includes('/git/trees/'))return {ok:true,text:async()=>JSON.stringify({tree:[{type:'blob',path:'lib/a.mjs'},{type:'blob',path:'lib/b.mjs'},{type:'blob',path:'.env'}]})};return {ok:true,json:async()=>({choices:[{message:{content:'{"paths":["lib/a.mjs"]}'}}]})}};
 try{const result=await selectCodeTargets({goal:'Modify a function in source',repository:'example/app'},fetchImpl);assert.deepEqual(result,['lib/a.mjs']);assert.equal(calls.length,2)}finally{if(previous.token===undefined)delete process.env.SKYNET_GITHUB_TOKEN;else process.env.SKYNET_GITHUB_TOKEN=previous.token;if(previous.key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous.key}
});
