// Human-readable first artifact derived only from the local preliminary PDF index.
const clean=value=>String(value??'').replace(/[\r\n\t]+/g,' ').trim();
const location=x=>`p.${x?.source?.page??'?'}`;
export function formatGabiaFirstReport(report){
 if(report?.kind!=='gabia_first_result'||report?.status!=='preliminary_unverified')throw Error('INVALID_FIRST_REPORT');
 const lines=[
 '# PDF 1차 분석 결과 (예비·미검증)',
 '',
 '> 자동 텍스트 추출 및 규칙 기반 색인 결과입니다. AI 법률 추론·OCR·독립 의미 검증이 수행되지 않았으며 법원 제출용이 아닙니다.',
 '',
 `- 원본 SHA-256: ${clean(report.sourceSha256)}`,
 `- 총 페이지: ${report.pageCount} / 추출 페이지: ${report.extractedPages}`,
 `- 텍스트 검증: ${report.textAudit?.complete?'완료':'미완료'}`,
 `- 이미지/OCR 추가 검토 필요: ${(report.ocrRequiredPages||[]).join(', ')||'텍스트 미추출 페이지 없음 (시각자료 검증과 별개)'}`,
 '',
 '## 주장·항변 후보 (원문 위치)',
 ];
 const candidates=Array.isArray(report.claimCandidates)?report.claimCandidates:[];
 if(!candidates.length)lines.push('텍스트에서 규칙에 일치하는 후보를 찾지 못했습니다.');
 for(const item of candidates.slice(0,100))lines.push(`- ${location(item)}: ${clean(item.text||item.value||item.statement).slice(0,350)} [자동 후보·미확인]`);
 lines.push('','## 날짜·금액 관련 관찰 (원문 위치)');
 const observations=Array.isArray(report.observations)?report.observations:[];
 if(!observations.length)lines.push('자동으로 추출된 관찰 항목이 없습니다.');
 for(const item of observations.slice(0,100))lines.push(`- ${location(item)}: ${clean(item.text).slice(0,350)} [미검증]`);
 lines.push('','## 후속 검토','원문과 페이지별로 대조하고, 이미지·스캔 페이지를 별도로 검토한 뒤 법률 분석을 진행해야 합니다.');
 return lines.join('\n')+'\n';
}
