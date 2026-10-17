import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileAnalysisCompletion} from '../lib/analysis-completion-reconciliation.mjs';
const version='a'.repeat(64);
test('LAW-025 mismatched boundary document cannot pass completion gate',()=>{
 const result=reconcileAnalysisCompletion({
  sourceVersion:version,
  documents:[{id:'doc',pageCount:2}],
  sourceIndex:{sourceVersion:version,sources:[]},
  aggregate:{sourceVersion:version,documentBoundaryCandidates:[{documentId:'wrong',coveredPages:2,sections:[]}]},
  report:null,visualReview:null,semanticAuditPassed:false,visualAudits:[],ocrVerified:true,boundariesVerified:true
 });
 assert.equal(result.complete,false);
 assert.equal(result.gates.documentBoundaries.verified,false);
 assert.equal(result.gates.caseStructure.verified,false);
});
