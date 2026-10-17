/** Lightweight report follow-up: search verified saved findings only, never run legal AI. */
export function findReportEvidence(report,question,{limit=6}={}){
 const q=String(question||'').trim();
 if(q.length<2||q.length>500)throw Error('INVALID_REPORT_QUESTION');
 const terms=[...new Set((q.toLowerCase().match(/[가-힣a-z0-9]{2,}/g)||[]).filter(x=>x.length>1))].slice(0,16);
 if(!terms.length)return {matches:[],notice:'검색 가능한 핵심어가 없습니다.'};
 const rows=Array.isArray(report?.findings)?report.findings:[];
 const matches=rows.map((finding,index)=>{
  const text=JSON.stringify(finding??{});
  const hay=text.toLowerCase();
  const score=terms.reduce((n,term)=>n+(hay.includes(term)?1:0),0);
  return {index,finding,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,Math.min(10,Math.max(1,limit)));
 return {matches,notice:matches.length?'저장된 분석보고서에서 찾은 관련 항목입니다. 새 법률 판단이 아닙니다.':'저장된 보고서에서 일치 항목을 찾지 못했습니다. 미검토 자료에 대한 결론은 아닙니다.'};
}
