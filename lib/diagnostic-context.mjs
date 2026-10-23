/** Safe, structured diagnostic metadata; no source text or credentials. */
const count=v=>Array.isArray(v)?v.length:null;
export function diagnoseDeltaSources({oldFinding,newFindings,sourceUnits,stage='revision'}={}){
 const oldRefs=count(oldFinding?.sources),newRefs=Array.isArray(newFindings)?newFindings.map(f=>count(f?.sources)):null;
 const units=count(sourceUnits);
 const reason=units===null?'SOURCE_UNITS_NOT_ARRAY':units===0?'SOURCE_UNITS_EMPTY':
  oldRefs===0?'OLD_FINDING_REFERENCES_MISSING':
  newRefs?.some(n=>n===0||n===null)?'NEW_FINDING_REFERENCES_MISSING':'SOURCE_UNITS_PRESENT';
 const recovery=reason==='SOURCE_UNITS_PRESENT'?'continue':
  reason==='SOURCE_UNITS_NOT_ARRAY'?'rebuild_input':
  reason==='SOURCE_UNITS_EMPTY'?'rebuild_source_references':'review_source_provenance';
 return {stage,reason,recovery,oldReferenceCount:oldRefs,newReferenceCounts:newRefs,sourceUnitCount:units};
}
export function attachDiagnosticContext(error,context){
 if(error&&typeof error==='object')Object.defineProperty(error,'diagnosticContext',{value:context,configurable:true});
 return error;
}
