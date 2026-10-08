import {verifyCitation} from './source-verification.js';
// Assemble a private case-analysis result without conflating source matches with truth.
// Neither analysis nor comparison may be represented as complete if any source check fails.
export function assembleCaseAnalysis(analysis,comparison){
 if(!analysis||analysis.schema!=='squidlaw-merged-analysis-v1'||!Array.isArray(analysis.findings)||!analysis.diagnostics)throw Error('INVALID_ANALYSIS_RESULT');
 if(!comparison||comparison.schema!=='squidlaw-private-comparisons-v1'||!Array.isArray(comparison.comparisons)||!comparison.diagnostics)throw Error('INVALID_COMPARISON_RESULT');
 const findings=analysis.findings.map(f=>({
  title:f.title,
  ...(typeof f.analysis==='string'?{analysis:f.analysis}:{}),
  ...Object.fromEntries(['claim','evidence','rebuttal','proofGap'].filter(k=>typeof f[k]==='string').map(k=>[k,f[k]])),
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
 const analysisReady=analysis.sourceReady===true&&(!Array.isArray(analysis.diagnostics.missingBatches)||analysis.diagnostics.missingBatches.length===0)&&findings.length>0&&findings.every(f=>Array.isArray(f.citations)&&f.citations.length>0&&Array.isArray(f.citationChecks)&&f.citationChecks.length===f.citations.length&&f.citationChecks.every(c=>c.verification?.status==='matched'));
 const comparisonReady=comparison.sourceReady===true&&comparisons.every(c=>c.sourceReady===true&&Array.isArray(c.citations)&&c.citations.length===2&&c.citations.every(x=>x.verification?.status==='matched'));
 return {
  schema:'squidlaw-case-analysis-v1',
  status:analysisReady&&comparisonReady?'source_checked':'needs_source_review',
  findings,comparisons,
  diagnostics:{
   findings:findings.length,
   comparisons:comparisons.length,
   missingBatches:analysis.diagnostics.missingBatches??[],
   analysisFindingsPresent:findings.length>0,
   unreadableDetails:analysis.diagnostics.unreadableDetails??[],
   analysisSourceReady:analysisReady,
   comparisonSourceReady:comparisonReady,
   comparisonNotPerformed:comparisons.length===0
  },
  notices:[
   ...(comparisons.length===0?['공통 증거번호 기반 서면 비교를 수행하지 않았습니다. 서로 다른 주장이나 모순이 없다는 결론이 아닙니다.']:[]),
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
 report.diagnostics.submittedDocuments=documents.map(doc=>({name:doc.name,pageCount:Array.isArray(doc.pages)?doc.pages.length:0}));
 report.diagnostics.readablePages=documents.reduce((sum,doc)=>sum+(Array.isArray(doc.pages)?doc.pages.filter(p=>typeof p?.text==='string'&&p.text.trim()).length:0),0);
 report.diagnostics.unreadablePages=unreadableDetails.length;
 report.diagnostics.totalPages=report.diagnostics.readablePages+unreadableDetails.length;
 const citedNames=new Set([...report.findings.flatMap(f=>f.citations||[]),...report.comparisons.flatMap(c=>c.citations||[])].map(c=>c.document));
 report.diagnostics.uncitedDocuments=report.diagnostics.submittedDocuments.filter(doc=>!citedNames.has(doc.name)).map(doc=>doc.name);
 const citedPageKeys=new Set([...report.findings.flatMap(f=>f.citations||[]),...report.comparisons.flatMap(c=>c.citations||[])].filter(c=>typeof c.document==='string'&&Number.isInteger(c.page)).map(c=>JSON.stringify([c.document,c.page])));
 report.diagnostics.citedReadablePages=documents.reduce((count,doc)=>count+(Array.isArray(doc.pages)?doc.pages.filter((p,i)=>typeof p?.text==='string'&&p.text.trim()&&citedPageKeys.has(JSON.stringify([doc.name,i+1]))).length:0),0);
 report.diagnostics.uncitedReadablePages=report.diagnostics.readablePages-report.diagnostics.citedReadablePages;
 report.diagnostics.uncitedReadablePageDetails=documents.flatMap(doc=>Array.isArray(doc.pages)?doc.pages.flatMap((p,i)=>typeof p?.text==='string'&&p.text.trim()&&!citedPageKeys.has(JSON.stringify([doc.name,i+1]))?[{document:doc.name,page:i+1}]:[]):[]);
 if(report.diagnostics.uncitedDocuments.length)report.notices.push('제출 문서 중 최종 보고서에 인용되지 않은 파일이 있습니다. 해당 자료의 주요 쟁점 누락 여부를 확인하세요.');
 // No findings or missing citation checks must never produce a verified report.
 if(report.findings.length===0)return {...report,status:'needs_source_review',diagnostics:{...report.diagnostics,analysisSourceReady:false}};
 if(unreadableDetails.length&&report.status==='source_checked'){
  report.notices.push('제출 문서 중 텍스트가 식별되지 않은 페이지가 있어 분석 범위가 일부 제한됩니다.');
  return {...report,status:'source_checked_partial'};
 }
 return report;
}
