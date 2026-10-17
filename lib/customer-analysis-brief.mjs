import {intakeForReport} from './customer-case-intake.mjs';

export const SQUIDLAW_REPORT_CLOSING='스키드로우는 분석 및 전문가(변호사 등)가 사건을 신속하게 판단하도록, 결과물을 제공하고 있으며, 채팅방에서 어떠한 법률 상담도 하지 않습니다. 자세한 사항은 전문가와 상의를 하시기 바랍니다. 감사합니다.';
const clean=x=>typeof x==='string'?x.trim():'';
const compact=(x,max=500)=>clean(x).replace(/\s+/g,' ').slice(0,max);
const safeCell=x=>compact(x,260).replace(/\|/g,'·').replace(/[\r\n]+/g,' ')||'—';
const uniqueValues=items=>[...new Set(items.map(x=>compact(x,550)).filter(Boolean))];
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
  if(!f||!importantTypes.has(f.type)||!clean(f.claim))continue;
  const explicit=compact(f.issueKey||f.issue,90);
  // Older model output has no issue identifier. Keep such claims separate,
  // rather than inventing shared facts or silently assigning a party.
  const key=explicit||'unstructured:'+compact(f.claim,75);
  let group=groups.get(key);
  if(!group){
   group={key,title:explicit||compact(f.claim,70),items:[]};
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
 return claims.length?claims.slice(0,2).join(' / ').slice(0,400):'원문 분석에서 주장 주체 미분류';
};
function sourceFootnote(group,names){
 const seen=new Set(),out=[];
 for(const f of group.items)for(const ref of Array.isArray(f.sources)?f.sources:[]){
  const tag=sourceTag(ref,names);
  if(tag&&!seen.has(tag)){seen.add(tag);out.push(tag)}
 }
 return out.join('; ');
}
const safeLine=(s,max=1100)=>clean(s).slice(0,max);
export function buildCustomerAnalysisBrief({caseRecord,report,documents=[]}){
 const intake=intakeForReport(caseRecord);
 if(!intake)throw Error('CLIENT_ROLE_REQUIRED');
 if(!report||!Array.isArray(report.findings)||!Array.isArray(documents))throw Error('INVALID_CUSTOMER_BRIEF');
 const names=new Map(documents.filter(d=>d?.id&&d.name).map(d=>[d.id,{name:compact(d.name,150),pageCount:Number.isSafeInteger(d.pageCount)&&d.pageCount>0?d.pageCount:null}]));
 const groups=findGroups(report.findings);
 // A paid whole-case report must not silently hide findings after the first eight issues.
 const selected=groups;
 const caseNumber=intake.isFiledCase?intake.courtCaseNumber||'법원 사건번호 확인 필요':'법원 미접수 사건';
 const plaintiff=intake.plaintiffName||'원고 표시 확인 필요';
 const defendant=intake.defendantName||'피고 표시 확인 필요';
 const relief=intake.claimRelief||'청구취지 원문 확인 필요';
 const lines=[
  '# 사건기록 분석보고서',
  '',
  '사건번호 : '+caseNumber,
  '원고 : '+plaintiff,
  '피고 : '+defendant,
  '의뢰인 : '+intake.clientRoleLabel,
  '',
  '청구취지',
  safeLine(relief,2800),
  ''
 ];
 if(report.clientRole&&report.clientRole!==intake.clientRole)throw Error('ANALYSIS_ROLE_CHANGED');
 if(!report.clientRole)lines.push('※ 분석 당시 의뢰인 지위가 기록되지 않은 과거 보고서입니다. 현재 선택한 지위를 기준으로 분석한 결과임을 보증할 수 없습니다.','');
 if(report.notForCourtSubmission!==false||report.independentSemanticAuditPassed!==true)
  lines.push('※ 원문 및 분석 결과의 독립 검증이 완료되지 않은 초안입니다.','');
 lines.push('## 제1장. 쟁점 도표 정리','',
  '| 핵심 쟁점 | 원고 주장 요지 | 피고 주장 요지 | 핵심 입증사항 |',
  '|---|---|---|---|');
 if(!selected.length)lines.push('| 분석항목 없음 | 원문 확인 필요 | 원문 확인 필요 | 검증된 주장 자료 없음 |');
 for(const group of selected){
  const plaintiff=partyStatement(group,'plaintiff');
  const defendant=partyStatement(group,'defendant');
  const focus=collect(group,'evidenceNeed').at(0)||'계약·입금·진술 원문 대조';
  // The table is an index. Full plaintiff/defendant positions belong in Chapter 2.
  lines.push('| '+[group.title,plaintiff.slice(0,95),defendant.slice(0,95),focus.slice(0,110)].map(safeCell).join(' | ')+' |');
 }
 lines.push('','## 제2장. 분석','');
 const footnotes=[];
 for(const [i,group] of selected.entries()){
  const note=sourceFootnote(group,names),ref=note?'[^'+(i+1)+']':'';
  if(note)footnotes.push('[^'+(i+1)+']: '+note);
  const contradiction=collect(group,'contradiction');
  const analyses=collect(group,'analysis');
  const legalImpact=collect(group,'legalImpact');
  lines.push('### '+(i+1)+'. '+group.title,
   '',
   '원고 : '+partyStatement(group,'plaintiff'),
   '',
   '피고 : '+partyStatement(group,'defendant'),
   '',
   '모순 : '+(contradiction.length?contradiction.join(' / '):
    '직접 확인된 모순 없음 (단순 주장 차이는 별개).'),
   '',
   '분석 : '+(analyses.length?analyses.join(' / '):
    legalImpact.length?legalImpact.join(' / '):
    '주장과 증거의 연결에 대한 검토가 더 필요합니다.')+ref,
   '');
 }
 lines.push('## 제3장. 의뢰인 중심 분석 결과 및 보완사항','');
 const client=intake.clientRole;
 const opponent=client==='plaintiff'?'defendant':'plaintiff';
 const clientLabel=intake.clientRoleLabel;
 const opponentLabel=opponent==='plaintiff'?'원고':'피고';
 const selfContradictions=selected.filter(g=>g.items.some(f=>
  f.contradictionOwner===client&&clean(f.contradiction)));
 const against=selected.filter(g=>g.items.some(f=>
  roleFrom(f)===opponent||clean(f[opponent+'Position'])));
 if(!selected.length)lines.push('검토 가능한 쟁점이 없습니다. 원문 추출·분석 결과와 제출된 자료를 확인해야 합니다.','');
 for(const [i,g] of selected.entries()){
  const clientFindings=g.items.filter(f=>roleFrom(f)===client);
  const adverseFindings=g.items.filter(f=>roleFrom(f)===opponent);
  const needs=collect(g,'evidenceNeed');
  const impacts=collect(g,'legalImpact');
  const contradictions=collect(g,'contradiction');
  const sources=sourceFootnote(g,names);
  lines.push('### '+(i+1)+'. '+g.title,'',
   '의뢰인('+clientLabel+') 입장 : '+partyStatement(g,client),'',
   '상대방('+opponentLabel+') 입장 : '+partyStatement(g,opponent),'',
   '주장·반박 검토 : '+(clientFindings.map(f=>clean(f.analysis)).find(Boolean)||
    adverseFindings.map(f=>clean(f.analysis)).find(Boolean)||
    collect(g,'analysis').at(0)||'원문에 근거한 구체적 판단이 아직 없습니다.'),'',
   '법적 영향 : '+(impacts.at(0)||'법률 요건과 해당 증거의 연결을 추가 검토해야 합니다.'),'',
   '보완할 증거 : '+(needs.join(' / ')||'원본 계약·송금·대화 및 관련 제출서면을 대조해야 합니다.'),'',
   '모순 확인 : '+(contradictions.join(' / ')||'확인된 모순 없음. 주장 대립과 사실 모순은 구별해야 합니다.'),'',
   '증거 위치 : '+(sources?'제2장 각주 [^'+(i+1)+'] 참조':'확인된 원문 페이지 없음'),'');
 }
 if(selfContradictions.length){
  lines.push('### 의뢰인 진술의 전후 차이','');
  for(const g of selfContradictions)
   lines.push('「'+g.title+'」 : '+collect(g,'contradiction').join(' / '),
    '확인할 자료 : '+(collect(g,'evidenceNeed').join(' / ')||'전후 원문 및 작성 경위'),
    '원문 위치 : '+(sourceFootnote(g,names)||'출처 페이지 확인 필요'),'');
 }
 if(!against.length&&selected.length)
  lines.push('상대방의 직접 주장으로 분류된 분석항목이 없습니다. 해당 주장의 존재를 추정하지 않고 원문 확인 과제로 남깁니다.','');
 // Separate actionable offensive options from defenses. Only display candidates
 // actually supplied by the source-cited legal findings; never fabricate claims.
 lines.push('## 제4장. 의뢰인에게 유리한 공격·반대청구 검토','');
 const offensive=selected.filter(g=>g.items.some(f=>
  roleFrom(f)===intake.clientRole &&
  (f.type==='counterclaim' || /상계|반소|반대청구|미지급|채권|부당이득|손해배상/.test(
   [f.claim,f.analysis,f.legalImpact].map(clean).join(' ')))));
 if(!offensive.length)lines.push('원문에서 구체적으로 확인된 반대청구·상계 후보가 없습니다. 상대방의 의무 불이행, 미지급금, 상계채권, 반소 가능성을 추가 확인해야 합니다.','');
 for(const [i,g] of offensive.entries()){
  const clientFindings=g.items.filter(f=>roleFrom(f)===intake.clientRole &&
   (f.type==='counterclaim'||/상계|반소|반대청구|미지급|채권|부당이득|손해배상/.test(
    [f.claim,f.analysis,f.legalImpact].map(clean).join(' '))));
  const cited=clientFindings.some(f=>Array.isArray(f.sources)&&f.sources.some(ref=>sourceTag(ref,names)));
  const clientAnalyses=uniqueValues(clientFindings.map(f=>f.analysis));
  const clientImpacts=uniqueValues(clientFindings.map(f=>f.legalImpact));
  const clientNeeds=uniqueValues(clientFindings.map(f=>f.evidenceNeed));
  lines.push('### '+(i+1)+'. '+g.title,'',
   '검토할 공격 근거 : '+(clientAnalyses.at(0)||clientFindings.map(f=>clean(f.claim)).find(Boolean)||'구체적 근거 검토 필요'),
   '',
   '법적 효과 후보 : '+(clientImpacts.at(0)||'법적 요건 추가 확인 필요'),
   '',
   '확보·검증할 증거 : '+(clientNeeds.at(0)||'상대방의 원문 및 계약·입금 자료 대조 필요'),
   '근거 확인 상태 : '+(cited?'출처 문서·페이지 연결됨 (주장 진위 별도 검증)':'검증 과제 — 의뢰인 측 원문 증거 위치 미확인'),
   '',
   '원문 위치 : '+(clientFindings.flatMap(f=>Array.isArray(f.sources)?f.sources:[]).map(ref=>sourceTag(ref,names)).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join('; ')||'출처 페이지 확인 필요'),'');
 }
 // Preserve the evidentiary difference trail in the customer-facing result.
 // Unaffected old findings are unchanged; these are only GPT-reviewed updates.
 if(report.deltaReanalysis){
  const delta=report.deltaReanalysis;
  lines.push('### 신규 증거에 따른 변경 내역','',
   '추가 문서 : '+(delta.addedDocuments||[]).map(id=>names.get(id)||id).join(', '),
   '기존 분석 중 재검토 : '+Number(delta.changedFindings||0)+'건 / 변경 없이 유지 : '+
    Number(delta.unchangedFindings||0)+'건 / 신규 분석 : '+Number(delta.newFindings||0)+'건','');
  for(const [i,change] of (delta.changes||[]).entries()){
   const locations=refs=>[...new Set((Array.isArray(refs)?refs:[]).map(r=>sourceTag(r,names)).filter(Boolean))].join('; ')||'원문 위치 확인 필요';
   lines.push('**변경 '+(i+1)+'.** '+safeLine(change.reason,600),
    '기존 판단 : '+safeLine(change.oldClaim,600),
    '변경 판단 : '+safeLine(change.newClaim,600),
    '기존 근거 : '+locations(change.oldSources),
    '추가·변경 근거 : '+locations(change.newSources),'');
  }
 }
 if(footnotes.length)lines.push('### 증거 위치','',...footnotes,'');
 lines.push(SQUIDLAW_REPORT_CLOSING);
 return {title:'사건기록 분석보고서',clientRole:intake.clientRole,chapterCount:4,text:lines.join('\n'),
  displayedIssues:selected.length,undisplayedIssues:Math.max(0,groups.length-selected.length),
  sourceReferenceCount:footnotes.length,requiresSourceReview:report.notForCourtSubmission!==false||
   report.independentSemanticAuditPassed!==true};
}
