/** SQL uses the PRE-increment attempts count when computing next_run_at. */
export function errorRetryDelayMs(attempts){
 const n=Number(attempts);
 if(!Number.isSafeInteger(n)||n<0)return null;
 return Math.min(3600,2**Math.min(n,10))*1000+1250;
}
export function shouldPromptlyRedispatch(attempts){
 return Number.isSafeInteger(Number(attempts))&&Number(attempts)>=0&&Number(attempts)<4;
}
