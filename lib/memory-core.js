// Shared memory core: append-only events, source-bound projections, and conflict-safe updates.
// Storage adapter must implement putMessage, putEvent, getEvents, putTopicState, getTopicState.
// Do not treat model-generated interpretations as confirmed facts.
export const MEMORY_SCHEMA_VERSION = 1;
export const MEMORY_KINDS = Object.freeze(["observation","decision","plan","hypothesis","question","joke","correction","cancellation","execution"]);
export const MEMORY_STATUSES = Object.freeze(["reported","verified","disputed","superseded","retracted"]);
const nonempty = x => typeof x === "string" && x.trim().length > 0;
const assert = (ok,msg) => { if(!ok) throw new Error(msg); };
export function normalizeMemoryEvent(input) {
  assert(input && typeof input === "object","event required");
  assert(nonempty(input.topicId),"topicId required");
  assert(MEMORY_KINDS.includes(input.kind),"invalid kind");
  assert(nonempty(input.sourceMessageId),"sourceMessageId required");
  assert(nonempty(input.statement),"statement required");
  const event = {
    id: input.id || crypto.randomUUID(),
    topicId: input.topicId.trim(),
    kind: input.kind,
    statement: input.statement.trim(),
    sourceMessageId: input.sourceMessageId,
    sourceType: input.sourceType === "system_observed" ? "system_observed" : input.sourceType === "user_reported" ? "user_reported" : "model_interpretation",
    status: MEMORY_STATUSES.includes(input.status) ? input.status : "reported",
    supersedes: Array.isArray(input.supersedes) ? [...new Set(input.supersedes.filter(nonempty))] : [],
    occurredAt: input.occurredAt || null,
    createdAt: input.createdAt || new Date().toISOString()
  };
  // A model's inference is never independently verified.
  if(event.sourceType === "model_interpretation" && event.status === "verified") event.status = "reported";
  return event;
}
export function isActionable(event) {
  return ["decision","execution","correction","cancellation"].includes(event.kind)
    && ["user_reported","system_observed"].includes(event.sourceType)
    && !["retracted","disputed","superseded"].includes(event.status);
}
export function projectTopic(events) {
  const sorted = [...events].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)));
  const superseded = new Set(sorted.flatMap(e=>e.supersedes||[]));
  const active = sorted.filter(e=>!superseded.has(e.id) && !["retracted","superseded"].includes(e.status));
  return {
    topicId: sorted[0]?.topicId || null,
    latestEvents: active.slice(-30),
    confirmedActions: active.filter(isActionable),
    openQuestions: active.filter(e=>e.kind==="question" || e.kind==="hypothesis"),
    conflicts: active.filter(e=>e.status==="disputed"),
    lastUpdatedAt: sorted.at(-1)?.createdAt || null
  };
}
export async function saveMessageFirst(store, message) {
  assert(nonempty(message?.id) && nonempty(message?.text),"message id/text required");
  assert(typeof store?.putMessage === "function","putMessage adapter required");
  await store.putMessage({...message, savedAt:message.savedAt||new Date().toISOString()});
  return {saved:true,messageId:message.id};
}
export async function appendMemoryEvent(store, input) {
  const event=normalizeMemoryEvent(input);
  assert(typeof store?.getMessage==="function" && typeof store?.putEvent==="function" && typeof store?.getEvents==="function" && typeof store?.putTopicState==="function","memory adapter incomplete");
  const source=await store.getMessage(event.sourceMessageId);
  assert(source,"source message must exist before event");
  const existing=await store.getEvents(event.topicId);
  assert(!event.supersedes.some(id=>!existing.some(e=>e.id===id)),"superseded event not found in topic");
  await store.putEvent(event); // durable event first; projections are rebuildable
  const projected=projectTopic([...existing,event]);
  await store.putTopicState(event.topicId,projected);
  return event;
}
export async function recallTopic(store,topicId,{limit=30}={}) {
  assert(nonempty(topicId),"topicId required");
  const state=await store.getTopicState(topicId);
  const pending=typeof store.getPendingMessages==="function" ? await store.getPendingMessages(topicId) : [];
  return {topicId,state:state||null,pendingMessages:pending.slice(-limit),requiresSourceCheck:!state || !!state.conflicts?.length};
}
