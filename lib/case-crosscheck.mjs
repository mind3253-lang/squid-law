const polarity=text=>/(?:아니|없다|부인|불인정|미지급|지급하지|해지하지|동의하지)/.test(text)?'negative':/(?:인정|지급하였|지급했다|동의하였|체결하였|존재한다)/.test(text)?'positive':'unknown';
const normalize=text=>String(text||'').replace(/\s+/g,' ').trim();
const meaningfulTerm=term=>typeof term==='string'&&term.trim().length>=2&&!['주장','인정','반박','부인','증거','입증','청구취지','청구원인'].includes(term.trim());
const sourceKey=source=>[source?.documentId,source?.page,source?.part,source?.hash].join(':');
export function detectOpposingStatements(results){
 if(!Array.isArray(results))throw Error('INVALID_REVIEW_RESULTS');
 const candidates=[],seen=new Set(),byTerm=new Map();
 const rows=[];
 for(const r of results)for(const c of r.claimCandidates||[]){const p=polarity(c.text);if(p!=='unknown')rows.push({...c,polarity:p})}
 for(const row of rows)for(const term of new Set((row.terms||[]).filter(meaningfulTerm))){if(!byTerm.has(term))byTerm.set(term,[]);byTerm.get(term).push(row)}
 for(const [term,group] of byTerm){
  const positives=group.filter(x=>x.polarity==='positive'),negatives=group.filter(x=>x.polarity==='negative');
  const negativesByDocument=new Map();
  for(const row of negatives){const doc=row.source?.documentId||'';if(!negativesByDocument.has(doc))negativesByDocument.set(doc,[]);negativesByDocument.get(doc).push(row)}
  for(const a of positives)for(const [doc,opposing] of negativesByDocument){
   if(a.source?.documentId===doc)continue;
   for(const b of opposing){
   // Different speakers or subjects cannot be inferred from a shared keyword alone.
   // Keep only review candidates and preserve the full provenance for each side.
   if(sourceKey(a.source)===sourceKey(b.source))continue;
   const id=[a.id||JSON.stringify(a.source),b.id||JSON.stringify(b.source)].sort().join(':');if(seen.has(id))continue;seen.add(id);
   candidates.push({type:'possible_opposing_statements',status:'unverified_candidate',sharedTerms:[term],sameSubjectVerified:false,speakerAttributionVerified:false,first:{text:normalize(a.text),source:a.source},second:{text:normalize(b.text),source:b.source},requiresHumanOrModelReview:true});
   if(candidates.length>=10000)return {candidates,truncated:true,verified:false};
   }
  }
 }

 return {candidates,truncated:false,verified:false};
}
