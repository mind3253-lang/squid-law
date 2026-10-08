// Plain-text, copyable case report. No HTML or model calls.
const relations={
 conflict_candidate:'충돌 가능성 검토',
 different_positions:'서로 다른 입장',
 insufficient_information:'자료 부족'
};
const status=x=>x==='matched'?'원문 일치':'출처 확인 필요';
export function formatCaseReportText(report){
 if(!report||report.schema!=='squidlaw-case-analysis-v1'||!Array.isArray(report.findings)||!Array.isArray(report.comparisons))throw Error('INVALID_CASE_REPORT');
 const lines=['SQUID LAW · 사건자료 분석 보고서','',report.status==='source_checked'?'출처 검산: 원문 일치':report.status==='source_checked_partial'?'출처 검산: 일부 페이지 미식별':'출처 검산: 확인 필요',''];
 const documents=new Set();
 for(const f of report.findings)for(const c of Array.isArray(f.citations)?f.citations:[])if(c.document)documents.add(c.document);
 for(const c of report.comparisons)for(const source of Array.isArray(c.citations)?c.citations:[])if(source.document)documents.add(source.document);
 const sourcePages=new Set();
 let citationCount=0,matchedCount=0,unmatchedCount=0;
 for(const f of report.findings)for(const [index,c] of (Array.isArray(f.citations)?f.citations:[]).entries()){
  citationCount++;
  sourcePages.add(JSON.stringify([c.document,c.page]));
  if(f.citationChecks?.[index]?.verification?.status==='matched')matchedCount++;else unmatchedCount++;
 }
 for(const c of report.comparisons)for(const source of Array.isArray(c.citations)?c.citations:[]){
  citationCount++;
  sourcePages.add(JSON.stringify([source.document,source.page]));
  if(source.verification?.status==='matched')matchedCount++;else unmatchedCount++;
 }
 lines.push('분석에서 인용된 문서: '+documents.size+'개');
 lines.push('분석에서 인용된 서로 다른 원문 페이지: '+sourcePages.size+'쪽');
 if(documents.size)for(const name of documents)lines.push('  · '+name);
 lines.push('');
 lines.push('1. 원문 기반 분석 항목 ('+report.findings.length+'건)');
 if(!report.findings.length)lines.push('분석 항목 없음');
 for(const [i,f] of report.findings.entries()){
  lines.push('',(i+1)+'. '+String(f.title||'제목 없음'));
  if(typeof f.analysis==='string'&&f.analysis.trim())lines.push('   쟁점 검토: '+f.analysis);
  else lines.push('   쟁점 검토: 별도 설명 없음 · 원문 인용만 제공');
  for(const [key,label] of [['claim','주장'],['evidence','근거'],['rebuttal','반박·반증'],['proofGap','추가 입증사항']]){
   if(typeof f[key]==='string'&&f[key].trim())lines.push('   '+label+': '+f[key]);
   else if(Object.hasOwn(f,key))lines.push('   '+label+': 제출 자료에서 별도 확인되지 않음');
  }
  if(f.citations?.length>1)lines.push('   복수 출처: '+f.citations.length+'건 · 각 출처의 주장 주체와 의미를 대조하세요.');
  const citations=Array.isArray(f.citations)?f.citations:[];
  if(!citations.length)lines.push('   출처 없음 · 확인 필요');
  citations.forEach((c,j)=>{
   const check=f.citationChecks?.[j]?.verification?.status;
   lines.push('   출처: '+String(c.document||'문서 미상')+' · '+String(c.page||'?')+'쪽 · '+status(check));
   lines.push('   인용: '+String(c.quote||''));
  });
 }
 lines.push('','2. 서면 간 비교 후보 ('+report.comparisons.length+'건)');
 if(!report.comparisons.length)lines.push('비교 후보 없음');
 for(const [i,c] of report.comparisons.entries()){
  lines.push('',(i+1)+'. '+String(c.reference||'공통 번호 없음')+' · '+(relations[c.relation]||'분류 확인 필요'));
  lines.push('   비교 해석: '+String(c.explanation||'해석 없음'));
  for(const source of Array.isArray(c.citations)?c.citations:[]){
   lines.push('   출처: '+String(source.document||'문서 미상')+' · '+String(source.page||'?')+'쪽 · '+status(source.verification?.status));
   lines.push('   인용: '+String(source.quote||''));
  }
 }
 const skipped=Array.isArray(report.diagnostics?.unreadableDetails)?report.diagnostics.unreadableDetails:[];
 if(skipped.length){
  lines.push('','3. 식별되지 않은 페이지 안내');
  const grouped=new Map();
  for(const item of skipped){
   if(!item||typeof item.document!=='string'||!Number.isInteger(item.page))continue;
   const key=item.document+'\\u0000'+item.totalPages;
   if(!grouped.has(key))grouped.set(key,{document:item.document,totalPages:item.totalPages,pages:[]});
   grouped.get(key).pages.push(item.page);
  }
  for(const item of grouped.values())lines.push('귀하가 제출한 「'+item.document+'」 총 '+item.totalPages+'페이지 중 '+item.pages.join(', ')+'페이지는 내용을 식별할 수 없어 해당 페이지를 제외하고 분석하였습니다. 중요한 내용이 포함된 페이지라면 해상도가 높은 파일로 다시 제출해 주시기 바랍니다.');
 }
 lines.push('','4. 통합 검토 요약');
 const relationCounts={conflict_candidate:0,different_positions:0,insufficient_information:0};
 for(const comparison of report.comparisons)if(Object.hasOwn(relationCounts,comparison.relation))relationCounts[comparison.relation]++;
 lines.push('- 충돌 가능성 검토: '+relationCounts.conflict_candidate+'건');
 lines.push('- 서로 다른 입장: '+relationCounts.different_positions+'건');
 lines.push('- 판단 자료 부족: '+relationCounts.insufficient_information+'건');
 const missing=Array.isArray(report.diagnostics?.missingBatches)?report.diagnostics.missingBatches:[];
 if(missing.length)lines.push('- 결과가 누락된 분석 묶음: '+missing.join(', '));
 lines.push('- AI 분석 항목: '+report.findings.length+'건');
 const explained=report.findings.filter(f=>typeof f.analysis==='string'&&f.analysis.trim()).length;
 lines.push('- 쟁점별 설명 포함: '+explained+'건');
 lines.push('- 쟁점별 설명 누락: '+(report.findings.length-explained)+'건');
 const sectionKeys=[['claim','주장'],['evidence','근거'],['rebuttal','반박·반증'],['proofGap','추가 입증사항']];
 for(const [key,label] of sectionKeys){
  const filled=report.findings.filter(f=>typeof f[key]==='string'&&f[key].trim()).length;
  lines.push('- '+label+' 기재 항목: '+filled+'건');
  lines.push('- '+label+' 미기재 항목: '+(report.findings.length-filled)+'건');
 }
 const withRebuttal=report.findings.filter(f=>typeof f.rebuttal==='string'&&f.rebuttal.trim());
 const withGap=report.findings.filter(f=>typeof f.proofGap==='string'&&f.proofGap.trim());
 if(withRebuttal.length){
  lines.push('','반박·반증이 확인된 쟁점');
  for(const f of withRebuttal)lines.push('· '+String(f.title||'제목 없음')+': '+f.rebuttal);
 }
 if(withGap.length){
  lines.push('','추가 입증 검토가 필요한 쟁점');
  for(const f of withGap)lines.push('· '+String(f.title||'제목 없음')+': '+f.proofGap);
 }
 if(explained<report.findings.length)lines.push('- 설명이 누락된 항목은 제목과 원문 인용만 제공됩니다.');
 lines.push('- 출처 인용 총수: '+citationCount+'건');
 lines.push('- 원문 일치 인용: '+matchedCount+'건');
 lines.push('- 원문 확인 필요 인용: '+unmatchedCount+'건');
 const unverifiedFindings=report.findings.filter(f=>!Array.isArray(f.citationChecks)||f.citationChecks.length!==(Array.isArray(f.citations)?f.citations.length:0)||f.citationChecks.some(c=>c.verification?.status!=='matched')).length;
 lines.push('- 인용 확인이 필요한 분석 항목: '+unverifiedFindings+'건');
 const unverifiedComparisons=report.comparisons.filter(c=>c.sourceReady!==true).length;
 lines.push('- 출처 확인이 필요한 비교 후보: '+unverifiedComparisons+'건');
 lines.push('- 서면 간 비교 후보: '+report.comparisons.length+'건');
 lines.push('- 식별되지 않은 페이지: '+skipped.length+'쪽');
 lines.push('- 출처 검산 상태: '+(report.status==='source_checked'?'전체 일치':report.status==='source_checked_partial'?'확인된 인용은 일치하나 일부 페이지 미식별':'추가 확인 필요'));
 if(!report.comparisons.length)lines.push('- 공통 증거번호 기반 비교 후보가 없습니다. 이는 서면 사이에 모순이 없다는 뜻이 아닙니다.');
 if(report.diagnostics?.comparisonSourceReady!==true)lines.push('- 서면 비교 출처 검산이 완료되지 않았으므로 통합보고서 전체를 검증 완료로 표시하지 않습니다.');
 if(report.diagnostics?.analysisSourceReady!==true)lines.push('- 분석 인용의 출처 검산이 완료되지 않았습니다.');
 lines.push('- 이 보고서에서 확인하지 못한 법률 쟁점, 반박 논리 및 유불리 판단을 임의로 생성하지 않았습니다.');
 lines.push('- 본 보고서의 문서 수는 인용된 문서 수이며, 제출된 전체 PDF 수를 뜻하지 않습니다.');
 lines.push('- AI 분석 항목은 출처가 확인된 주장 및 쟁점의 목록이며, 모든 법률 쟁점의 누락 없는 검토를 뜻하지 않습니다.');
 if(skipped.length)lines.push('- 읽지 못한 페이지는 분석 대상에서 제외되었으므로 중요한 주장·반증이 누락되었을 수 있습니다.');
 if(unmatchedCount)lines.push('- 원문 확인이 필요한 인용은 보고서에 기재된 원본 PDF 페이지와 직접 대조하세요.');
 if(missing.length)lines.push('- 누락된 분석 묶음이 있으므로 일부 사건기록은 분석 결과에 반영되지 않았을 수 있습니다.');
 if(!report.findings.length)lines.push('- 확인 가능한 분석 항목이 없습니다. 자료 부족 또는 AI 출력 누락 여부를 점검하세요.');
 if(!documents.size)lines.push('- 인용된 문서가 없으므로 제출 문서의 분석 범위를 확인할 수 없습니다.');
 if(relationCounts.conflict_candidate)lines.push('- 충돌 가능성은 주장 간 비교 후보이며 허위 진술 또는 증거 조작을 의미하지 않습니다.');
 lines.push('','5. 검토 안내');
 for(const notice of Array.isArray(report.notices)?report.notices:[])lines.push('- '+String(notice));
 lines.push('- 원문 인용 확인은 사실관계 및 법적 판단의 정확성을 보증하지 않습니다.');
 return lines.join('\n')+'\n';
}
