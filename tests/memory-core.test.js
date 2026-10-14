import assert from "node:assert/strict";
import {normalizeMemoryEvent,projectTopic,isActionable,saveMessageFirst,appendMemoryEvent,recallTopic} from "../lib/memory-core.js";
const messages=new Map(),events=[],states=new Map();
const store={
 async putMessage(m){messages.set(m.id,m)},
 async getMessage(id){return messages.get(id)},
 async getEvents(topic){return events.filter(e=>e.topicId===topic)},
 async putEvent(e){events.push(e)},
 async putTopicState(id,s){states.set(id,s)},
 async getTopicState(id){return states.get(id)},
 async getPendingMessages(){return []}
};
await saveMessageFirst(store,{id:"m1",text:"펌프를 교체했지만 문제가 남았다"});
const old=await appendMemoryEvent(store,{id:"e1",topicId:"filter",kind:"observation",statement:"펌프 교체 후 문제 지속",sourceMessageId:"m1",sourceType:"user_reported"});
assert.equal(isActionable(old),false);
await saveMessageFirst(store,{id:"m2",text:"고착된 모래를 제거 중"});
await appendMemoryEvent(store,{id:"e2",topicId:"filter",kind:"execution",statement:"모래 제거 진행",sourceMessageId:"m2",sourceType:"user_reported"});
await saveMessageFirst(store,{id:"m3",text:"아까 말한 건 농담이다"});
const joke=await appendMemoryEvent(store,{id:"e3",topicId:"filter",kind:"joke",statement:"여과기 폭파",sourceMessageId:"m3",sourceType:"user_reported"});
assert.equal(isActionable(joke),false);
const inferred=normalizeMemoryEvent({topicId:"filter",kind:"decision",statement:"추정",sourceMessageId:"m3",sourceType:"model_interpretation",status:"verified"});
assert.equal(inferred.status,"reported");
assert.equal(isActionable(inferred),false);
await saveMessageFirst(store,{id:"m4",text:"앞의 판단 정정"});
await appendMemoryEvent(store,{id:"e4",topicId:"filter",kind:"correction",statement:"이전 내용 정정",sourceMessageId:"m4",sourceType:"user_reported",supersedes:["e1"]});
const state=(await recallTopic(store,"filter")).state;
assert.equal(state.confirmedActions.length,2);
assert.equal(state.latestEvents.some(e=>e.id==="e1"),false);
assert.equal(projectTopic(events).topicId,"filter");
await assert.rejects(()=>appendMemoryEvent(store,{topicId:"filter",kind:"decision",statement:"근거 없음",sourceMessageId:"missing"}));
console.log("memory-core tests passed");
