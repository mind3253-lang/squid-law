// Local-only, bounded search over PDF-extracted page text.
export function searchDocumentPages(documents,query,{limit=100}={}){
 const needle=String(query||'').trim().toLocaleLowerCase();
 if(needle.length<2||needle.length>200)throw Error('INVALID_SEARCH_QUERY');
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('INVALID_SEARCH_LIMIT');
 const results=[];let total=0;
 for(let d=0;d<documents.length;d++)for(let p=0;p<documents[d].pages.length;p++){
  const text=documents[d].pages[p].text||'';
  const at=text.toLocaleLowerCase().indexOf(needle);
  if(at<0)continue;
  total++;
  if(results.length<limit)results.push({documentIndex:d,pageIndex:p,name:documents[d].name,snippet:text.slice(Math.max(0,at-70),Math.min(text.length,at+needle.length+100)).replace(/\s+/g,' ')});
 }
 return {total,results,truncated:total>results.length};
}
