// Verify every comparison lead against the original uploaded page text.
// An unverified lead must never be presented as a confirmed source match.
import {buildCrossDocumentLeads} from './analysis-cross-document.js';
import {verifyCitation} from './source-verification.js';

export function buildVerifiedComparisonReport(documents,options={}){
 const comparison=buildCrossDocumentLeads(documents,options);
 const leads=comparison.leads.map(lead=>{
  const checks=lead.sources.map(source=>({
   document:source.document,page:source.page,
   verification:verifyCitation(documents,source)
  }));
  return {...lead,checks,sourceReady:checks.length===2&&checks.every(c=>c.verification.status==='matched')};
 });
 return {
  schema:'squidlaw-verified-comparison-v1',
  kind:'reference-co-mentions-not-contradictions',
  leads,
  diagnostics:{
   total:leads.length,
   sourceMatched:leads.filter(l=>l.sourceReady).length,
   needsReview:leads.filter(l=>!l.sourceReady).length,
   truncated:comparison.truncated
  }
 };
}
