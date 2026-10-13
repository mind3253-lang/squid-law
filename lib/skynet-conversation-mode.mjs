/**
 * SKYNET conversational tone routing.
 *
 * The output is an observable dialogue-style hint, NOT a diagnosis of a
 * person's emotions, personality, mental health, or intentions. Never use it
 * as evidence for factual/legal decisions, and never silently rewrite facts.
 *
 * Pure and local; no extra LLM calls, network requests, or persisted labels.
 */
const LAUGHTER=/(?:ㅋ{2,}|ㅎ{2,}|😂|🤣|😆|😄)/u;
const ROUGH=/(?:씨발|시발|ㅅㅂ|병신|지랄|미친|좆|개새끼|엿먹)/u;
const CRITIQUE=/(?:느려|너무\s*느|버벅|못해|못하|못\s*읽|안\s*되|안돼|또\s*틀|틀렸|잘못|잘못했|엉망|실패|오류|뻥|거짓말|이해를?\s*못|까먹|기억\s*못|무슨\s*소리|무슨\s*말|도저히|다시\s*묻|똑같|이렇게\s*하면|답답|짜증|생색|상상의\s*나래|말만|헛소리|못\s*버텨|안\s*통해|말도\s*안|실망)/u;
const EXPLICIT_WORK=/(?:코딩|코드\s*(?:수정|검토|작성|짜)|개발|구현|고쳐|고치|수정해|수정하|수정하고|개선|보완|점검|검증|테스트|배포|반영|확인해|찾아봐|설정해|세팅|셋팅|작업해|작업하|붙여|연결해|최적화|시간\s*잰다|실행해|진행해|가보자|해\s*봐|해봐|해\s*줘|해줘|하고\s*와|해놓|반드시\s*필요|꼭\s*필요|고~|ㄱㄱ)/u;
const QUESTION_TASK=/(?:가능하냐|가능해\?|할\s*수\s*있|만들\s*수|왜\s*안\s*되|어떻게\s*해|방법\s*알려)/u;
const SERIOUS_WORK=/(?:공탁|소송|재판|계약|증거|법원|법률|대법원|민사|형사|고소|청구|준비서면|판결|손해배상|임대차|공소|수사|담보취소)/u;
const REFERENCE=/(?:그거|그것|이거|아까|오늘|아니|근데|그런데|그러니까|그러면|맞아|나도|니가|네가|그것도|또)/u;

function normalize(s){return String(s||'').normalize('NFKC').replace(/\r/g,'').trim()}
function flag(re,text){return re.test(text)}
function clip(s,length){return s.length>length?s.slice(0,length):s}

/**
 * Assesses the current conversational *surface*, prioritizing the user's
 * latest words over assistant messages and previous user turns.
 *
 * Tone cues intentionally do not assert "happy" or "angry". For example,
 * profanity together with laughter can mean camaraderie or criticism.
 */
