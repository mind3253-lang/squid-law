/**
 * Owner-approved full-record report contract.
 *
 * Pages are a billing/coverage unit, not a target word count. A report is
 * valuable when it retains material claims, their replies and precise source
 * positions, including the final pleadings. Never make up rows to fill a quota.
 */
const CASE_DOSSIER_VERSION='squidlaw-case-brief-v4-three-part-formal-report';
const CASE_DOSSIER_SECTIONS=Object.freeze([
 Object.freeze({id:'claim-map',title:'제1장. 쟁점 도표 정리',
  focus:'청구취지와 반소 청구취지에 따라 청구액별 법적 원인, 결정적인 반박, 증거, 현재의 잠정 판단을 선별한다. 고객에게 유리한 점과 불리한 점을 함께 검토한다. 사건의 표지·절차 이력과 무관한 날짜별 주장 나열은 제외한다.',
  tables:'| 청구·핵심 쟁점 | 원고의 청구 이유 | 피고의 핵심 반박 | 결정적 증거·입증 공백 | 잠정 판단·위험 |'}),
 Object.freeze({id:'contradictions',title:'제2장. 분석',
  focus:'제1장의 핵심 쟁점별로 원고 : 주장, 피고 : 주장, 모순 : 입증 가능한 자기모순 또는 주장 불일치, 분석 : 증거와 입증 책임의 효과를 각각 구분하여 상세하게 기술한다. 주장 대립만으로 모순을 단정하지 않는다. 마지막에 의뢰인 관점의 증거보완과 전문가 검토 필요사항을 결과 1) 2) 3)으로 제시한다.',
  tables:''})
]);
function dossierClientPerspective(question){
 const q=String(question||'');
 const defendant=/(?:의뢰인|고객|우리|저희|나|제)\s*(?:가|는|측은)?\s*(?:피고|반소원고)|(?:피고|반소원고)\s*(?:입장|측에서|관점|대리)|피고를\s*(?:대리|위해)/u.test(q);
 const plaintiff=/(?:의뢰인|고객|우리|저희|나|제)\s*(?:가|는|측은)?\s*(?:원고|반소피고)|(?:원고|반소피고)\s*(?:입장|측에서|관점|대리)|원고를\s*(?:대리|위해)/u.test(q);
 return defendant&&!plaintiff?'피고':plaintiff&&!defendant?'원고':'중립';
}
const DOSSIER_SOURCE_KEYWORDS=Object.freeze({
 'claim-map':/청구|반소|원고|피고|대여금|차임|보증금|상계|정산|반환|공제/g,
 'contradictions':/모순|충돌|반박|증거|갑\s*\d+|을\s*\d+|카카오|녹취|판결|상계|정산|변제|재반박/g
});
function directIndexedPdfExcerpt(windows,section,{maxCharacters=33000}={}){
 if(!Array.isArray(windows)||!windows.length||
  !CASE_DOSSIER_SECTIONS.some(x=>x.id===section?.id)||
  !Number.isSafeInteger(maxCharacters)||maxCharacters<4000)
  throw Error('DIRECT_SOURCE_EVIDENCE_MISSING');
 const regex=DOSSIER_SOURCE_KEYWORDS[section.id];
 const scored=windows.map((window,index)=>{
  if(!window||typeof window.text!=='string'||!window.text.trim()||
   !Array.isArray(window.pages)||!window.pages.length)
   throw Error('UNVERIFIABLE_INDEXED_PDF_WINDOW');
  const samples=window.text.match(regex)||[];
  return {window,index,score:samples.length+index/windows.length*8};
 });
 const latest=windows.length-1;
 const picked=new Set([0,latest]);
 if(windows.length>2)picked.add(latest-1);
 for(const row of [...scored].sort((a,b)=>b.score-a.score||b.index-a.index)){
  if(picked.size>=Math.min(windows.length,6))break;
  picked.add(row.index);
 }
 const indexes=[...picked].sort((a,b)=>a-b);
 const budget=Math.floor((maxCharacters-indexes.length*135)/indexes.length);
 return indexes.map(index=>{
  const window=windows[index];
  const head='[실제 색인 PDF 원문 / PDF '+window.pages.join(',')+
   '쪽 / 소스 구간 '+(index+1)+'/'+windows.length+']\n';
  const raw=window.text;
  // The window itself may contain several page labels: preserve the first
  // and last portions instead of silently claiming full quoted coverage.
  const excerpt=raw.length<=budget?raw:
   raw.slice(0,Math.floor(budget*0.66))+
   '\n[이 원문 구간 중간부는 이 장의 직접 인용에서 생략됨]\n'+
   raw.slice(-Math.floor(budget*0.30));
  return head+excerpt;
 }).join('\n\n');
}
function reportHasInvalidPageCitations(text,pageCount){
 if(!Number.isSafeInteger(pageCount)||pageCount<1)return true;
 const matches=String(text||'').matchAll(/(?:\[PDF\s*(\d+)\s*쪽\]|\bPDF\s*(\d+)\s*쪽)/g);
 for(const m of matches)if(Number(m[1]||m[2])<1||Number(m[1]||m[2])>pageCount)return true;
 return false;
}
function reportRequestsAlreadyIndexedPdf(text){
 const answer=String(text||'');
 return /(?:실제\s*추출\s*텍스트|PDF\s*\d+\s*[~\-]\s*\d+\s*쪽.{0,16}(?:보내|제공)|원문(?:을|이)\s*(?:보내|제공)|첨부.{0,25}원문이\s*아니라\s*(?:중간\s*)?분석\s*노트|이번\s*메시지.{0,50}중간\s*분석\s*노트)/su.test(answer);
}

