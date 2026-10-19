// Safe operator inspection: reads only the loopback health process.
const url='http://127.0.0.1:'+(process.env.SQUIDLAW_HEALTH_PORT||'3081')+'/diagnostics';
try{
 const response=await fetch(url,{signal:AbortSignal.timeout(3000)});
 if(!response.ok)throw Error('HTTP_'+response.status);
 const data=await response.json();
 if(data?.service!=='squidlaw-health'||data?.analysisExecuted!==false)throw Error('INVALID_HEALTH_RESPONSE');
 console.log(JSON.stringify({
  health:'reachable',service:data.service,uptimeSeconds:data.uptimeSeconds,
  processMemoryMiB:data.process?.memoryMiB,
  systemLoadAverage:data.system?.loadAverage,
  systemFreeMemoryMiB:data.system?.freeMemoryMiB,
  systemTotalMemoryMiB:data.system?.totalMemoryMiB,
  workerStatus:'NOT_CHECKED',customerApiStatus:'NOT_CHECKED',databaseStatus:'NOT_CHECKED',
  aiStatus:'NOT_CHECKED',analysisExecuted:false
 },null,2));
}catch(e){
 console.log(JSON.stringify({health:'unavailable',reason:e.name==='TimeoutError'?'TIMEOUT':
  e.message==='fetch failed'?'CONNECTION_FAILED':'HEALTH_CHECK_FAILED',
  workerStatus:'NOT_CHECKED',customerApiStatus:'NOT_CHECKED',analysisExecuted:false},null,2));
 process.exitCode=1;
}
