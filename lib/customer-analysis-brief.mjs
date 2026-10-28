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
 const combined=collect(group,'analysis').join(' ');
 const sentences=combined.split(/(?<=[.!?])\s+(?=[가-힣①-⑨])/);
 const who=party==='plaintiff'?/(고소인|원고)(?:은|는|가|의)?/:/(피고소인|피고)(?:은|는|가|의)?/;
 const statements=sentences.filter(t=>who.test(t)&&/(주장|서술|기재|부인|반박|인지|고지|결제|미지급)/.test(t));
 const selected=statements.find(t=>!/(미확인|없다|없어|간접 전달)/.test(t))||statements[0];
 if(selected)return selected.replace(/^[①-⑨]\s*/,'').trim();
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
 const delta=report.deltaReanalysis;
 const addedIds=new Set((delta?.addedDocuments||[]).map(x=>typeof x==='string'?x:x?.id));
 const incrementalFindings=delta?report.findings.filter(f=>(f.sources||[]).some(ref=>addedIds.has(ref.documentId))):report.findings;

 if(delta){
  const changes=Array.isArray(delta.changes)?delta.changes:[];
  // The merge preserves baseline findings first, followed by fresh findings
  // and revised supplements. Only the fresh block belongs to this report.
  const baselineCount=Math.max(0,report.findings.length-Number(delta.newFindings||0)-Number(delta.supplementalFindings||0));
  const fresh=report.findings.slice(baselineCount,baselineCount+Number(delta.newFindings||0));
  const groups=findGroups(fresh);
  const unique=(items)=>uniqueValues(items).filter(Boolean);
  const evidenceRefs=(items)=>unique(items.flatMap(f=>(f.sources||[]).map(ref=>sourceTag(ref,names)).filter(Boolean)));
  const section=(title,body)=>['## '+title,'',...body,''];
  const lines=['# 추가 분석보고서','','추가 자료: '+([...addedIds].map(id=>names.get(id)?.name||'문서명 확인 필요').join(', ')||'확인 필요'),''];
  const summaries=unique(groups.map(g=>g.items[0]?.claim||g.title));
  lines.push(...section('1. 추가 자료의 주요 내용',summaries.length?summaries.map((v,i)=>(i+1)+'. '+safeLine(v,430)):['추가 자료의 주요 주장 확인 필요']));
  lines.push(...section('2. 기존 주장과의 관계',changes.length?
   changes.flatMap((c,i)=>['### '+(i+1)+'. 기존 판단과의 차이','',
    '기존 판단: '+safeLine(c.oldClaim,450),
    '추가 주장: '+safeLine(c.newClaim,450),'']):
   ['기존 분석의 변경이 확인되지 않았습니다. 새로운 주장과 객관적으로 확인된 증거는 구분합니다.']));
  lines.push(...section('3. 추가 자료에 대한 법률적 분석',groups.length?
   groups.flatMap((g,i)=>['### '+(i+1)+'. '+issueTitle(g.title),'',
    ...unique(g.items.map(f=>f.analysis)).slice(0,2).flatMap(v=>safeLine(v,2400).split(/(?=[①②③④⑤⑥⑦⑧⑨⑩])/).map(x=>x.trim()).filter(Boolean).flatMap(x=>[x,''])),
    '근거: '+(evidenceRefs(g.items).join('; ')||'원문 위치 확인 필요'),'']):
   ['새 자료에 대한 독립 법률 분석 결과 없음']));
  const citationText=[...fresh,...changes.map(c=>c.supplementalFinding).filter(Boolean)]
   .flatMap(f=>[f?.claim,f?.analysis,f?.legalImpact,f?.contradiction].filter(x=>typeof x==='string')).join(' ');
  const citedCases=unique([...citationText.matchAll(/(?:대법원|헌법재판소|(?:서울|부산|대구|광주|대전|인천|수원|의정부|춘천|청주|전주|창원|울산|제주)(?:고등|지방)?법원)?\\s*(?:19|20)\\d{2}[가-힣]{1,5}\\d{2,9}/g)].map(m=>m[0]));
  const checks=Array.isArray(report.precedentVerificationResults)?report.precedentVerificationResults:
   Array.isArray(report.precedentVerifications)?report.precedentVerifications:[];
  const statusText=v=>v?.verified===true||v?.status==='verified'?'존재·인용 취지 확인':
   v?.status==='mismatch'?'존재하지만 인용 취지 불일치':
   v?.status==='not_found'?'원문 확인 불가':
   v?.status==='not_checked'?'원문 검증 미실시':'원문 검증 미실시';
  const caseLines=citedCases.flatMap((name,i)=>{
   const check=checks.find(v=>[v?.caseNumber,v?.citation,v?.caseName].some(t=>typeof t==='string'&&name.includes(t)));
   return [(i+1)+'. '+name,'검증 상태: '+statusText(check),
    ...(check?.reason?['검증 근거: '+safeLine(check.reason,600)]:[]),''];
  });
  lines.push(...section('4. 인용 판례 검증',caseLines.length?caseLines:
   ['추가 자료의 분석 결과에서 인용된 판례 없음.']));
  lines.push(...section('5. 기존 분석에 미치는 영향',[
   '기존 판단 변경 '+Number(delta.changedFindings||0)+'건 · 유지 '+Number(delta.unchangedFindings||0)+'건 · 신규 쟁점 '+Number(delta.newFindings||0)+'건','',
   ...(changes.length?changes.flatMap((c,i)=>['### '+(i+1)+'. 판단 변화','',
    '기존: '+safeLine(c.oldClaim,450),
    '변경: '+safeLine(c.newClaim,450),
    '이유: '+safeLine(c.reason,700),
    '기존 근거: '+(unique((c.oldSources||[]).map(ref=>sourceTag(ref,names))).join('; ')||'확인 필요'),
    '추가 근거: '+(unique((c.newSources||[]).map(ref=>sourceTag(ref,names))).join('; ')||'확인 필요'),'']):
    ['새 자료만으로 변경이 입증된 기존 판단은 없습니다. 기존 판단은 보존됩니다.'])
  ]));
  const needs=unique(groups.flatMap(g=>g.items.map(f=>f.evidenceNeed))).slice(0,6);
  lines.push(...section('6. 추가 확인사항 및 종합 판단',[
   ...needs.map((v,i)=>(i+1)+'. '+safeLine(v,650)),
   '',changes.length?
   '종합 판단: 위 변경된 쟁점만 기존 분석에 영향을 미칩니다. 다른 기존 판단은 보존됩니다.':
   '종합 판단: 추가 주장과 객관적 증거를 구분해야 하며 기존 판단의 변경은 확인되지 않았습니다.'
  ]));
  lines.push(SQUIDLAW_REPORT_CLOSING);
  return {title:'추가 분석보고서',clientRole:intake.clientRole,chapterCount:6,text:lines.join('\n'),
   displayedIssues:groups.length,undisplayedIssues:0,
   sourceReferenceCount:evidenceRefs(fresh).length,
   requiresSourceReview:report.notForCourtSubmission!==false||report.independentSemanticAuditPassed!==true};
 }

 const groups=findGroups(incrementalFindings);
 // A paid whole-case report must not silently hide findings after the first eight issues.
 const selected=groups;
 const criminal=isCriminalRecord(intake,documents);
 const lines=[
  report.deltaReanalysis?'# 추가 분석보고서':'# 사건기록 분석보고서',
  '',
  '본 분석자료는 접수자의 편을 들지 않고, 객관적인 사항만 비교분석하였습니다.',
  '',
  '모든 주관은 객관에서 시작됩니다.',
  '',
  '치우쳐지지 않은 분석자료가 그 시작이 됩니다.',
  '',
  '그것이 나홀로 소송을 할 때도 기준이 되며,',
  '',
  '변호사에게 자문을 구하더라도, 변호인이 올바른 전략을 세울 수 있는 기초가 됩니다.',
  ''
 ];
 if(report.clientRole&&report.clientRole!==intake.clientRole)throw Error('ANALYSIS_ROLE_CHANGED');
 if(!report.clientRole)lines.push('※ 분석 당시 의뢰인 지위가 기록되지 않은 과거 보고서입니다. 현재 선택한 지위를 기준으로 분석한 결과임을 보증할 수 없습니다.','');
 if(report.notForCourtSubmission!==false||report.independentSemanticAuditPassed!==true)
  lines.push('※ 원문 및 분석 결과의 독립 검증이 완료되지 않은 초안입니다.','');
 lines.push('## 제1장. 쟁점 도표 정리','','| 핵심 쟁점 | 당사자 주장 | 내용 |','|---|---|---|');
 for(const group of selected){
  const title=safeCell(issueTitle(group.title));
  lines.push('| '+title+' | '+(criminal?'고소인':'원고')+' 주장 요지 | '+safeCell(position(group,'plaintiff'))+' |',
   '|  | '+(criminal?'피고소인':'피고')+' 주장 요지 | '+safeCell(position(group,'defendant'))+' |',
   '|  | 핵심 입증사항 | '+safeCell(collect(group,'evidenceNeed').join(' / ')||'확인 필요')+' |');
 }
 lines.push('','## 제2장. 분석','');
 for(const [i,group] of selected.entries()){
  const contradiction=collect(group,'contradiction');
  const analyses=collect(group,'analysis');
  const legalImpact=collect(group,'legalImpact');
  const raw=analyses.length?analyses.join(' / '):legalImpact.length?legalImpact.join(' / '):'주장과 증거의 연결에 대한 검토가 더 필요합니다.';
  const paragraphs=raw.split(/(?=[①②③④⑤⑥⑦⑧⑨⑩])/).map(x=>x.trim()).filter(Boolean);
  lines.push('### '+(i+1)+'. '+issueTitle(group.title),'',
   '1) '+(criminal?'고소인':'원고')+' 주장',position(group,'plaintiff'),'',
   '2) '+(criminal?'피고소인':'피고')+' 주장',position(group,'defendant'),'',
   '3) 모순',contradiction.join(' / ')||'직접 확인된 모순 없음','',
   '4) 분석','',...paragraphs);
 }
 lines.push('## 제3장. 원문 위치','');
 for(const [i,g] of selected.entries()){
  lines.push('### '+(i+1)+'. '+issueTitle(g.title),'',
   (sourceFootnote(g,names)||'출처 페이지 확인 필요'),'');
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
 if(report.deltaReanalysis){
  lines.push('## 제4장. 인용 판례 검증','',
   '※ 판례 원문 검증 미실시 — 이 분석 단계에서 국가법령정보센터 원문 대조 결과가 확보되지 않았습니다. 인용된 판례의 사건번호·선고일·판시 취지를 재검토해야 합니다. 확인되지 않은 판례를 검증 완료로 표시하지 않습니다.','',
   '## 제5장. 기존 분석에 미치는 영향','');
  const delta=report.deltaReanalysis;
  lines.push('기존 판단 재검토 '+Number(delta.changedFindings||0)+'건 / 기존 판단 유지 '+Number(delta.unchangedFindings||0)+'건 / 신규 분석 '+Number(delta.newFindings||0)+'건','');
  for(const change of delta.changes||[]){
   lines.push('기존 판단 : '+safeLine(change.oldClaim,850),
    '추가 자료에 따른 판단 : '+safeLine(change.newClaim,850),
    '판단 변경 이유 : '+safeLine(change.reason,850),'');
  }
  if(!(delta.changes||[]).length)lines.push('추가 자료로 인해 변경된 기존 판단은 확인되지 않았습니다.','');
  lines.push('## 제6장. 추가 확인사항 및 종합 판단','');
 }else lines.push('## 제4장. 핵심 확인사항','');
 for(const [i,g] of selected.entries()){
  const impact=collect(g,'legalImpact');
  const analysis=collect(g,'analysis');
  lines.push('### '+(i+1)+'. '+issueTitle(g.title),'',
   (impact.join(' / ')||analysis.at(-1)||'현재 자료만으로 판단 확정 불가'),'');
 }
 const keywords=(Array.isArray(report.legalSearchKeywords)?report.legalSearchKeywords:[]).filter(x=>typeof x==='string'&&x.trim());
 if(report.analysisEngineVersion==='gpt-6-claims-v1'&&keywords.length>0)lines.push('',keywords.map(x=>'#'+x.trim().replace(/_/g,' ').replace(/\s+/g,' ')).join('  '));
 lines.push('',SQUIDLAW_REPORT_CLOSING);
 return {title:report.deltaReanalysis?'추가 분석보고서':'사건기록 분석보고서',clientRole:intake.clientRole,chapterCount:report.deltaReanalysis?6:4,text:lines.join('\n'),
  displayedIssues:selected.length,undisplayedIssues:Math.max(0,groups.length-selected.length),
  sourceReferenceCount:selected.filter(g=>Boolean(sourceFootnote(g,names))).length,requiresSourceReview:report.notForCourtSubmission!==false||
   report.independentSemanticAuditPassed!==true};
}
