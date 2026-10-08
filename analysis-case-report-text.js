// Plain-text, copyable case report. No HTML or model calls.
const relations={
 conflict_candidate:'충돌 가능성 검토',
 different_positions:'서로 다른 입장',
 insufficient_information:'자료 부족'
};
const status=x=>x==='matched'?'원문 일치':'출처 확인 필요';
export function formatCaseReportText(report){
 if(!report||report.schema!=='squidlaw-case-analysis-v1'||!Array.isArray(report.findings)||!Array.isArray(report.comparisons))throw Error('INVALID_CASE_REPORT');
 const lines=['SQUID LAW · 사건자료 분석 보고서','',report.status==='source_checked'?'출처 검산: 원문 일치':'출처 검산: 확인 필요',''];
 lines.push('1. 원문 기반 분석 항목 ('+report.findings.length+'건)');
 if(!report.findings.length)lines.push('분석 항목 없음');
 for(const [i,f] of report.findings.entries()){
  lines.push('',(i+1)+'. '+String(f.title||'제목 없음'));
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
 lines.push('','4. 검토 안내');
 for(const notice of Array.isArray(report.notices)?report.notices:[])lines.push('- '+String(notice));
 lines.push('- 원문 인용 확인은 사실관계 및 법적 판단의 정확성을 보증하지 않습니다.');
 return lines.join('\n')+'\n';
}
