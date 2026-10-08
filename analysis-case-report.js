import {verifyCitation} from './source-verification.js';
// Assemble a private case-analysis result without conflating source matches with truth.
// Neither analysis nor comparison may be represented as complete if any source check fails.
export function assembleCaseAnalysis(analysis,comparison){
 if(!analysis||analysis.schema!=='squidlaw-merged-analysis-v1'||!Array.isArray(analysis.findings)||!analysis.diagnostics||typeof analysis.diagnostics!=='object'||Array.isArray(analysis.diagnostics)||!Array.isArray(analysis.diagnostics.missingBatches??[]))throw Error('INVALID_ANALYSIS_RESULT');
 if(!comparison||comparison.schema!=='squidlaw-private-comparisons-v1'||!Array.isArray(comparison.comparisons)||!comparison.diagnostics||typeof comparison.diagnostics!=='object'||Array.isArray(comparison.diagnostics))throw Error('INVALID_COMPARISON_RESULT');
 if(analysis.findings.some(f=>!f||typeof f!=='object')||comparison.comparisons.some(c=>!c||typeof c!=='object'))throw Error('INVALID_REPORT_ENTRY');
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
 const validCitation=c=>!!c&&typeof c.document==='string'&&c.document.trim().length>0&&Number.isInteger(c.page)&&c.page>0&&typeof c.quote==='string'&&c.quote.normalize('NFKC').replace(/\s+/g,' ').trim().length>=8;
 const analysisReady=analysis.sourceReady===true&&(analysis.diagnostics.missingBatches??[]).length===0&&findings.length>0&&findings.every(f=>Array.isArray(f.citations)&&f.citations.length>0&&Array.isArray(f.citationChecks)&&f.citationChecks.length===f.citations.length&&f.citations.every(validCitation)&&f.citationChecks.every(c=>c?.verification?.status==='matched'));
 const comparisonReady=comparison.sourceReady===true&&comparisons.every(c=>c.sourceReady===true&&Array.isArray(c.citations)&&c.citations.length===2&&c.citations.every(x=>validCitation(x)&&x.verification?.status==='matched'));
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
 if(!Array.isArray(documents)||documents.length===0||documents.some(doc=>!doc||typeof doc!=='object'||typeof doc.name!=='string'||!doc.name.trim()||!Array.isArray(doc.pages)||doc.pages.length===0||doc.pages.some(page=>!page||typeof page!=='object'||typeof page.text!=='string')))throw Error('INVALID_DOCUMENTS');
 if(new Set(documents.map(doc=>doc.name)).size!==documents.length)throw Error('DUPLICATE_DOCUMENT_NAME');
 if(!analysis||analysis.schema!=='squidlaw-merged-analysis-v1'||!Array.isArray(analysis.findings)||!analysis.diagnostics||typeof analysis.diagnostics!=='object'||Array.isArray(analysis.diagnostics)||!Array.isArray(analysis.diagnostics.missingBatches??[]))throw Error('INVALID_ANALYSIS_RESULT');
 if(!comparison||comparison.schema!=='squidlaw-private-comparisons-v1'||!Array.isArray(comparison.comparisons)||!comparison.diagnostics||typeof comparison.diagnostics!=='object'||Array.isArray(comparison.diagnostics))throw Error('INVALID_COMPARISON_RESULT');
 // Derive omissions from the original uploaded pages, not AI-supplied diagnostics.
 const unreadableDetails=documents.flatMap(doc=>
  Array.isArray(doc?.pages)?doc.pages.flatMap((page,index)=>
   (typeof page?.text!=='string'||!page.text.trim())?
    [{document:doc.name,page:index+1,totalPages:doc.pages.length}]:[]):[]
 );
 if(analysis.findings.some(f=>!f||typeof f!=='object'||!Array.isArray(f.citations)||f.citations.some(c=>!c||typeof c!=='object'))||comparison.comparisons.some(c=>!c||typeof c!=='object'||!Array.isArray(c.citations)||c.citations.some(source=>!source||typeof source!=='object')))throw Error('INVALID_REPORT_ENTRY');
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
 const verifiedCitations=[
  ...report.findings.flatMap(f=>(f.citations||[]).filter((c,i)=>f.citationChecks?.[i]?.verification?.status==='matched')),
  ...report.comparisons.flatMap(c=>(c.citations||[]).filter(source=>source.verification?.status==='matched'))
 ];
 const citedNames=new Set(verifiedCitations.map(c=>c.document));
 const submittedNames=new Set(documents.map(doc=>doc.name));
 report.diagnostics.unknownCitationDocuments=[...new Set([
  ...report.findings.flatMap(f=>f.citations||[]),
  ...report.comparisons.flatMap(c=>c.citations||[])
 ].map(c=>c.document).filter(name=>typeof name==='string'&&!submittedNames.has(name)))];
 if(report.diagnostics.unknownCitationDocuments.length)report.notices.push('제출되지 않은 PDF 파일명을 인용한 항목이 있습니다. 해당 인용은 원문 검증에 실패했으므로 문서명과 쟁점을 확인하세요.');
 report.diagnostics.verifiedCitationCount=verifiedCitations.length;
 report.diagnostics.unverifiedCitationCount=report.findings.reduce((sum,f)=>sum+(f.citations||[]).length,0)+report.comparisons.reduce((sum,c)=>sum+(c.citations||[]).length,0)-verifiedCitations.length;
 report.diagnostics.uncitedDocuments=report.diagnostics.submittedDocuments.filter(doc=>!citedNames.has(doc.name)).map(doc=>doc.name);
 const citedPageKeys=new Set(verifiedCitations.filter(c=>typeof c.document==='string'&&Number.isInteger(c.page)).map(c=>JSON.stringify([c.document,c.page])));
 report.diagnostics.citedReadablePages=documents.reduce((count,doc)=>count+(Array.isArray(doc.pages)?doc.pages.filter((p,i)=>typeof p?.text==='string'&&p.text.trim()&&citedPageKeys.has(JSON.stringify([doc.name,i+1]))).length:0),0);
 report.diagnostics.uncitedReadablePages=report.diagnostics.readablePages-report.diagnostics.citedReadablePages;
 report.diagnostics.verifiedPageCoveragePercent=report.diagnostics.readablePages>0?Math.round(report.diagnostics.citedReadablePages/report.diagnostics.readablePages*100):0;
 report.diagnostics.totalPageCoveragePercent=report.diagnostics.totalPages>0?Math.round(report.diagnostics.citedReadablePages/report.diagnostics.totalPages*100):0;
 report.diagnostics.uncitedReadablePageDetails=documents.flatMap(doc=>Array.isArray(doc.pages)?doc.pages.flatMap((p,i)=>typeof p?.text==='string'&&p.text.trim()&&!citedPageKeys.has(JSON.stringify([doc.name,i+1]))?[{document:doc.name,page:i+1}]:[]):[]);
 if(report.diagnostics.readablePages>=4&&report.diagnostics.citedReadablePages*2<report.diagnostics.readablePages)report.notices.push('식별 가능한 PDF 페이지 중 원문 일치 인용이 확인된 페이지가 절반 미만입니다. 주요 주장과 반박의 인용 누락 여부를 확인하세요. 이는 분석 정확도 판정이 아닙니다.');
 if(report.diagnostics.uncitedDocuments.length)report.notices.push('제출 문서 중 원문 일치가 검증된 인용이 없는 파일이 있습니다. 미인용 또는 출처 불일치로 인한 주요 쟁점 누락 여부를 확인하세요.');
 // No findings or missing citation checks must never produce a verified report.
 if(report.findings.length===0)return {...report,status:'needs_source_review',diagnostics:{...report.diagnostics,analysisSourceReady:false}};
 if(unreadableDetails.length&&report.status==='source_checked'){
  report.notices.push('제출 문서 중 텍스트가 식별되지 않은 페이지가 있어 분석 범위가 일부 제한됩니다.');
  return {...report,status:'source_checked_partial'};
 }
 return report;
}
