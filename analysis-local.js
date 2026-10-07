// Browser-only preliminary index. This is not legal advice or an AI conclusion.
const datePattern=/(?:20\d{2})\s*[.년\-/]\s*(?:0?[1-9]|1[0-2])\s*[.월\-/]\s*(?:0?[1-9]|[12]\d|3[01])\s*일?/g;
const refPattern=/(?:소[갑을]\s*제?\s*\d+\s*호증(?:의\s*\d+)?|제\s*\d+\s*항|\d{4}[가-힣]{1,5}\d{3,})/g;
const signal=/(주장|반박|인정|부인|제출|요청|신청|계약|해지|종료|취소|삭제|게시|지급|반환|판결|결정|증거|진술|위반)/;
function snippets(text){return text.split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(x=>x.length>=12&&x.length<=420)}
function source(d,p,s){return {document:d.name,page:p+1,text:s}}
export function buildLocalIndex(documents){
 const timeline=[],claims=[],references=[],seen=new Map(),repeated=[];
 for(const d of documents)for(let i=0;i<d.pages.length;i++){
  const text=d.pages[i].text||'';
  for(const s of snippets(text)){
   const dates=[...s.matchAll(datePattern)].map(m=>m[0]);
   const refs=[...s.matchAll(refPattern)].map(m=>m[0]);
   if(dates.length)timeline.push({...source(d,i,s),dates:[...new Set(dates)]});
   if(signal.test(s))claims.push(source(d,i,s));
   if(refs.length)references.push({...source(d,i,s),refs:[...new Set(refs)]});
   const key=s.replace(/\s+/g,'').replace(/[“”"'‘’]/g,'');
   if(key.length>=28){const old=seen.get(key);if(old&&old.document!==d.name){if(!repeated.some(x=>x.text===s))repeated.push({text:s,first:old,second:source(d,i,s)})}else if(!old)seen.set(key,source(d,i,s));}
  }
 }
 return {documents:documents.map(d=>({name:d.name,pages:d.pages.length,empty:d.pages.filter(p=>!p.text).length})),timeline,claims,references,repeated,generatedAt:new Date().toISOString(),limitations:'문자열 기반 예비 색인입니다. 날짜가 사건 발생일인지 제출일인지, 문장이 당사자의 주장인지 인용인지 자동 확정하지 않습니다. 반복 문구는 모순을 뜻하지 않습니다. AI 판단 및 원본 진위 검증은 수행하지 않습니다.'};
}
function el(tag,text){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e}
function section(root,title,items,formatter,max=40){
 const wrap=el('section');wrap.style.margin='22px 0';wrap.append(el('h3',title));
 if(!items.length){wrap.append(el('p','해당 항목을 찾지 못했습니다.'));root.append(wrap);return}
 const count=el('p',items.length+'건 검색 · 최초 '+Math.min(items.length,max)+'건 표시');count.className='notice';wrap.append(count);
 const list=el('ol');list.style.paddingLeft='24px';
 items.slice(0,max).forEach(x=>{const li=el('li');li.style.marginBottom='12px';const label=el('strong',formatter(x));li.append(label,el('p',x.text));li.lastChild.style.whiteSpace='pre-wrap';li.lastChild.style.margin='4px 0';list.append(li)});
 wrap.append(list);root.append(wrap);
}
export function renderLocalIndex(root,data){
 root.replaceChildren();
 root.append(el('h2','사건자료 1차 색인'));
 root.append(el('p','PDF '+data.documents.length+'개 · 원문 기반 검색 결과. 법률적 결론이나 사실 확정이 아닙니다.'));
 const empty=data.documents.reduce((a,d)=>a+d.empty,0);
 if(empty)root.append(el('p','주의: 텍스트가 없는 페이지 '+empty+'쪽은 이 색인에서 누락되었습니다. 스캔 PDF는 별도 문자 인식이 필요합니다.'));
 section(root,'날짜가 포함된 원문',data.timeline,x=>x.dates.join(' / ')+' · '+x.document+' · '+x.page+'쪽');
 section(root,'주요 표현이 포함된 원문',data.claims,x=>x.document+' · '+x.page+'쪽');
 section(root,'증거번호·항목·사건번호 후보',data.references,x=>x.refs.join(', ')+' · '+x.document+' · '+x.page+'쪽');
 section(root,'서로 다른 문서의 동일 문구',data.repeated,x=>x.first.document+' '+x.first.page+'쪽 ↔ '+x.second.document+' '+x.second.page+'쪽');
 root.append(el('p',data.limitations));
}
export function plainReport(data){
 let out='SQUID LAW · PDF 원문 1차 색인\n'+data.documents.map(d=>d.name+' ('+d.pages+'쪽)').join('\n')+'\n\n';
 for(const [title,items] of [['날짜 원문',data.timeline],['주요 표현',data.claims],['증거·항목·사건번호',data.references]]){
  out+='['+title+'] '+items.length+'건\n';for(const x of items)out+=x.document+' / '+x.page+'쪽\n'+x.text+'\n\n';
 }
 out+='[동일 문구] '+data.repeated.length+'건\n';for(const x of data.repeated)out+=x.first.document+' '+x.first.page+'쪽 / '+x.second.document+' '+x.second.page+'쪽\n'+x.text+'\n\n';
 return out+'\n'+data.limitations;
}
