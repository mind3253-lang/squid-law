// Synthetic-case evaluation: checks required concepts and forbidden claims.
// This is a deterministic regression harness, NOT a measure of legal correctness.
export function evaluateAnalysisFixture(result,fixture){
 if(!result||result.schema!=='squidlaw-merged-analysis-v1'||!Array.isArray(result.findings))throw Error('INVALID_ANALYSIS_RESULT');
 if(!fixture||!Array.isArray(fixture.requiredTerms)||!Array.isArray(fixture.forbiddenTerms))throw Error('INVALID_EVALUATION_FIXTURE');
 const text=result.findings.map(f=>f.title).join('\n');
 const missingRequired=fixture.requiredTerms.filter(t=>typeof t!=='string'||!t||!text.includes(t));
 const presentForbidden=fixture.forbiddenTerms.filter(t=>typeof t==='string'&&t&&text.includes(t));
 const unverified=result.findings.filter(f=>!Array.isArray(f.citationChecks)||!f.citationChecks.length||f.citationChecks.some(c=>c.verification?.status!=='matched')).length;
 return {
  fixture:fixture.id||'unnamed',
  passed:result.sourceReady===true&&missingRequired.length===0&&presentForbidden.length===0&&unverified===0,
  sourceReady:result.sourceReady===true,
  missingRequired,presentForbidden,unverified,
  findingCount:result.findings.length
 };
}
