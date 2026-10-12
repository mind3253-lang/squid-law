export function retryableReadFailure(reason){return /^UPSTREAM_(429|500|502|503|504)$/.test(String(reason||''))}