function dossierSectionPrompt(section,{question,mainNotes,lateNotes,pageCount,sourceExcerpts}){
 if(!CASE_DOSSIER_SECTIONS.some(x=>x.id===section?.id))throw Error('UNKNOWN_DOSSIER_SECTION');
 if(!Number.isSafeInteger(pageCount)||pageCount<1)throw Error('INVALID_DOSSIER_PAGE_COUNT');
 if(typeof sourceExcerpts!=='string'||!sourceExcerpts.includes('[실제 색인 PDF 원문'))throw Error('DIRECT_PDF_TEXT_REQUIRED');
 const side=dossierClientPerspective(question);
 const clientRule=side==='중립'?
  '의뢰인이 원고인지 피고인지 지정되지 않았습니다. 원고를 의뢰인으로 추정하지 마십시오. 중립적으로 양측의 청구·방어상 위험을 비교하십시오.':
  '의뢰인은 '+side+'입니다. 의뢰인 입장에서 실질적 공격·방어 논리를 구성하되, 의뢰인에게 불리한 근거도 숨기지 마십시오.';
 return [
  '법률 분석보고서 납품 원고입니다. 대화가 반말이더라도 결과물은 정중한 법률 문어체(~합니다/~판단됩니다)로 작성하십시오.',
  '실제 질문: '+String(question||'').slice(0,4500)+' / PDF '+pageCount+'쪽 / 작성 범위: '+section.title,
  clientRule,
  '보고서는 오직 2장으로 구성합니다. 이 장에서 분석할 내용: '+section.focus,
  section.id==='claim-map'?
   '이 장 맨 위에 정확히 [법원 사건표시]와 [/법원 사건표시] 사이에 4줄을 작성하십시오: 사건번호 : 원문 사건번호와 사건명 / 원고 : 원문에 표시된 원고 / 피고 : 원문에 표시된 피고 / 청구취지 : 소장에 적힌 정식 청구취지. 미확인 항목은 미확인이라고 표시하고 지어내지 마십시오. 이 블록은 결과 조립 시 제1장 위로 이동됩니다.':
   '분석 뒤에 정확히 [보고서 결과]와 [/보고서 결과] 사이에 1) 의뢰인에게 필요한 상대 주장에 대한 법률적 대응과 증거보완 2) 의뢰인 자신의 전후 진술 불일치가 실제로 있는 경우 그 정리 (확인되지 않았다면 단정하지 않음) 3) 직접증거가 부족할 때 사실확인서 등 대안 검토를 작성하십시오. 결과 블록은 별도 제목으로 이동됩니다.',
  section.id==='claim-map'?
   '제1장은 마크다운 파이프 표를 실제 생성하십시오. 표 형식: '+section.tables:
   '제2장은 표를 강제하지 않습니다. 쟁점별로 원고 : / 피고 : / 모순 : / 분석 : 네 항목을 정확히 분리하십시오.',
  '200~500쪽 원본이어도 전체 보고서는 약 A4 10쪽 이내가 목표입니다. 본 장은 '+(section.id==='claim-map'?'3천~4천5백':'4천5백~7천')+'자 내외로 쓰십시오.',
  '표와 해설에서 같은 사실을 반복하지 마십시오. 상대방 서면의 긴 축약본, 별도 연표, 절차 이력, 사건번호·당사자 소개의 반복을 금지합니다.',
  '쟁점마다 핵심 판단을 내려야 합니다. "확인 불가" 등의 변명성 문장을 반복하지 말고 결론에 영향을 주는 입증 공백만 짚으십시오.',
  '사건 표시는 처음에 한 번만 적고, 의뢰인 역할을 모르면서 원고에게 맞춘 보고서를 쓰지 마십시오. 고객용 보고서에 대화체 반말을 사용하지 마십시오.',
  '표 아래에서 표 내용을 다시 설명하지 말고, 판단을 바꾸는 핵심 증거와 논리적 강약만 추가로 분석하십시오.',
  '원문 인용을 본문과 혼합하지 마십시오. 본문에 간단한 각주 표시 [^1]을 사용하고 맨 아래 각주 [^1]: PDF 00쪽, 해당 증거번호 등 검증된 위치를 모아 두십시오. 본문과 표에 [PDF 몇 쪽]을 반복해서 붙이지 말고 각 쟁점에 각주 하나를 우선 사용하십시오.',
  '가짜 페이지, 법률, 판결, 증거번호를 만들지 마십시오. 당사자 주장과 실제 법원 판단을 구별하십시오. 소송대리허가 상태 등 청구취지 판단에 무관한 사항은 서술하지 마십시오.',
  '후반부 최신 서면의 실질적인 반박을 검토하고, 날짜가 최신이라는 이유만으로 사실로 단정하지 마십시오.',
  '스캔·사진·카카오톡 이미지의 내용을 확인하지 못했다면 직접 검증했다고 주장하지 마십시오. 서버 내부 Blob 경로·색인 ID·검색 로그를 출력하지 마십시오.',
  '서버의 원문 전체 검토 기록을 아래에 제공했습니다. 실제 원문 발췌는 일부이고 나머지는 저장된 구간별 노트입니다. 원문 재전송을 요청하지 마십시오.',
  '\n[실제 색인 PDF 원문 발췌]\n'+sourceExcerpts,
  '\n[전 구간 원문 검토 노트]\n'+mainNotes,
  '\n[뒤쪽 제출서면 검토 노트]\n'+lateNotes
 ].join('\n\n');
}
function extractDossierBlock(source,startTag,endTag){
 const begin=source.indexOf(startTag),end=source.indexOf(endTag);
 if(begin<0||end<=begin)return {text:'',remaining:source};
 return {text:source.slice(begin+startTag.length,end).trim(),
  remaining:(source.slice(0,begin)+source.slice(end+endTag.length)).trim()};
}
const SQUIDLAW_CUSTOMER_CLOSING='스키드로우는 분석 및 전문가(변호사 등)가 사건을 신속하게 판단하도록, 결과물을 제공하고 있으며, 채팅방에서 어떠한 법률 상담도 하지 않습니다. 자세한 사항은 전문가와 상의를 하시기 바랍니다. 감사합니다.';
function assembleCaseDossier({sections,pageCount,sourceName,ocrRequired=[],question=''}){
 if(!Array.isArray(sections)||sections.length!==CASE_DOSSIER_SECTIONS.length||
  sections.some((x,i)=>x?.id!==CASE_DOSSIER_SECTIONS[i].id||
   typeof x.text!=='string'||x.text.trim().length<100))
  throw Error('DOSSIER_SECTION_INCOMPLETE');
 if(!Number.isSafeInteger(pageCount)||pageCount<1)throw Error('INVALID_DOSSIER_PAGE_COUNT');
 const side=dossierClientPerspective(question);
 const header=extractDossierBlock(sections[0].text,'[법원 사건표시]','[/법원 사건표시]');
 const outcome=extractDossierBlock(sections[1].text,'[보고서 결과]','[/보고서 결과]');
 const info=header.text||'사건번호 : 원문 확인 필요\n원고 : 원문 확인 필요\n피고 : 원문 확인 필요\n청구취지 : 소장 원문 확인 필요';
 const intro='# 사건기록 분석보고서\n\n'+info+
  '\n원본 : '+String(sourceName||'PDF')+' ('+pageCount+'쪽)'+
  '\n의뢰인 : '+(side==='중립'?'의뢰인 지위 미지정 (원고·피고 선택 필요)':side)+
  '\n\n';
 const conclusion=outcome.text||'1) 의뢰인의 상대방 주장에 대한 증거와 반박을 정리해야 합니다.\n\n2) 주장 변경 및 자료 사이의 불일치가 실제 확인되는지 대조해야 합니다.\n\n3) 입증에 필요한 직접증거와 사실확인서 등 보완 가능성을 전문가와 검토할 필요가 있습니다.';
 const report=intro+
  '## '+CASE_DOSSIER_SECTIONS[0].title+'\n\n'+header.remaining+
  '\n\n## '+CASE_DOSSIER_SECTIONS[1].title+'\n\n'+outcome.remaining+
  '\n\n## 제3장. 결과\n\n'+conclusion+
  (ocrRequired.length?'\n\n**별도 확인할 원본:** PDF '+ocrRequired.join(', ')+'쪽.':'')+
  '\n\n'+SQUIDLAW_CUSTOMER_CLOSING;
 if(report.length>28000)throw Error('DOSSIER_EXCESSIVE_OUTPUT');
 return report;
}

// Shared between the customer-quality server tests and SKYNET browser report generator.
globalThis.SkynetCaseDossier=Object.freeze({CASE_DOSSIER_VERSION,CASE_DOSSIER_SECTIONS,dossierSectionPrompt,assembleCaseDossier,dossierClientPerspective,directIndexedPdfExcerpt,reportRequestsAlreadyIndexedPdf,reportHasInvalidPageCitations});
