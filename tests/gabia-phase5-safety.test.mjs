import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
test('Gabia deployment is staging-only and cannot cut over production',()=>{
 const script=readFileSync('scripts/gabia-stage-release.sh','utf8');
 assert.match(script,/GABIA_RELEASE_STAGED/);
 assert.doesNotMatch(script,/systemctl\s+(restart|stop)|certbot|cloudflare|vercel\s+remove/);
});
test('Gabia API gateway syntax check',()=>{
 const r=spawnSync(process.execPath,['--check','scripts/gabia-api-staging.mjs'],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
