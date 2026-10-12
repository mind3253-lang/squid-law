export function retryDelay(attempt){if(!Number.isSafeInteger(attempt)||attempt<0)throw Error('INVALID_ATTEMPT');return Math.min(3600000,1000*2**Math.min(attempt,12))}
