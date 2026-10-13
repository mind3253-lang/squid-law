/**
 * Split a user's numbered multi-question request into independent answer units.
 * This never rewrites or discards the original question; callers must save it
 * before running individual units. Require consecutive numbered headings.
 */
export function splitSkynetQuestions(input,{minQuestions=4,maxQuestions=30}={}){
 const text=String(input||'');
 const candidates=[...text.matchAll(/^(?:#{1,4}\s*)?(\d{1,2})\.\s+[^\n]+$/gm)]
  .map(m=>({number:Number(m[1]),start:m.index,heading:m[0].trim()}));
 const start=candidates.findIndex(x=>x.number===1);
 if(start<0)return null;
 const found=[];
 for(const current of candidates.slice(start)){
  if(current.number!==found.length+1)break;
  found.push(current);
  if(found.length>=maxQuestions)break;
 }
 if(found.length<minQuestions)return null;
 // A break in the sequence means part of the question might be misclassified.
 if(candidates.some(x=>x.start>found.at(-1).start&&x.number!==1&&x.number<=found.length))return null;
 const preamble=text.slice(0,found[0].start).trim();
 const sections=found.map((part,i)=>{
  const end=i+1<found.length?found[i+1].start:text.length;
  const body=text.slice(part.start,end).trim();
  return {number:part.number,heading:part.heading,body,
   prompt:(preamble?preamble+'\n\n':'')+body};
 });
 // When a final question follows the numbered section, keep it with the last.
 return {count:sections.length,preamble,sections,sourceLength:text.length};
}
