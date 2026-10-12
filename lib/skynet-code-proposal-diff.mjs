export function summarizeCodeDiff(before,after,{maxLines=160}={}){
 if(typeof before!=='string'||typeof after!=='string')throw Error('INVALID_DIFF_INPUT');
 const a=before.split('\n'),b=after.split('\n');let start=0;
 while(start<Math.min(a.length,b.length)&&a[start]===b[start])start++;
 let suffix=0;while(suffix<Math.min(a.length-start,b.length-start)&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++;
 const removed=a.slice(start,a.length-suffix),added=b.slice(start,b.length-suffix);
 return {changed:before!==after,firstChangedLine:start+1,removedLines:removed.length,addedLines:added.length,preview:[...removed.slice(0,Math.floor(maxLines/2)).map(s=>'- '+s),...added.slice(0,Math.floor(maxLines/2)).map(s=>'+ '+s)].slice(0,maxLines).join('\n'),truncated:removed.length+added.length>maxLines};
}
