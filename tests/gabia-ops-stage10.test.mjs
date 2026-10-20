import test from 'node:test';
import assert from 'node:assert/strict';
import {safeGabiaLog} from '../lib/gabia-safe-log.mjs';
import {gabiaCutoverReadiness,gabiaServiceExposure} from '../lib/gabia-cutover-guard.mjs';
test('logs never include credentials or customer text',()=>{
 const result=safeGabiaLog({status:'ok',durationMs:120,apiKey:'secret',customerEmail:'x@y.z',body:'private',filePath:'/tmp/x'});
 assert.deepEqual(result,{status:'ok',durationMs:120});
});
test('cutover remains disabled without verified prerequisites',()=>{
 assert.equal(gabiaCutoverReadiness({databaseMigrated:true}).ready,false);
 assert.equal(gabiaServiceExposure({host:'0.0.0.0',approved:true}),false);
});
