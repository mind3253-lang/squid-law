import {sourceIndex} from './case-reasoning.mjs';
export function partitionReasoningUnits(units,{maxCharacters=80000,maxUnits=100}={}){
 if(!Array.isArray(units)||!Number.isSafeInteger(maxCharacters)||maxCharacters<1000||!Number.isSafeInteger(maxUnits)||maxUnits<1)throw Error('INVALID_REASONING_PARTITION');
 sourceIndex(units);
 const batches=[],seen=new Set();let current=[],chars=0;
 const flush=()=>{if(current.length){batches.push({batch:batches.length,units:current,characters:chars,sourceCount:current.length});current=[];chars=0}};
 for(const unit of units){
  const id=[unit.documentId,unit.page,unit.part,unit.hash].join(':');
  if(seen.has(id))throw Error('DUPLICATE_REASONING_SOURCE');seen.add(id);
  if(unit.text.length>maxCharacters)throw Error('SOURCE_UNIT_EXCEEDS_CONTEXT');
  if(current.length&&(chars+unit.text.length>maxCharacters||current.length>=maxUnits))flush();
  current.push(unit);chars+=unit.text.length;
 }
 flush();
 const checked=batches.flatMap(b=>b.units);
 if(checked.length!==units.length||checked.some((u,i)=>u!==units[i]))throw Error('REASONING_SOURCE_COVERAGE_FAILURE');
 return {batches,unitCount:units.length,characters:units.reduce((n,u)=>n+u.text.length,0),complete:true};
}
