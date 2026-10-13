import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../admin/skynet.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../admin/skynet-layout.css',import.meta.url),'utf8');
class Node {
 constructor(tag='div'){this.tagName=tag;this.className='';this.textContent='';this.children=[];this.hidden=false;this.scrollTop=0;this.scrollHeight=1;}
 append(child){this.children.push(child);return child}
 replaceChildren(){this.children=[]}
 addEventListener(){}
}
const widgets={
 conversation:new Node(),
 loadMoreChat:new Node(),
 chatLoadMore:new Node(),
 chatCount:new Node()
};
function elements(name){if(!widgets[name])widgets[name]=new Node();return widgets[name]}
test('user turn can be displayed immediately, without accessing uninitialized displayed variable',()=>{
 const start=html.indexOf('function drawChat(){');
 const end=html.indexOf('function splitQuestions(',start);
 assert.ok(start>=0&&end>start);
 const draw=new Function('history','chatDisplayLimit','serverHasMore','el',
  'document','hideSkynetServerSearchFooter','renderSkynetMarkdown','drawSkynetLiveProgress',
  html.slice(start,end)+'return drawChat;')(
   [{role:'assistant',content:'이전 답변'},{role:'user',content:'258쪽 다시 분석해'}],
   80,false,elements,{createElement:tag=>new Node(tag)},
   value=>value,(node,v)=>node.textContent=v,()=>{}
  );
 assert.doesNotThrow(()=>draw());
 assert.equal(widgets.conversation.children.length,2);
 assert.equal(widgets.conversation.children[1].children[0].textContent,'258쪽 다시 분석해');
});
test('the UI preserves dialogue locally, registers user before save, and never drops a user turn after model failure',()=>{
 assert.doesNotMatch(html,/try\{localStorage\.removeItem\(chatKey\)\}catch\{\}function drawChat/);
 assert.doesNotMatch(html,/try\{localStorage\.removeItem\(chatKey\)\}catch\{\}\s*el\('sendChat'\)\.disabled=false/);
 assert.match(html,/const cached=JSON\.parse\(localStorage\.getItem\('skynet_chat_v1'\)/);
 const start=html.indexOf('const submittedTurn={role:\'user\',content:composed');
 const save=html.indexOf("await saveTurn('user',composed,turnId,previous)",start);
 assert.ok(start>=0&&save>start);
 const optimistic=html.slice(start,save);
 assert.match(optimistic,/history\.push\(submittedTurn\)/);
 assert.match(optimistic,/beginSkynetLiveWork/);
 assert.doesNotMatch(html,/history\.at\(-1\)===submittedTurn\)history\.pop/);
 assert.match(html,/saveLocalChatSnapshot\(\)/);
 assert.match(html,/서버 저장에 실패했어/);
 assert.match(html,/fetchWithSkynetSaveTimeout/);
});
test('progress shows real units and stage transitions; composer automatically expands',()=>{
 const start=html.indexOf('function skynetReadProgress(');
 const end=html.indexOf('function beginSkynetLiveWork(',start);
 const parse=new Function(html.slice(start,end)+'return skynetReadProgress;')();
 assert.deepEqual(parse('PDF 130~258쪽 · 원문 대조 46/129쪽'),
  {done:45,total:129,display:'46/129'});
 assert.deepEqual(parse('258쪽 · 12/36구간 검토 완료'),
  {done:12,total:36,display:'12/36'});
 assert.deepEqual(parse('PDF 214쪽 자료 읽는 중'),null);
 assert.match(html,/new MutationObserver\(\(\)=>updateSkynetLiveWork/);
 assert.match(html,/refreshSkynetLiveClock/);
 assert.match(html,/progress\.setAttribute\('aria-label','실제 검토 완료 구간'\)/);
 assert.match(html,/addEventListener\('input',resizeSkynetComposer\)/);
 assert.match(css,/#chatComposer textarea\{height:auto;min-height:58px/);
 assert.match(css,/#conversation \.skynet-working progress/);
});
test('reload merges server dialogue and exposes incremental restore without reupload',()=>{
 assert.match(html,/id="chatRestoreHistory"/);
 assert.match(html,/async function restoreSkynetHistoryPages/);
 assert.match(html,/serverPage=page\+1/);
 assert.match(html,/history=\[\.\.\.older,\.\.\.history\]/);
 assert.match(html,/const incoming=payload\.messages\.filter/);
 assert.match(html,/saveLocalChatSnapshot\(\);drawChat\(\)/);
});
