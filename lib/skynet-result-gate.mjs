export function canComplete(checkpoint){return checkpoint?.verified===true&&Array.isArray(checkpoint.evidence)&&checkpoint.evidence.length>0}
