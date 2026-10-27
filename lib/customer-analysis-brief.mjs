import {intakeForReport} from './customer-case-intake.mjs';

export const SQUIDLAW_REPORT_CLOSING='스키드로우는 분석 및 전문가(변호사 등)가 사건을 신속하게 판단하도록, 결과물을 제공하고 있으며, 채팅방에서 어떠한 법률 상담도 하지 않습니다. 자세한 사항은 전문가와 상의를 하시기 바랍니다. 감사합니다.';
const clean=x=>typeof x==='string'?x.trim():'';
const completeWithin=(value,max=500)=>{
 const raw=clean(value).replace(/\s+/g,' ');
 if(raw.length<=max)return raw;
 const head=raw.slice(0,max+1);
 const sentence=[...head.matchAll(/[.!?。](?=\\s|$)/g)].map(m=>m.index+1).filter(n=>n>=Math.floor(max*.45)&&n<=max);
 if(sentence.length)return head.slice(0,sentence.at(-1)).trim();
 const clauses=[...head.matchAll(/[,，;；]\s*|\s+/g)].map(m=>m.index).filter(n=>n>=Math.floor(max*.55)&&n<=max);
 const end=clauses.at(-1);
 return end?head.slice(0,end).trim().replace(/[,，;；]$/,'')+'…':raw.slice(0,max).replace(/\S+$/,'').trim()+'…';
};
const compact=(x,max=500)=>completeWithin(x,max);
const safeCell=x=>clean(x).replace(/\s+/g,' ').replace(/\|/g,'·')||'—';
// A concise index, not a replacement for the full arguments in chapter 2.
// Prefer a complete sentence/phrase; never leave a visibly truncated word.
const tableSummary=value=>clean(value).replace(/\s+/g,' ')||'—';
const uniqueValues=items=>[...new Set(items.map(x=>clean(x).replace(/\s+/g,' ')).filter(Boolean))];
const roleFrom=(finding)=>{
 if(finding?.party==='plaintiff'||finding?.party==='defendant')return finding.party;
 const match=/^(?:\s*)(원고|피고)(?:\s*측)?(?:은|는|가|의|[:：]|\s)/.exec(clean(finding?.claim));
 return match?.[1]==='원고'?'plaintiff':match?.[1]==='피고'?'defendant':null;
};
const importantTypes=new Set(['claim','rebuttal','admission','counterclaim','legal_element','legal_conclusion']);
const sourceTag=(ref,names)=>{
 const source=names.get(ref?.documentId);
 const name=source?.name;
 const page=Number.isSafeInteger(ref?.page)&&ref.page>0&&source?.pageCount!==null&&ref.page<=source.pageCount?ref.page+'쪽':null;
 // Never present a page number without a matching source document as a verified citation.
 return name&&page?name+' '+page:null;
};
function findGroups(findings){
 const groups=new Map();
 for(const f of findings){
  if(!f||(!clean(f.claim)&&!clean(f.analysis)))continue;
  const explicit=compact(f.issueKey||f.issue,90);
  // Older model output has no issue identifier. Keep such claims separate,
  // rather than inventing shared facts or silently assigning a party.
  const key=explicit||'unstructured:'+compact(f.claim||f.analysis,180);
  let group=groups.get(key);
  if(!group){
   group={key,title:explicit||compact(f.claim||f.analysis,260),items:[]};
   groups.set(key,group);
  }
  group.items.push(f);
 }
 return [...groups.values()];
}
const collect=(group,prop)=>uniqueValues(group.items.map(f=>f[prop]));
const partyStatement=(group,party)=>{
 const direct=collect(group,party==='plaintiff'?'plaintiffPosition':'defendantPosition');
 if(direct.length)return direct.slice(0,2).join(' / ');
 const claims=uniqueValues(group.items.filter(f=>roleFrom(f)===party).map(f=>f.claim));
 return claims.length?claims.slice(0,2).join(' / '):'원문 분석에서 주장 주체 미분류';
};
function sourceFootnote(group,names){
 const seen=new Set(),out=[];
 for(const f of group.items)for(const ref of Array.isArray(f.sources)?f.sources:[]){
  const tag=sourceTag(ref,names);
  if(tag&&!seen.has(tag)){seen.add(tag);out.push(tag)}
 }
 return out.join('; ');
}
const safeLine=(s,max=1100)=>completeWithin(s,max);
const issueTitle=x=>{
 const raw=clean(x);
 const known={
  '입장료별도약정및미지급':'입장료 별도 약정 및 미지급',
  '입장전기망과이용허용인과관계':'입장 전 기망과 이용 허용의 인과관계'
 };
 return known[raw]||raw.replace(/_/g,' ').replace(/([가-힣])및([가-힣])/g,'$1 및 $2').replace(/([가-힣])인과관계$/,'$1 인과관계');
};
const isCriminalRecord=(intake,documents)=>/고소|피고소|피의자|형사|수사/.test([intake?.caseType,intake?.caseCategory,intake?.claimRelief,...documents.map(d=>d?.name)].filter(Boolean).join(' '));
const hasText=x=>clean(x)&&x!=='원문 분석에서 주장 주체 미분류';
const position=(group,party)=>{
 const direct=partyStatement(group,party);
 if(hasText(direct))return direct;
 return party==='defendant'?'상대방 직접 주장·반박 자료 없음':'원문에서 해당 측 주장 확인 필요';
};
const inferCriminalNames=findings=>{
 const source=findings.map(f=>[f.claim,f.analysis].filter(Boolean).join(' ')).join(' ');
 const m=source.match(/고소인은\s*(?:[^,.]{0,35}?\s)?([가-힣]{2,4}),\s*피고소인은\s*([가-힣]{2,4})/);
 return m?{complainant:m[1],accused:m[2]}:{};
};
export function buildCustomerAnalysisBrief({caseRecord,report,documents=[]}){
 const intake=intakeForReport(caseRecord);
 if(!intake)throw Error('CLIENT_ROLE_REQUIRED');
 if(!report||!Array.isArray(report.findings)||!Array.isArray(documents))throw Error('INVALID_CUSTOMER_BRIEF');
 const names=new Map(documents.filter(d=>d?.id&&d.name).map(d=>[d.id,{name:compact(d.name,150),pageCount:Number.isSafeInteger(d.pageCount)&&d.pageCount>0?d.pageCount:null}]));
 const groups=findGroups(report.findings);
 // A paid whole-case report must not silently hide findings after the first eight issues.
 const selected=groups;
 const caseNumber=intake.isFiledCase?intake.courtCaseNumber||'법원 사건번호 확인 필요':'법원 미접수 사건';
 const criminal=isCriminalRecord(intake,documents);
 const inferred=criminal?inferCriminalNames(report.findings):{};
 const plaintiff=intake.plaintiffName||inferred.complainant||(criminal?'고소인 성명 확인 필요':'원고 표시 확인 필요');
 const defendant=intake.defendantName||inferred.accused||(criminal?'피고소인 성명 확인 필요':'피고 표시 확인 필요');
 const relief=intake.claimRelief||'청구취지 원문 확인 필요';
 const lines=[
  '# 사건기록 분석보고서',
  '',
  '사건번호 : '+caseNumber,
  (criminal?'고소인 : ':'원고 : ')+plaintiff,
  (criminal?'피고소인 : ':'피고 : ')+defendant,
  ...(criminal?[]:['','청구취지',safeLine(relief,2800)]),
  ''
 ];
 if(report.clientRole&&report.clientRole!==intake.clientRole)throw Error('ANALYSIS_ROLE_CHANGED');
 if(!report.clientRole)lines.push('※ 분석 당시 의뢰인 지위가 기록되지 않은 과거 보고서입니다. 현재 선택한 지위를 기준으로 분석한 결과임을 보증할 수 없습니다.','');
 if(report.notForCourtSubmission!==false||report.independentSemanticAuditPassed!==true)
  lines.push('※ 원문 및 분석 결과의 독립 검증이 완료되지 않은 초안입니다.','');
 lines.push('## 제1장. 쟁점별 양측 주장 및 증거 비교표','',
  criminal?'| 핵심 쟁점 | 고소인 주장 | 피고소인 주장 | 모순·다툼 | 증거 및 입증사항 |':'| 핵심 쟁점 | 원고 주장 | 피고 주장 | 모순·다툼 | 증거 및 입증사항 |',
  '|---|---|---|---|---|');
 if(!selected.length)lines.push('| 분석항목 없음 | 확인된 주장 없음 | 확인된 주장 없음 | 확인 필요 | 확인 필요 |');
 for(const group of selected){
  const title=safeCell(issueTitle(group.title));
  const left=position(group,'plaintiff');
  const right=position(group,'defendant');
  const conflicts=collect(group,'contradiction');
  const evidence=collect(group,'evidenceNeed');
  const leftText=left;
  const rightText=right;
  lines.push('| '+title+' | '+safeCell(tableSummary(leftText))+' | '+safeCell(tableSummary(rightText))+
   ' | '+safeCell(tableSummary(conflicts.join(' / ')||'확인된 직접 모순 없음'))+
   ' | '+safeCell(tableSummary(evidence.join(' / ')||'원문 증거 대조 필요'))+' |');
 }
 lines.push('','## 제2장. 분석','');
 const footnotes=[];
 for(const [i,group] of selected.entries()){
  const note=sourceFootnote(group,names),ref=note?'[^'+(i+1)+']':'';
  if(note)footnotes.push('[^'+(i+1)+']: '+note);
  const contradiction=collect(group,'contradiction');
  const analyses=collect(group,'analysis');
  const legalImpact=collect(group,'legalImpact');
  lines.push('### '+(i+1)+'. '+issueTitle(group.title),
   '',
   '분석 : '+(analyses.length?analyses.join(' / '):
    legalImpact.length?legalImpact.join(' / '):
    '주장과 증거의 연결에 대한 검토가 더 필요합니다.')+ref,
   '');
 }
 lines.push('## 제3장. 증거 및 원문 위치','');
 for(const [i,g] of selected.entries()){
  lines.push('### '+(i+1)+'. '+issueTitle(g.title),'',
   '원문 위치 : '+(sourceFootnote(g,names)||'출처 페이지 확인 필요'),'');
 }
 // Preserve the evidentiary difference trail in the customer-facing result.
 // Unaffected old findings are unchanged; these are only GPT-reviewed updates.
 if(report.deltaReanalysis){
  const delta=report.deltaReanalysis;
  lines.push('### 신규 증거에 따른 변경 내역','',
   '추가 문서 : '+(delta.addedDocuments||[]).map(item=>{const id=typeof item==='string'?item:item?.id;return names.get(id)?.name||item?.name||id||'문서명 확인 필요'}).join(', '),
   '기존 분석 중 재검토 : '+Number(delta.changedFindings||0)+'건 / 변경 없이 유지 : '+
    Number(delta.unchangedFindings||0)+'건 / 신규 분석 : '+Number(delta.newFindings||0)+'건','');
  for(const [i,change] of (delta.changes||[]).entries()){
   const locations=refs=>[...new Set((Array.isArray(refs)?refs:[]).map(r=>sourceTag(r,names)).filter(Boolean))].join('; ')||'원문 위치 확인 필요';
   lines.push('**변경 '+(i+1)+'.** '+(/[가-힣]/.test(clean(change.reason))?safeLine(change.reason,600):'신규 증거에 따라 기존 판단의 사실관계와 법률적 영향을 재검토했습니다. 아래 기존·변경 판단을 비교해 주세요.'),
    '기존 판단 : '+safeLine(change.oldClaim,600),
    '변경 판단 : '+safeLine(change.newClaim,600),
    '기존 근거 : '+locations(change.oldSources),
    '추가·변경 근거 : '+locations(change.newSources),'');
  }
 }
 if(footnotes.length)lines.push('### 증거 위치','',...footnotes,'');
 lines.push('## 제4장. 종합 판단 및 핵심 확인사항','');
 for(const [i,g] of selected.entries()){
  const impact=collect(g,'legalImpact');
  const analysis=collect(g,'analysis');
  lines.push('### '+(i+1)+'. '+issueTitle(g.title),'',
   '판단 : '+(impact.join(' / ')||analysis.at(-1)||'현재 자료만으로 판단 확정 불가'),'');
 }
 const keywords=(Array.isArray(report.legalSearchKeywords)?report.legalSearchKeywords:[]).filter(x=>typeof x==='string'&&x.trim()).slice(0,3);
 if(report.analysisEngineVersion==='gpt-6-claims-v1'&&keywords.length===3)lines.push('',keywords.map(x=>'#'+x.trim().replace(/\s+/g,'_')).join('  '));
 lines.push('',SQUIDLAW_REPORT_CLOSING);
 return {title:'사건기록 분석보고서',clientRole:intake.clientRole,chapterCount:4,text:lines.join('\n'),
  displayedIssues:selected.length,undisplayedIssues:Math.max(0,groups.length-selected.length),
  sourceReferenceCount:footnotes.length,requiresSourceReview:report.notForCourtSubmission!==false||
   report.independentSemanticAuditPassed!==true};
}
