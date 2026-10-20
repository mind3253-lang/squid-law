// Read-only SKYNET admin queue progress summary, no customer text exposed.
export function skynetProgress({completed=0,total=0,status='queued'}={}){
 if(!Number.isSafeInteger(completed)||!Number.isSafeInteger(total)||total<0||completed<0||completed>total)throw Error('INVALID_SKYNET_PROGRESS');
 const percent=total===0?0:Math.floor(100*completed/total);
 return {percent,status,color:percent<20?'yellow':percent<85?'blue':'green'};
}
export function skynetSearchTerms(query){
 if(typeof query!=='string'||query.length>300)throw Error('INVALID_SKYNET_SEARCH');
 return [...new Set(query.trim().toLowerCase().split(/\s+/).filter(Boolean))].slice(0,12);
}
