export function canComplete(checkpoint){return checkpoint?.verified===true&&Array.isArray(checkpoint.evidence)&&checkpoint.evidence.length>0}

export function evidenceCount(checkpoint){return Array.isArray(checkpoint?.evidence)?checkpoint.evidence.length:0}
