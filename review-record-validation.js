// Local review-note validation. No network or persistent storage.
export const REVIEW_RECORD_LIMIT=500;
export const REVIEW_NOTE_LIMIT=2000;
const statuses=new Set(['미검토','원문 확인','당사자 주장','추가 확인 필요']);
export function validateReviewRecords(payload){
 if(!payload||payload.schema!=='squidlaw-review-v1'||!Array.isArray(payload.records)||payload.records.length>REVIEW_RECORD_LIMIT)throw Error('INVALID_REVIEW_PAYLOAD');
 const records=payload.records.map(item=>{
  if(!item||typeof item.document!=='string'||!item.document.trim()||item.document.length>300||
   !Number.isInteger(item.page)||item.page<1||
   typeof item.text!=='string'||!item.text.trim()||item.text.length>1200||
   typeof item.note!=='string'||item.note.length>REVIEW_NOTE_LIMIT||
   !statuses.has(item.status))throw Error('INVALID_REVIEW_RECORD');
  return {document:item.document,page:item.page,text:item.text,status:item.status,note:item.note};
 });
 return records;
}
