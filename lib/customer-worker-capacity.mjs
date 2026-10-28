// Internal resource budget, NOT a maximum number of simultaneous customers.
// A worker is largely I/O-bound, but PDF extraction has memory/CPU bursts.
// Larger Gabia machines automatically acquire more independent job lanes.
export const WORKER_MEMORY_PER_JOB_BYTES=768*1024*1024;
export const WORKER_MEMORY_RESERVE_BYTES=512*1024*1024;

export function customerWorkerParallelism({cpuCount,totalMemoryBytes,
 memoryPerJobBytes=WORKER_MEMORY_PER_JOB_BYTES,
 memoryReserveBytes=WORKER_MEMORY_RESERVE_BYTES}){
 if(!Number.isSafeInteger(cpuCount)||cpuCount<1||
  !Number.isFinite(totalMemoryBytes)||totalMemoryBytes<=0||
  !Number.isFinite(memoryPerJobBytes)||memoryPerJobBytes<=0||
  !Number.isFinite(memoryReserveBytes)||memoryReserveBytes<0)
  throw Error('INVALID_WORKER_RESOURCE_BUDGET');
 const cpuLanes=Math.max(2,cpuCount*2);
 const memoryLanes=Math.max(1,Math.floor(Math.max(0,totalMemoryBytes-memoryReserveBytes)/memoryPerJobBytes));
 return Math.min(cpuLanes,memoryLanes);
}

export function workerMayBeginCycle({availableMemoryBytes,activeCycles}){
 if(!Number.isFinite(availableMemoryBytes)||availableMemoryBytes<0||
  !Number.isSafeInteger(activeCycles)||activeCycles<0)
  throw Error('INVALID_WORKER_MEMORY_STATUS');
 // Always let at least one lane make progress on constrained machines.
 // Additional lanes start only when there is room for another PDF window.
 return activeCycles===0||availableMemoryBytes>=WORKER_MEMORY_PER_JOB_BYTES;
}
