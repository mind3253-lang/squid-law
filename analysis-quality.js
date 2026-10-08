// Evaluate citation integrity for any structured analysis output.
// Only exact source matching is checked. No legal or factual truth is inferred.
export function summarizeCitationChecks(checked){
 const summary={findings:0,verifiedFindings:0,needsReviewFindings:0,citations:0,matched:0,unmatched:0,missingCitations:0,byStatus:{}};
 for(const f of checked||[]){
  summary.findings++;
  const checks=Array.isArray(f?.citationChecks)?f.citationChecks:[];
  const countMismatch=Array.isArray(f?.citations)&&f.citations.length!==checks.length;
  if(!checks.length){summary.missingCitations++;summary.needsReviewFindings++;continue;}
  let allMatched=!countMismatch;
  for(const c of checks){
   const status=c?.verification?.status||'invalid';
   summary.citations++;
   summary.byStatus[status]=(summary.byStatus[status]||0)+1;
   if(status==='matched')summary.matched++;
   else{summary.unmatched++;allMatched=false;}
  }
  if(allMatched)summary.verifiedFindings++;
  else summary.needsReviewFindings++;
 }
 return summary;
}
export function isSourceReadyForReview(checked){
 const result=summarizeCitationChecks(checked);
 return result.findings>0&&result.needsReviewFindings===0;
}
