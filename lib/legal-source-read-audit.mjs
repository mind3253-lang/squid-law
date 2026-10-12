// Source-aware review receipts. Provenance checks cannot prove human-level comprehension;
// they prevent "all pages reviewed" claims without page/part-specific anchored evidence.
const SHA=/^[a-f0-9]{64}$/;
const key=r=>String(r?.documentId)+':'+r?.page+':'+r?.part;
const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
const generic=/^(?:확인(?:함|했습니다|했음)?|검토(?:함|했습니다|했음)?|특이사항\s*없음|내용\s*없음|no\s*relevant\s*(?:information|facts)?|reviewed|checked|n\/a)[.!\s]*$/i;
export const SOURCE_REVIEW_TASK='claims_and_rebuttals';
export function auditSourceReadReceipts({units,receipts}){
 const failures=[];
 if(!Array.isArray(units)||!units.length||!Array.isArray(receipts))return {complete:false,reviewedUnits:0,totalUnits:Array.isArray(units)?units.length:0,failures:['SOURCE_REVIEW_INPUT_INVALID']};
 const expected=new Map();
 for(const u of units){
  const id=key(u);
  if(expected.has(id)||!u?.documentId||!Number.isSafeInteger(u.page)||u.page<1||!Number.isSafeInteger(u.part)||u.part<1||!SHA.test(u.hash||'')||typeof u.text!=='string')failures.push('SOURCE_REVIEW_INVALID_UNIT:'+id);
  expected.set(id,u);
 }
 const seen=new Set();let reviewed=0;
 for(const receipt of receipts){
  const id=key(receipt),u=expected.get(id);
  if(!u||seen.has(id)){failures.push('SOURCE_REVIEW_UNKNOWN_OR_DUPLICATE:'+id);continue}
  seen.add(id);
  if(receipt.hash!==u.hash){failures.push('SOURCE_REVIEW_HASH_MISMATCH:'+id);continue}
  const source=norm(u.text),quote=norm(receipt.quote),summary=norm(receipt.summary);
  if(summary.length<12||summary.length>360||generic.test(summary)){failures.push('SOURCE_REVIEW_EMPTY_SUMMARY:'+id);continue}
  if(source.length===0){
   if(receipt.status!=='empty'||quote.length!==0){failures.push('SOURCE_REVIEW_EMPTY_SOURCE_MISMATCH:'+id);continue}
  }else{
   if(receipt.status!=='reviewed'||quote.length<Math.min(10,source.length)||quote.length>240||!source.includes(quote)){
    failures.push('SOURCE_REVIEW_QUOTE_NOT_IN_SOURCE:'+id);continue;
   }
  }
  reviewed++;
 }
 for(const id of expected.keys())if(!seen.has(id))failures.push('SOURCE_REVIEW_MISSING_UNIT:'+id);
 if(receipts.length!==units.length)failures.push('SOURCE_REVIEW_COUNT_MISMATCH');
 return {complete:failures.length===0&&reviewed===units.length,reviewedUnits:reviewed,totalUnits:units.length,coverageRate:units.length?reviewed/units.length:0,failures:failures.slice(0,100),verificationScope:'source-anchored-model-review_receipts_not_independent_comprehension'};
}
