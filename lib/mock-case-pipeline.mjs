import {segmentRecord,auditSegments} from './record-chunks.mjs';
import {analyzeUnit,independentlyVerify} from './legal-evidence-review.mjs';
import {planVisualEvidence,validateVisualResult} from './visual-evidence.mjs';
import {caseModel,independentCaseAudit} from './case-reasoning.mjs';
import {crosscheckObservations} from './legal-evidence-review.mjs';
import {detectOpposingStatements} from './case-crosscheck.mjs';
export function runMockCasePipeline({caseId,documents,visualObjects=[],modelProvider,visualProvider,semanticVerifier}){
 if(!Array.isArray(documents)||!documents.length||typeof modelProvider!=='function')throw Error('INVALID_PIPELINE');
 const units=[],docCoverage={},visualCoverage={},visualPlans=[],textResults=[];
 for(const d of documents){
  if(!d.id||!Array.isArray(d.pages)||d.pages.length!==d.pageCount)throw Error('INCOMPLETE_DOCUMENT');
  const segments=segmentRecord({scope:'customer',documentId:d.id,pages:d.pages});
  const audit=auditSegments(d.pages,segments.segments);
  if(!audit.complete)throw Error('PAGE_INTEGRITY_FAILURE');
  const reviewed=segments.segments.map(analyzeUnit);
  const textAudit=independentlyVerify(segments.segments,reviewed);
  docCoverage[d.id]={complete:textAudit.complete};
  units.push(...segments.segments);textResults.push(...reviewed);
  const plan=planVisualEvidence({documentId:d.id,pages:d.pages,images:visualObjects.filter(i=>i.documentId===d.id)});
  visualPlans.push(plan);
  const response=typeof visualProvider==='function'?visualProvider(plan):null;
  visualCoverage[d.id]=response?validateVisualResult(plan,response):{complete:false,reason:'VISUAL_PROVIDER_NOT_CONNECTED'};
 }
 const crossDocumentMatches=crosscheckObservations(textResults);
 const opposingStatementCandidates=detectOpposingStatements(textResults);
 const proposals=modelProvider({caseId,documents,units,textResults,visualPlans,crossDocumentMatches,opposingStatementCandidates});
 const model=caseModel({caseId,documents,propositions:proposals});
 const receipt=typeof semanticVerifier==='function'?semanticVerifier({model,units,visualPlans}):null;
 const audit=independentCaseAudit({units,model,documentCoverage:docCoverage,visualCoverage,semanticAudit:receipt});
 return {caseId,model,units,textResults,visualPlans,crossDocumentMatches,opposingStatementCandidates,docCoverage,visualCoverage,audit,status:audit.complete?'mock_completed':'blocked',mock:true};
}
