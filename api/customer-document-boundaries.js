// Candidate legal document boundaries; never equate these with verified document identities.
const types=[['지급명령신청서',/지\s*급\s*명\s*령\s*신\s*청\s*서/],['이의신청서',/이\s*의\s*신\s*청\s*서/],['준비서면',/준\s*비\s*서\s*면/],['답변서',/답\s*변\s*서/],['소장',/(?:^|\n)\s*소\s*장\s*(?:\n|$)/],['판결문',/(?:^|\n)\s*판\s*결\s*(?:\n|$)/],['결정문',/(?:^|\n)\s*결\s*정\s*(?:\n|$)/],['변론조서',/변\s*론\s*조\s*서/]];
export function candidateDocuments(pages){
 const groups=new Map();for(const p of pages){if(!groups.has(p.documentId))groups.set(p.documentId,[]);groups.get(p.documentId).push(p)}
 const sections=[];for(const [documentId,raw] of groups){const ordered=[...raw].sort((a,b)=>a.page-b.page);let current=null;
 for(const p of ordered){const heading=types.find(([,re])=>re.test(String(p.text||'').slice(0,1000)));const kind=heading?.[0]||null;
 if(!current||(kind&&kind!==current.kind)){if(current)sections.push(current);current={documentId,filename:p.filename,kind:kind||'미분류',startPage:p.page,endPage:p.page,pages:[],classification:'미검증 후보'}}
 current.pages.push(p.page);current.endPage=p.page;
 }if(current)sections.push(current)}
 return {sections,coveredPages:sections.reduce((n,s)=>n+s.pages.length,0),verified:false};
}
