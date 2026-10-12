export function retryDelay(attempt){if(!Number.isSafeInteger(attempt)||attempt<0)throw Error('INVALID_ATTEMPT');return Math.min(3600000,1000*2**Math.min(attempt,12))}

export function shouldRetry(attempt,maxAttempts=5){return Number.isSafeInteger(attempt)&&attempt>=0&&Number.isSafeInteger(maxAttempts)&&maxAttempts>0&&attempt<maxAttempts}
