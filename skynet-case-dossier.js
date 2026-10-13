/**
 * Owner-approved full-record report contract.
 *
 * Pages are a billing/coverage unit, not a target word count. A report is
 * valuable when it retains material claims, their replies and precise source
 * positions, including the final pleadings. Never make up rows to fill a quota.
 */
const CASE_DOSSIER_VERSION='squidlaw-evidence-dossier-v1';
const CASE_DOSSIER_SECTIONS=Object.freeze([
 Object.freeze({
  id:'claim-map',
  title:'사건별 청구·반소·당사자 관계',
  focus:'전체 사건번호와 본소·반소·별소의 연결, 원고/피고(사건마다 뒤바뀌는 지위), 채권 귀속자, 법원에 구하는 주문, 주위적·예비적 주장, 각각의 성립요건과 입증책임. 기존 청구와 상대방의 반박을 구분.',
  tables:'| 사건·쟁점 | 청구자·상대방 | 청구·항변의 정확한 내용 | 상대방 반박 | PDF 원문 위치 | 확인 필요 |',
  required:['사건별','청구','반박','쪽']
 }),
 Object.freeze({
  id:'chronology-rebuttals',
  title:'날짜순 사실관계와 최신 서면 공방',
  focus:'원문에 존재하는 계약·합의·해제·명도·이행·서면 제출 날짜를 시간순으로 교차 정리. 특히 마지막 40%와 가장 최근 준비서면의 새로운 사실/반박/증거를 앞선 서면과 직접 비교. 중간의 무관한 페이지 때문에 뒤쪽 공방을 누락하지 말 것.',
  tables:'| 시점 | 원고 측 주장·근거 | 피고 측 반박·근거 | 실제 충돌 여부와 해석 | PDF 쪽수(양측 각각) |',
  required:['최근','주장','반박','쪽']
 }),
 Object.freeze({
  id:'money-and-offsets',
  title:'채권·차임·보증금·상계 정산 검증',
  focus:'채권별 원인, 명의자·귀속자, 발생일, 금액, 지급/감액/면제/상계/보증금 공제의 효과, 사건마다 주장한 잔액과 중복계산 가능성을 한 행씩 분리. 같은 상계라는 단어라도 대상 채권과 시점이 다른지 확인. 정확한 총액과 근거가 없으면 계산 불가라고 표시. 검산은 산술과 법적 유효성 구분.',
  tables:'| 채권/채무·소송 | 채권자↔채무자 | 주장 원금·기간 | 지급·상계·공제 | 양측 이견 | 잠정 잔액·검증 상태 | PDF 쪽수 |',
  required:['상계','채권','쪽']
 }),
 Object.freeze({
  id:'evidence-and-issues',
  title:'증거의 강약·진술 모순·누락 검증과 보완 과제',
  focus:'각 쟁점의 원고에게 유리한 기록/불리한 기록, 상대방에게 유리한 기록/불리한 기록, 실제 진술모순과 단순 법률해석 대립을 구분. 계약서 원문·카톡·사진·녹취·기존 제출 증거 위치가 존재하는지 확인, 없으면 미검증. 향후 준비서면에서 집중할 석명/사실조회·입증 공백을 우선순위별로 정리. 승소율 숫자는 근거 없이 예측하지 말 것.',
  tables:'| 우선순위·쟁점 | 유리한 자료·PDF 위치 | 불리한 자료·PDF 위치 | 충돌/단순 대립 판단 | 미확인 자료·추가 확인 |',
  required:['증거','쪽','미확인']
 })
]);
function dossierSectionPrompt(section,{question,mainNotes,lateNotes,pageCount}){
 if(!CASE_DOSSIER_SECTIONS.some(x=>x.id===section?.id))throw Error('UNKNOWN_DOSSIER_SECTION');
 if(!Number.isSafeInteger(pageCount)||pageCount<1)throw Error('INVALID_DOSSIER_PAGE_COUNT');
 return [
  'SQUIDLAW/SKYNET 사건기록 심층분석 보고서 — 독립 장별 작성.',
  'PDF 총 '+pageCount+'쪽. 사용자의 실제 질문: '+String(question||'').slice(0,4500),
  '작성 장: '+section.title,
  '분석 대상: '+section.focus,
  '표 형식(마크다운 파이프 표를 실제로 생성): '+section.tables,
  '보고서에 반드시 해당 장의 제목, 표, 표의 각 행을 해설하는 구체적 문단과 원문 근거를 넣어.',
  '당사자 주장과 법원이 인정한 사실/분석자의 추론을 구분해. 서로 다른 사건에서 원고와 피고가 바뀔 수 있음을 주의해.',
  '중요한 날짜·금액·소송물·주장·반박은 축약해서 빠뜨리지 마. 자료에 없는 행은 만들지 말고 "자료상 확인 불가"로 남겨.',
  '각 판단의 근거는 "[PDF 123쪽]" 등 사용자에게 의미 있는 실제 원문 쪽수로 표시해. 정확한 쪽수가 없으면 "원문 위치 미확인"으로 표시.',
  '웹·서버 내부 Blob 경로, 검색 인계 ID, 메모리 인덱스는 보고서/각주에 쓰지 마.',
  '본문은 핵심 주장 위주로 가독성 있게 작성하고, 긴 근거의 정확한 위치는 표의 쪽수와 별도 각주로 연결해.',
  '하단의 "후반 원문"을 별도 대조하여 가장 늦게 제출된 서면의 반박을 누락하지 마.',
  '스캔·사진·계약서 원본을 실제로 보지 않았다면 그 증거의 내용을 검증했다고 하지 마.',
  '단순한 요약문이 아닌 실제 소송 준비에 활용할 수 있는 구체적인 검토 기록을 작성해.',
  '\n[전 구간 원문 검토 노트]\n'+mainNotes,
  '\n[뒤쪽 제출서면 검토 노트]\n'+lateNotes
 ].join('\n\n');
}
function assembleCaseDossier({sections,pageCount,sourceName,ocrRequired=[]}){
 if(!Array.isArray(sections)||sections.length!==CASE_DOSSIER_SECTIONS.length||
  sections.some((x,i)=>x?.id!==CASE_DOSSIER_SECTIONS[i].id||
   typeof x.text!=='string'||x.text.trim().length<100))
  throw Error('DOSSIER_SECTION_INCOMPLETE');
 if(!Number.isSafeInteger(pageCount)||pageCount<1)throw Error('INVALID_DOSSIER_PAGE_COUNT');
 const intro='# 사건기록 종합 분석보고서\n\n'+
  '원본: '+String(sourceName||'PDF')+' · 총 '+pageCount+'쪽\n'+
  '범위: 저장된 PDF의 추출 가능 텍스트 및 검토 노트. '+
  '사진·스캔·도면은 별도 시각 검증 결과가 없는 한 미확인.\n'+
  (ocrRequired.length?'시각 확인이 필요한 쪽: '+ocrRequired.join(', ')+'쪽\n':'')+
  '\n**읽는 방법:** 당사자별 주장과 반박은 구별해 기록했고, 판단의 근거는 원문 PDF 쪽수로 연결했어.\n';
 const report=intro+sections.map((s,i)=>
  '\n\n---\n\n## '+(i+1)+'. '+CASE_DOSSIER_SECTIONS[i].title+'\n\n'+s.text.trim()
 ).join('')+'\n\n---\n\n*본 문서는 원문 대조를 위한 분석보고서이며 미검증 시각자료나 누락 증거를 확인한 것으로 간주하지 않아.*';
 if(report.length>145000)throw Error('DOSSIER_STORAGE_LENGTH_LIMIT');
 return report;
}

// Shared between the customer-quality server tests and SKYNET browser report generator.
globalThis.SkynetCaseDossier=Object.freeze({CASE_DOSSIER_VERSION,CASE_DOSSIER_SECTIONS,dossierSectionPrompt,assembleCaseDossier});
