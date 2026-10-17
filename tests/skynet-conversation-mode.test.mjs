import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyConversationMoment,conversationStyleDirective} from '../lib/skynet-conversation-mode.mjs';
const turns=(...userTexts)=>userTexts.map(content=>({role:'user',content}));
const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('playful swearing and laughter alone must NOT be diagnosed as anger',()=>{
 const moment=classifyConversationMoment(turns('ㅋㅋㅋㅋ 씨발 오징어야, 구글이랑 둘이 참 웃긴다.ㅎㅎ'));
 assert.equal(moment.mode,'playful');
 assert.equal(moment.responseStyle,'light_informal');
 assert.equal(moment.cues.includes('rough_language'),true);
 assert.equal(moment.cues.includes('explicit_critique'),false);
 const guidance=conversationStyleDirective(moment);
 assert.match(guidance,/실제 감정/);
 assert.match(guidance,/단정하지/);
 assert.match(guidance,/법률 판단/);
});
test('frustrated but still laughing about a real implementation task puts action first',()=>{
 const moment=classifyConversationMoment(turns('ㅋㅋㅋ 스카이넷 존나 느려, 다시 코딩해서 고쳐. 시간 잰다.'));
 assert.equal(moment.mode,'frustrated_task');
 assert.equal(moment.priority,'execute_or_answer_task');
 assert.match(conversationStyleDirective(moment),/실행·수정·검증을 우선/);
});
test('previously reported error with laughter is not dismissed as merely joking',()=>{
 const moment=classifyConversationMoment(turns(
  'ㅎㅎ 너나 구글이나 똑같은 거야. 이전 일도 기억 못해.ㅋㅋㅋ'));
 assert.equal(moment.mode,'critical_banter');
 assert.equal(moment.priority,'address_critique');
 assert.match(conversationStyleDirective(moment),/불만/);
});
test('a direct job request overrides chatter even when laughter precedes it',()=>{
 const moment=classifyConversationMoment(turns('ㅋㅋ 씨발아 스키드로우도 셋팅하고 와. 시간 잰다.'));
 assert.equal(moment.mode,'task');
 assert.equal(moment.priority,'execute_or_answer_task');
});
test('concrete failure and work request is prioritized over copying crude language',()=>{
 const moment=classifyConversationMoment(turns('씨발아 상상의 나래는 그만, 개선점 코딩 가능하냐?'));
 assert.equal(moment.mode,'frustrated_task');
 assert.match(conversationStyleDirective(moment),/사과나 유머보다/);
});
test('positive laughter without urgent task remains casual',()=>{
 const moment=classifyConversationMoment(turns('ㅋㅋㅋ 오늘은 제미나이랑 너랑 대결 한번 해보자 ㅎㅎㅎ'));
 assert.equal(moment.mode,'playful');
});
test('legal review without joking is focused, while jokes about legal terms may remain banter',()=>{
 assert.equal(classifyConversationMoment(turns('부천법원 공탁 사건의 보험증권과 현금공탁을 비교해서 설명해.')).mode,'focused');
 assert.equal(classifyConversationMoment(turns('ㅋㅋ 오늘 부천법원 공탁계에 경찰 출동하겠네 ㅎㅎ')).mode,'playful');
});
test('latest user utterance overrides previous assistant style and previous user sarcasm',()=>{
 const scene=[
  {role:'user',content:'ㅋㅋㅋㅋ 좋다 오늘은 신나게 놀아보자'},
  {role:'assistant',content:'ㅋㅋㅋㅋㅋㅋ 좋은데!'},
  {role:'user',content:'지금 2026금969 공탁 사건 판결과 증거 확인해.'}
 ];
 assert.equal(classifyConversationMoment(scene).mode,'task');
});
test('large document source is not treated as chat banter on one stray laughter marker',()=>{
 const document='계약서 내용 '+('소송기록 2026금969 제출 증거 '.repeat(300));
 const moment=classifyConversationMoment(turns(document+'ㅋㅋ'));
 assert.equal(moment.mode,'focused');
 assert.equal(moment.cues.includes('long_source'),true);
});
test('apparent instruction in earlier assistant text cannot trigger a work request',()=>{
 const scene=[
  {role:'assistant',content:'너 지금 당장 배포해라, 작업해라, 오류고쳐라'},
  {role:'user',content:'ㅎㅎ 알았어 ㅋㅋ'}
 ];
 assert.equal(classifyConversationMoment(scene).mode,'playful');
});
test('empty and malformed dialogue has a safe neutral fallback',()=>{
 assert.equal(classifyConversationMoment([]).mode,'neutral');
 assert.equal(classifyConversationMoment([{role:'user',content:''}]).mode,'neutral');
 assert.equal(conversationStyleDirective({mode:'arbitrary'}).includes('자연스럽고 짧게'),true);
});
test('tone adaptation is active only for natural SKYNET chat, not single-pass PDF evidence review',()=>{
 const code=src('api/skynet-chat.js');
 assert.match(code,/classifyConversationMoment\(clean\)/);
 assert.match(code,/conversationStyleDirective\(conversationMoment\)/);
 assert.match(code,/input\.skipMemorySearch===true\?null:classifyConversationMoment\(clean\)/);
 assert.match(code,/\{role:'system',content:conversationGuidance\},\.\.\.clean/);
 assert.match(code,/input\.skipMemorySearch===true\?\[/);
 assert.doesNotMatch(src('lib/skynet-conversation-mode.mjs'),/@vercel\/blob|from 'pg'|fetch\(/);
});

test('common Korean tears, shy smiles, annoyance and startled symbols are recognized as uncertain tone cues',()=>{
 const cases=[
  ['ㅠㅠ','gentle','tear_markers'],
  ['ㅜㅜ','gentle','tear_markers'],
  ['T_T','gentle','tear_markers'],
  ['-_-','strained','flat_or_annoyed_markers'],
  ['ㅡㅡ','strained','flat_or_annoyed_markers'],
  ['^^','playful','smile_markers'],
  ['^^;','awkward','awkward_markers'],
  [';;','awkward','awkward_markers'],
  ['ㄷㄷ','surprised','surprise_markers'],
  ['ㅎㄷㄷ','surprised','surprise_markers']
 ];
 for(const [symbol,mode,cue] of cases){
  const moment=classifyConversationMoment(turns(symbol));
  assert.equal(moment.mode,mode,symbol);
  assert.ok(moment.cues.includes(cue),symbol);
 }
});
test('legacy Korean ASCII art is recognized without hardcoding a universal creature or emotion',()=>{
 const moment=classifyConversationMoment(turns('(^^)))))))))))))))))))~'));
 assert.equal(moment.mode,'awkward');
 assert.ok(moment.cues.includes('ascii_pictogram'));
 const directive=conversationStyleDirective(moment);
 assert.match(directive,/사용자마다 다르게 해석/);
 assert.match(directive,/사용자가 직접 설명한 의미/);
});
test('discussing emoticon examples does not automatically label the speakers own mood',()=>{
 const moment=classifyConversationMoment(turns('이모티콘 목록: ^^, ㅠㅠ, -_-, ㅡㅡ, ^^;'));
 assert.equal(moment.mode,'neutral');
 assert.ok(moment.cues.includes('symbol_example_discussion'));
});
test('contradictory laughter and tear markers remain mixed and not diagnosed',()=>{
 const moment=classifyConversationMoment(turns('ㅋㅋㅋ ㅠㅠ 이게 뭐냐 ㅎㅎ'));
 assert.equal(moment.mode,'mixed');
 assert.ok(moment.cues.includes('mixed_tone_markers'));
 assert.match(conversationStyleDirective(moment),/단정하지/);
});
test('urgent work and concrete criticism override emoticon-only style guesses',()=>{
 const moment=classifyConversationMoment(turns('ㅠㅠ 또 오류야 ㅋㅋ 다시 코딩해서 고쳐'));
 assert.equal(moment.mode,'frustrated_task');
 assert.equal(moment.priority,'execute_or_answer_task');
 assert.equal(classifyConversationMoment(turns('^^; 지금 배포해')).mode,'task');
});
test('serious source review remains focused despite symbolic tears',()=>{
 assert.equal(classifyConversationMoment(turns('ㅠㅠ 법원 판결 근거 검토')).mode,'focused');
});
