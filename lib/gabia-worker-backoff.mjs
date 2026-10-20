// Pure retry pacing for continuous worker transport/provider failures.
export function workerFailureDelayMs(failures){
 if(!Number.isSafeInteger(failures)||failures<0)throw Error('INVALID_FAILURE_COUNT');
 return failures===0?0:Math.min(30000,1000*2**Math.min(5,failures-1));
}
