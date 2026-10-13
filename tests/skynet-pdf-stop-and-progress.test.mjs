import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../admin/skynet.html',import.meta.url),'utf8');
const api=readFileSync(new URL('../api/skynet-document-job.js',import.meta.url),'utf8');
const start=ui.indexOf('const SKYNET_PIPELINE_PHASES=');
const finish=ui.indexOf('function animateVerifiedReviewProgress(',start);
assert.ok(start>0&&finish>start);
const percent=new Function(ui.slice(start,finish)+'return verifiedPipelinePercent;')();

test('unified 5 / 85 / 10 allocation never treats text review as completion',()=>{
 assert.equal(percent('upload',0,1),0);
 assert.equal(percent('upload',1,1),5);
 assert.equal(percent('index',1,1),20);
 assert.equal(percent('review',0,8),20);
 assert.equal(percent('review',2,8),37);
 assert.equal(percent('review',8,8),90);
 assert.equal(percent('report',0,4),90);
 assert.equal(percent('report',4,4),99);
 assert.equal(percent('delivery',1,1),99);
});

test('stop button replaces resume control, empties local active job, and aborts current calls',()=>{
 assert.match(ui,/id="skynetReviewStop"/);
 assert.doesNotMatch(ui,/id="skynetReviewResume"/);
 assert.match(ui,/el\('skynetReviewStop'\)\.onclick=\(\)=>void stopSkynetAnalysis\(\)/);
 assert.match(ui,/for\(const controller of skynetPendingControllers\)controller\.abort\(\)/);
 assert.match(ui,/rememberReview\(null\)/);
 assert.match(ui,/localStorage\.removeItem\(reviewStateKey\)/);
 assert.match(ui,/clearSkynetPipelineProgress\(\)/);
 assert.match(ui,/skynetRunningJobs\.clear\(\)/);
 assert.match(ui,/reviewJobRequest\('cancel',job\)/);
 assert.match(ui,/if\(activeReview\)\{rememberReview\(null\);clearSkynetPipelineProgress\(\);\}/);
 assert.doesNotMatch(ui,/void showReviewJobStatus\(\{showReport:true\}\)\.catch/);
});

test('model requests, PDF sources and document review use tracked abort controllers',()=>{
 assert.match(ui,/const controller=trackSkynetPending\(new AbortController\(\)\);const timeout=/);
 assert.match(ui,/const controller=trackSkynetPending\(new AbortController\(\)\);\s*const timer=/);
 assert.match(ui,/const ctrl=trackSkynetPending\(new AbortController\(\)\)/);
 assert.match(ui,/releaseSkynetPending\(controller\)/);
 assert.match(ui,/ensureSkynetAnalysisActive\(\)/);
 assert.match(ui,/if\(skynetAnalysisStopped\|\|e\.code==='SKYNET_ANALYSIS_STOPPED'\)/);
});

test('server marks job canceled and refuses a later final report',()=>{
 assert.match(api,/canceled:base\(documentHash,questionHash\)\+'canceled\.json'/);
 assert.match(api,/body\.action==='cancel'/);
 assert.match(api,/canceled:true,canceledAt:new Date\(\)\.toISOString\(\)/);
 assert.match(api,/body\.action==='finish'&&canceledState\?\.canceled===true/);
 assert.match(api,/REVIEW_CANCELED_BY_USER/);
 assert.match(api,/canceledState\?\.canceled===true/);
});
