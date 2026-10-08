// Local-only, bounded search over PDF-extracted page text.
export function searchDocumentPages(documents,query,{limit=100,offset=0}={}){
 const needle=String(query||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase();
 if(needle.length<2||needle.length>200)throw Error('INVALID_SEARCH_QUERY');
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('INVALID_SEARCH_LIMIT');
 if(!Number.isInteger(offset)||offset<0)throw Error('INVALID_SEARCH_OFFSET');
 const results=[];let total=0;
 for(let d=0;d<documents.length;d++)for(let p=0;p<documents[d].pages.length;p++){
  const text=documents[d].pages[p].text||'';
  const normalized=text.normalize('NFKC').replace(/\s+/g,' ');
  const at=normalized.toLocaleLowerCase().indexOf(needle);
  if(at<0)continue;
  total++;
  if(total>offset&&results.length<limit)results.push({documentIndex:d,pageIndex:p,name:documents[d].name,snippet:normalized.slice(Math.max(0,at-70),Math.min(normalized.length,at+needle.length+100))});
 }
 const effectiveOffset=total?Math.min(offset,Math.floor((total-1)/limit)*limit):0;
 return {total,results,offset,hasPrevious:offset>0&&total>0,hasNext:total>offset+results.length,truncated:total>offset+results.length,offsetOutOfRange:offset>0&&offset>=total,suggestedOffset:effectiveOffset};
}
