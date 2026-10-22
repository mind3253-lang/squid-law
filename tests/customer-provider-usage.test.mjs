import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('provider results persist metering in visual and independent audit checkpoints',()=>{
 for(const p of ['lib/openai-vision-provider.mjs','lib/independent-boundary-review.mjs','lib/independent-semantic-review.mjs']){
  assert.match(read(p),/modelUsage:summarizeModelUsage/);
 }
 assert.match(read('api/customer-analysis-worker.js'),/JSON\.stringify\(usageLedger\)/);
});
