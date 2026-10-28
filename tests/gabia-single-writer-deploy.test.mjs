import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Gabia production has one automatic code writer and no post-deploy report overlay',()=>{
 const workflow=read('.github/workflows/gabia-code-deploy.yml');
 assert.match(workflow,/tar -xzf \/tmp\/squidlaw-release\.tar\.gz -C \/opt\/squidlaw\/app/);
 for(const job of ['deploy-static-sidebar-patch','deploy-precedent-history-patch','deploy-legal-token-patch'])
  assert.doesNotMatch(workflow,new RegExp('^  '+job+':','m'));
 assert.doesNotMatch(workflow,/PY_REPORT_LAYOUT|REPORT_LAYOUT_PATCH_APPLIED/);
 assert.match(workflow,/DEPLOY_REPORT_UI_SOURCE_MATCH/);
 assert.match(workflow,/node --check lib\/customer-analysis-brief\.mjs/);
 assert.match(workflow,/systemctl disable --now squidlaw-auto-update\.timer/);
});

test('automatic backdoor deployments are disabled, recovery backups retained',()=>{
 const auto=read('deploy/gabia-auto-update.sh');
 assert.doesNotMatch(auto,/git (merge|pull|reset|checkout)|bash deploy\/update-worker-code\.sh/);
 assert.match(auto,/AUTO_UPDATE_DISABLED_CANONICAL_DEPLOY_ONLY/);
 const preview=read('.github/workflows/gabia-preview-bootstrap.yml');
 assert.match(preview,/workflow_dispatch:/);
 assert.doesNotMatch(preview,/^  push:/m);
 assert.equal(existsSync(new URL('../.github/workflows/gabia-mypage-direct-patch.yml',import.meta.url)),false);
 const workflow=read('.github/workflows/gabia-code-deploy.yml');
 assert.match(workflow,/tar -czf "\$backup"/);
 assert.match(workflow,/DEPLOY_ROLLED_BACK/);
});
