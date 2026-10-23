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

/** Derive an evidence provenance trail without copying any customer document text. */
export function traceEvidenceLineage({baseline,delta,decisions,documents}={}){
 const old=Array.isArray(baseline?.findings)?baseline.findings:[];
 const fresh=Array.isArray(delta?.findings)?delta.findings:[];
 const known=new Set((Array.isArray(documents)?documents:[]).map(d=>d.id));
 const stats=items=>({findings:items.length,withReferences:items.filter(f=>Array.isArray(f?.sources)&&f.sources.length>0).length,withoutReferences:items.filter(f=>!Array.isArray(f?.sources)||!f.sources.length).length,unknownDocumentReferences:items.reduce((n,f)=>n+(f?.sources||[]).filter(r=>!known.has(r.documentId)).length,0)});
 const affected=(Array.isArray(decisions)?decisions:[]).filter(d=>d?.affected).map(d=>({oldIndex:d.index,newIndices:d.newFindingIndices||[],oldReferenceCount:old[d.index]?.sources?.length||0,newReferenceCounts:(d.newFindingIndices||[]).map(i=>fresh[i]?.sources?.length||0)}));
 return {baseline:stats(old),delta:stats(fresh),affected};
}
/** Read-only recommendations; never alter verified evidence or auto-approve legal findings. */
export function planDiagnosticRecovery(context){
 const reason=context?.reason||'UNKNOWN';
 if(['SOURCE_UNITS_EMPTY','OLD_FINDING_REFERENCES_MISSING','NEW_FINDING_REFERENCES_MISSING'].includes(reason))
  return {action:'inspect_verified_provenance',automatic:false,requiresEvidenceValidation:true};
 if(reason==='SOURCE_UNITS_NOT_ARRAY')return {action:'repair_input_shape',automatic:false,requiresEvidenceValidation:true};
 if(reason==='SOURCE_UNITS_PRESENT')return {action:'continue',automatic:true,requiresEvidenceValidation:false};
 return {action:'manual_investigation',automatic:false,requiresEvidenceValidation:true};
}
