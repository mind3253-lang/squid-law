/** SQL uses the PRE-increment attempts count when computing next_run_at. */
export function errorRetryDelayMs(attempts){
 const n=typeof attempts==='number'?attempts:typeof attempts==='string'&&/^(0|[1-9]\d*)$/.test(attempts)?Number(attempts):NaN;
 if(!Number.isSafeInteger(n)||n<0)return null;
 return Math.min(3600,2**Math.min(n,10))*1000+1250;
}
export function shouldPromptlyRedispatch(attempts){
 const n=typeof attempts==='number'?attempts:typeof attempts==='string'&&/^(0|[1-9]\d*)$/.test(attempts)?Number(attempts):NaN;
 return Number.isSafeInteger(n)&&n>=0&&n<4;
}
