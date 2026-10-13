import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildContextualRecall,buildCorrectionEpisode,topicAnchors,isCorrectionMemory} from '../lib/skynet-episodic-context.mjs';
import {sourceKind,selectDiverseEvidence} from '../lib/skynet-evidence-rank.mjs';
const src=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

const previous=[
 {role:'user',content:'2026금969 전자공탁. 오늘 부천법원 공탁계에서 보험증권인지 현금공탁인지 확인했어.'},
 {role:'assistant',content:'2026금969는 현금공탁이니 공탁계에서 현금 반환을 요청하면 돼.'},
 {role:'user',content:'아니, 오늘 공탁계에서 보험증권에 의한 담보공탁이라고 확인했잖아. 잘못 안내했어.'},
 {role:'assistant',content:'공탁금 반환 안내는 잘못됐고 보험증권 담보취소 절차를 확인해야 한다.'}
];
test('short sarcastic follow-up retrieves source case and prior correction rather than only last sentence',()=>{
 const turns=[...previous,{role:'user',content:'일반인 같으면 오늘 부천법원 공탁계에 경찰 출동했어.ㅋㅋ'}];
 const result=buildContextualRecall(turns);
 assert.equal(result.contextDependent,true);
 assert.match(result.query,/부천법원 공탁계/);
 assert.match(result.query,/2026금969/);
 assert.match(result.query,/보험증권/);
 assert.match(result.query,/현금공탁/);
 assert.ok(result.query.length<=6000);
});
test('anaphora-only follow-up reuses recent legal reference but not a fictional fact',()=>{
 const result=buildContextualRecall([...previous,{role:'user',content:'그것도 기억 못 했어?'}]);
 assert.equal(result.contextDependent,true);
 assert.match(result.query,/2026금969/);
 assert.match(result.query,/담보취소|공탁/);
});
test('large standalone input does not inherit unrelated old context',()=>{
 const question='다음 원문을 검토하라. '+'계약서 조항'.repeat(100);
 const result=buildContextualRecall([...previous,{role:'user',content:question}]);
 assert.equal(result.contextDependent,false);
 assert.doesNotMatch(result.query,/2026금969/);
});
test('explicit rebuttal produces provenance-linked disputed episode, not a certified corrected fact',()=>{
 const turnId='turn-20261013-abcdef123';
 const episode=buildCorrectionEpisode({
  userText:'아니 그건 보험증권에 의한 공탁이야. 현금공탁이라고 안내한 건 틀렸어.',
  recentTurns:previous.slice(0,2),turnId,at:'2026-10-13T11:01:00+09:00'
 });
 assert.ok(episode);
 assert.equal(episode.verification,'unverified');
 assert.equal(episode.kind,'user-disputed-assistant-answer');
 assert.match(episode.text,/이전 AI 답변/);
 assert.match(episode.text,/현금공탁/);
 assert.match(episode.text,/보험증권/);
 assert.match(episode.text,/원문·계약서·공식 확인자료와 별도 대조/);
 assert.equal(episode.turnId,turnId);
 assert.match(episode.id,/^[a-f0-9]{64}$/);
 const unrelated=buildCorrectionEpisode({
  userText:'오늘 날씨 정말 좋다!',recentTurns:previous,turnId
 });
 assert.equal(unrelated,null);
});
test('rejects fabricated correction episode with no prior assistant quote',()=>{
 assert.equal(buildCorrectionEpisode({
  userText:'아니 그거 틀렸어',recentTurns:[{role:'user',content:'공탁은?'}],
  turnId:'turn-20261013-abcdef123'
 }),null);
});
test('repeated correction has stable receipt key and ranking preference but remains unverified',()=>{
 const data={userText:'아니 그건 보험증권에 의한 공탁이라고 했어.',
  recentTurns:previous.slice(0,2),turnId:'turn-20261013-abcde123456'};
 const a=buildCorrectionEpisode(data),b=buildCorrectionEpisode(data);
 assert.equal(a.id,b.id);
 assert.equal(sourceKind('skynet/episodes/'+a.id+'.json'),'correction');
 assert.equal(isCorrectionMemory({source:'skynet/episodes/'+a.id+'.json'}),true);
 const results=selectDiverseEvidence([
  {source:'skynet/memory/history.json',part:'0',content:'보험증권 공탁'},
  {source:'skynet/episodes/'+a.id+'.json',part:'0',content:a.text}
 ],'보험증권 공탁',{limit:2});
 assert.equal(results[0].source,'skynet/episodes/'+a.id+'.json');
});
test('integration: backend memory lookup uses conversational cues and correction records',()=>{
 const chat=src('api/skynet-chat.js');
 const memory=src('api/skynet-memory.js');
 const client=src('admin/skynet.html');
 assert.match(chat,/buildContextualRecall\(clean,\{retrievalQuery:question\}\)/);
 assert.match(chat,/const corrected=matches\.filter\(isCorrectionMemory\)/);
 assert.match(chat,/contextDependent\?null/);
 assert.match(memory,/buildCorrectionEpisode\(\{userText:content,recentTurns,turnId/);
 assert.match(memory,/skynet\/episodes\//);
 assert.match(client,/saveTurn\('user',composed,turnId,previous\)/);
 assert.match(src('api/skynet-retrieval.js'),/skynet\/episodes\//);
});
