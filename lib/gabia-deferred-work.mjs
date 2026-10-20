// Detached work survives the HTTP response in the long-running Gabia process.
export function deferWork(promise){
 Promise.resolve(promise).catch(error=>console.error('GABIA_DEFERRED_WORK_ERROR',String(error?.message||error).slice(0,200)));
 return true;
}
