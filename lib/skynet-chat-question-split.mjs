/**
 * Divide headings numbered 1..N into independent AI work units.
 * The exact original must be durably saved separately before any unit runs.
 */
export function splitSkynetQuestions(input,{minQuestions=4,maxQuestions=30}={}){
 const text=String(input||'');
 const collect=re=>[...text.matchAll(re)].map(m=>({number:Number(m[1]),start:m.index,heading:m[0].trim()}));
 const explicit=collect(/^#{1,4}\s*(\d{1,2})\.\s+[^\n]+$/gm);
 const candidates=explicit.length>=minQuestions?explicit:collect(/^(\d{1,2})\.\s+[^\n]+$/gm);
 let best=[];
 for(let i=0;i<candidates.length;i++){
  if(candidates[i].number!==1)continue;
  const chain=[];
  for(let j=i;j<candidates.length&&chain.length<maxQuestions;j++){
   if(candidates[j].number!==chain.length+1)break;
   chain.push(candidates[j]);
  }
  if(chain.length>best.length)best=chain;
 }
 if(best.length<minQuestions)return null;
 const preamble=text.slice(0,best[0].start).trim();
 const sections=best.map((part,i)=>{
  const end=i+1<best.length?best[i+1].start:text.length;
  const body=text.slice(part.start,end).trim();
  return {number:part.number,heading:part.heading,body,
   prompt:(preamble?preamble+'\n\n':'')+body};
 });
 return {count:sections.length,preamble,sections,sourceLength:text.length};
}