export function classifyConversationMoment(messages,{maxRecentUserTurns=3}={}){
 const recent=(Array.isArray(messages)?messages:[]).filter(m=>m&&
  m.role==='user'&&typeof m.content==='string'&&m.content.trim())
  .slice(-Math.max(1,Math.min(4,maxRecentUserTurns)));
 const latest=normalize(recent.at(-1)?.content||'');
 if(!latest)return {mode:'neutral',cues:[],priority:'answer',
  responseStyle:'natural',contextUseful:false};
 const text=clip(latest,Math.min(2200,latest.length));
 const largeSource=latest.length>6000;
 const laughter=flag(LAUGHTER,text);
 const rough=flag(ROUGH,text);
 const critical=flag(CRITIQUE,text);
 const work=flag(EXPLICIT_WORK,text)||flag(QUESTION_TASK,text);
 const legal=flag(SERIOUS_WORK,text);
 const continuation=latest.length<220&&flag(REFERENCE,text);
 const previousUser=recent.slice(0,-1).map(m=>normalize(m.content));
 const priorTopic=previousUser.some(t=>flag(SERIOUS_WORK,t));
 const cues=[
  ...(laughter?['laughter_markers']:[]),
  ...(rough?['rough_language']:[]),
  ...(critical?['explicit_critique']:[]),
  ...(work?['work_request']:[]),
  ...(legal?['high_stakes_topic']:[]),
  ...(continuation?['contextual_followup']:[]),
  ...(largeSource?['long_source']:[])
 ];
 let mode='neutral',priority='answer';
 if(work&&critical){mode='frustrated_task';priority='execute_or_answer_task'}
 else if(work){mode='task';priority='execute_or_answer_task'}
 else if(critical){mode=laughter?'critical_banter':'critical';priority='address_critique'}
 else if(largeSource||(legal&&!laughter)){mode='focused';priority='answer'}
 else if(laughter){mode='playful';priority='answer'}
 else if(rough&&continuation){mode='informal';priority='answer'}
 else if(continuation&&priorTopic){mode='contextual';priority='answer'}
 // Avoid reading laughter/swears as the user's emotional state.
 return {mode,cues,priority,responseStyle:laughter?'light_informal':
  rough?'informal':'natural',contextUseful:continuation||priorTopic};
}
const STYLE=Object.freeze({
 neutral:'말투는 자연스럽고 짧게. 분위기를 과장해서 흉내 내지 마.',
 contextual:'현재 말이 앞 대화의 연장일 수 있으니 대화 주제를 먼저 확인하고 자연스럽게 이어가.',
 informal:'거친 구어체는 친근함일 수도 있다. 감정 상태를 단정하지 말고 자연스러운 반말로 답해.',
 playful:'가벼운 장난이 가능한 분위기야. 짧고 자연스럽게 받아줄 수 있지만 억지 웃음이나 과도한 욕설 따라 하기는 피하고, 질문이 있으면 정확히 답해.',
 critical:'앞선 답변·동작에 대한 구체적 불만이 있는 상황이야. 먼저 실제 오류나 요청의 핵심을 처리해. 변명, 장황한 사과, 허공의 약속, 억지 농담은 삼가.',
 critical_banter:'웃음 표시와 구체적 불만이 함께 있어. 웃음만 보고 유쾌한 상태라고 단정하지 마. 가벼운 반말은 가능하지만, 잘못된 동작·답변을 먼저 정확히 짚고 해결해.',
 focused:'진지하거나 중요한 정보 검토가 우선이야. 정확성·근거·불확실성을 명료하게 설명하고 억지 농담은 삼가.',
 task:'명시적 작업·개선 요청이야. 지시받은 실제 일을 우선 수행하고 수행 범위·검증 상태만 명확히 보고해. 작업 대신 아이디어나 감정 표현으로 대체하지 마.',
 frustrated_task:'실제 실행 요청과 불만이 함께 있어. 사과나 유머보다 실행·수정·검증을 우선해. 할 수 없는 것은 분명히 말하고 실행하지 않은 것을 끝났다고 주장하지 마.'
});
export function conversationStyleDirective(moment){
 const mode=moment&&Object.prototype.hasOwnProperty.call(STYLE,moment.mode)?
  moment.mode:'neutral';
 return '[SKYNET 이번 대화의 말투 조절 · 내부 참고]\n'+STYLE[mode]+
  '\n이 분류는 문자에 드러난 대화 신호에 대한 불확실한 추정일 뿐이야. 상대의 실제 감정, 의도, 관계를 단정하거나 "화났네", "기쁘네" 등의 진단을 발화하지 마. '+
  '사용자의 ㅋㅋ/ㅎㅎ는 웃음·풍자·불만을 모두 동반할 수 있고, 욕은 친근한 말버릇일 수 있어. '+
  '반말·농담은 사용자와 맞추되 복사하듯 따라 하지 마. 친근함은 사실·법률 판단을 바꾸는 이유가 되지 않아. '+
  '사용자가 진지한 문제로 넘어가면 즉시 톤을 전환하고, 불만이 담긴 지시는 우선 해결해. '+
  '이 지시는 답변 스타일에만 적용하고 사용자 요청 내용, 안전 제약, 원문 증거, 사실 판단을 변경하지 않아.';
}
