// Shared validation of private AI pilot results against the currently loaded PDFs.
// An exact quote match proves only textual presence, not factual or legal truth.
import {validateFindingsPayload} from './findings-schema.js';
import {verifyFindings} from './source-verification.js';
import {summarizeCitationChecks} from './analysis-quality.js';

export function validatePrivatePilotResult(documents,payload){
 if(!Array.isArray(documents)||!documents.length||new Set(documents.map(d=>d.name)).size!==documents.length)throw Error('AMBIGUOUS_SOURCE_DOCUMENTS');
 if(!payload||payload.schema!=='squidlaw-private-pilot-v1'||payload.kind!=='source-matched-review-candidates-not-legal-conclusions'||!Array.isArray(payload.documents)||!Array.isArray(payload.findings))throw Error('INVALID_PRIVATE_PILOT_RESULT');
 const current=new Map(documents.map(d=>[d.name,d.pages.length]));
 if(payload.documents.length!==documents.length||new Set(payload.documents.map(d=>d.name)).size!==payload.documents.length||payload.documents.some(d=>!current.has(d.name)||current.get(d.name)!==d.pages))throw Error('SOURCE_DOCUMENT_MISMATCH');
 const {findings}=validateFindingsPayload({schema:'squidlaw-findings-v1',findings:payload.findings});
 if(findings.length>12||findings.some(f=>!f.citations.length))throw Error('INVALID_PRIVATE_PILOT_FINDINGS');
 const checked=verifyFindings(documents,findings);
 const summary=summarizeCitationChecks(checked);
 if(summary.needsReviewFindings>0)throw Error('UNVERIFIED_PRIVATE_PILOT_CITATION');
 return {checked,summary};
}
