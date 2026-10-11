import {createHash} from 'node:crypto';
import {put} from '@vercel/blob';
import {casePrefix,readJson} from './customer-case.js';
const sha=s=>createHash('sha256').update(s).digest('hex');
export const validRequestId=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id||''));
export const requestHash=(caseId,messages,options={})=>sha(JSON.stringify({caseId,messages,options}));
const base=(user,caseId,id)=>casePrefix(user,caseId)+'requests/'+id+'/';
export const requestPaths=(user,caseId,id)=>({base:base(user,caseId,id),initial:base(user,caseId,id)+'initial.json',draft:base(user,caseId,id)+'draft.json',completed:base(user,caseId,id)+'completed.json',knowledge:base(user,caseId,id)+'knowledge.json',result:base(user,caseId,id)+'result.json',userMessage:base(user,caseId,id)+'user-message.json',assistantMessage:base(user,caseId,id)+'assistant-message.json'});
export async function saveImmutable(path,obj){await put(path,JSON.stringify(obj),{access:'private',allowOverwrite:false,addRandomSuffix:false,contentType:'application/json'});return obj}
export async function saveOnce(path,obj){const prior=await readJson(path);if(prior)return prior;try{await saveImmutable(path,obj);return obj}catch(e){const existing=await readJson(path);if(existing)return existing;throw e}}
export async function requestState(user,caseId,id){
 const p=requestPaths(user,caseId,id);
 const [initial,draft,knowledge,result,userMessage,assistantMessage,completed]=await Promise.all([p.initial,p.draft,p.knowledge,p.result,p.userMessage,p.assistantMessage,p.completed].map(path=>readJson(path)));
 if(!initial)return null;
 const lastCompletedStep=completed?'completed':result?'result_saved':knowledge?'knowledge_saved':assistantMessage?'assistant_message_saved':userMessage?'user_message_saved':draft?'draft_saved':'pending';
 return {requestId:id,caseId,requestHash:initial.requestHash,createdAt:initial.createdAt,updatedAt:completed?.createdAt||draft?.createdAt||initial.createdAt,status:completed?'completed':draft?'saving':'pending',lastCompletedStep,resultId:result?.id||null,retryable:!completed&&!!draft,hasDraft:!!draft,completed,draft,knowledge,result,userMessage,assistantMessage};
}
export function publicState(s){return {requestId:s.requestId,status:s.status,lastCompletedStep:s.lastCompletedStep,resultId:s.resultId,retryable:s.retryable,createdAt:s.createdAt,updatedAt:s.updatedAt}}
