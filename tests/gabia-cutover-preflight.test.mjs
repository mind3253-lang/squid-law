import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGabiaProxyRequest} from '../server/gabia-security-policy.mjs';
import {buildGabiaBackupManifest,verifyGabiaBackupManifest} from '../deploy/gabia-backup-manifest.mjs';
test('only expected HTTPS hostname passes cutover policy',()=>{
 assert.equal(validateGabiaProxyRequest({protocol:'http',hostname:'example.com',allowedHost:'example.com'}).allowed,false);
 assert.equal(validateGabiaProxyRequest({protocol:'https',hostname:'wrong.com',allowedHost:'example.com'}).allowed,false);
 assert.equal(validateGabiaProxyRequest({protocol:'https',hostname:'example.com',allowedHost:'example.com'}).allowed,true);
});
test('backup manifest detects changed content',()=>{
 const files=[{relativePath:'archive/file.pdf',bytes:Buffer.from('example'),size:7}];
 const manifest=buildGabiaBackupManifest(files);
 assert.equal(verifyGabiaBackupManifest(manifest,files),true);
 assert.equal(verifyGabiaBackupManifest(manifest,[{...files[0],bytes:Buffer.from('changed')}]),false);
});
