import {verifyCitation} from './source-verification.js';
// Assemble a private case-analysis result without conflating source matches with truth.
// Neither analysis nor comparison may be represented as complete if any source check fails.
export function assembleCaseAnalysis(analysis,comparison){
 if(!analysis||analysis.schema!=='squidlaw-merged-analysis-v1'||!Array.isArray(analysis.findings)||!analysis.diagnostics)throw Error('INVALID_ANALYSIS_RESULT');
 if(!comparison||comparison.schema!=='squidlaw-private-comparisons-v1'||!Array.isArray(comparison.comparisons)||!comparison.diagnostics)throw Error('INVALID_COMPARISON_RESULT');
 const findings=analysis.findings.map(f=>({
  title:f.title,
  citations:f.citations,
  citationChecks:f.citationChecks
 }));
 const comparisons=comparison.comparisons.map(c=>({
  reference:c.reference,
  relation:c.relation,
  explanation:c.explanation,
  citations:c.citations,
  sourceReady:c.sourceReady===true
 }));
 const analysisReady=analysis.sourceReady===true&&findings.every(f=>Array.isArray(f.citationChecks)&&f.citationChecks.length>0&&f.citationChecks.every(c=>c.verification?.status==='matched'));
 const comparisonReady=comparison.sourceReady===true&&comparisons.every(c=>c.sourceReady===true&&Array.isArray(c.citations)&&c.citations.length===2&&c.citations.every(x=>x.verification?.status==='matched'));
 return {
  schema:'squidlaw-case-analysis-v1',
  status:analysisReady&&comparisonReady?'source_checked':'needs_source_review',
  findings,comparisons,
  diagnostics:{
   findings:findings.length,
   comparisons:comparisons.length,
   missingBatches:analysis.diagnostics.missingBatches??[],
   unreadableDetails:analysis.diagnostics.unreadableDetails??[],
   analysisSourceReady:analysisReady,
   comparisonSourceReady:comparisonReady
  },
  notices:[
   '원문 일치는 인용 문구가 업로드된 텍스트에 있다는 뜻이며, 사실의 진위 또는 법적 결론을 증명하지 않습니다.',
   'AI가 제시한 주장 차이와 충돌 가능성은 사람의 검토가 필요한 해석 후보입니다.'
  ]
 };
}

/**
 * Recheck every final-report citation against original uploaded page text.
 * Previously stored verification flags are untrusted at the export boundary.
 */
export function assembleVerifiedCaseAnalysis(documents,analysis,comparison){
 if(!Array.isArray(documents))throw Error('INVALID_DOCUMENTS');
 if(!analysis||!Array.isArray(analysis.findings))throw Error('INVALID_ANALYSIS_RESULT');
 if(!comparison||!Array.isArray(comparison.comparisons))throw Error('INVALID_COMPARISON_RESULT');
 // Derive omissions from the original uploaded pages, not AI-supplied diagnostics.
 const unreadableDetails=documents.flatMap(doc=>
  Array.isArray(doc?.pages)?doc.pages.flatMap((page,index)=>
   typeof page?.text==='string'&&!page.text.trim()?
    [{document:doc.name,page:index+1,totalPages:doc.pages.length}]:[]):[]
 );
 const checkedAnalysis={...analysis,diagnostics:{...analysis.diagnostics,unreadableDetails},findings:analysis.findings.map(f=>{
  const citations=Array.isArray(f.citations)?f.citations:[];
  return {...f,citations,citationChecks:citations.map(c=>({verification:verifyCitation(documents,c)}))};
 })};
 const checkedComparison={...comparison,comparisons:comparison.comparisons.map(c=>{
  const citations=Array.isArray(c.citations)?c.citations:[];
  const verified=citations.map(source=>({...source,verification:verifyCitation(documents,source)}));
  return {...c,citations:verified,sourceReady:verified.length===2&&verified.every(x=>x.verification.status==='matched')};
 })};
 const report=assembleCaseAnalysis(checkedAnalysis,checkedComparison);
 if(unreadableDetails.length&&report.status==='source_checked')return {...report,status:'source_checked_partial'};
 // A zero-finding analysis must never pass a vacuous every() check.
 if(report.findings.length===0)return {...report,status:'needs_source_review',diagnostics:{...report.diagnostics,analysisSourceReady:false}};
 return report;
}
