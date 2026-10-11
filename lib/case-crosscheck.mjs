const polarity=text=>/(?:아니|없다|부인|불인정|미지급|지급하지|해지하지|동의하지)/.test(text)?'negative':/(?:인정|지급하였|지급했다|동의하였|체결하였|존재한다)/.test(text)?'positive':'unknown';
const normalize=text=>String(text||'').replace(/\s+/g,' ').trim();
export function detectOpposingStatements(results){
 if(!Array.isArray(results))throw Error('INVALID_REVIEW_RESULTS');
 const candidates=[],seen=new Set();
 const rows=results.flatMap(r=>(r.claimCandidates||[]).map(c=>({...c,polarity:polarity(c.text)}))).filter(r=>r.polarity!=='unknown');
 for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
  const a=rows[i],b=rows[j];
  if(a.source?.documentId===b.source?.documentId||a.polarity===b.polarity)continue;
  const shared=(a.terms||[]).filter(t=>(b.terms||[]).includes(t));
  if(!shared.length)continue;
  const id=[a.id,b.id].sort().join(':');if(seen.has(id))continue;seen.add(id);
  candidates.push({type:'possible_opposing_statements',status:'unverified_candidate',sharedTerms:shared,first:{text:normalize(a.text),source:a.source},second:{text:normalize(b.text),source:b.source},requiresHumanOrModelReview:true});
 }
 return candidates;
}
