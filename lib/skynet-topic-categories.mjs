/**
 * Shared multi-label topical categories for personal SKYNET memory.
 * Categories are evidence tags, not exclusive folders. A passage can
 * be simultaneously a business, a person, and a knowledge memory.
 * Privacy is deliberately omitted from automatic tagging: private
 * workspace access remains governed by its existing explicit lock.
 */
export const TOPIC_CATEGORIES=Object.freeze([
 {id:'people',label:'인물 · 인간관계'},
 {id:'legal',label:'법률 · 사건'},
 {id:'business',label:'사업 · 업무'},
 {id:'development',label:'프로젝트 · 개발'},
 {id:'finance',label:'재산 · 금융'},
 {id:'lifestyle',label:'건강 · 생활'},
 {id:'interests',label:'지식 · 관심사'},
 {id:'preferences',label:'사용자 설정 · 취향'},
]);
export const TOPIC_IDS=TOPIC_CATEGORIES.map(x=>x.id);
const PATTERNS={
 people:[
 /사제|부장님|법원형|마가스님|영일|스승|후배|제자|은사|주변s*사람|인간관계|인연|배우자|아내|남편|와이프|형님|가족|친구|지인|동생|부부|형제|가까운s*사람/i,
 /사람.{0,18}(관계|평가|도움|선택|배신|보호|개입|의리)|(?:관계|도와|보호).{0,18}사람|부탁하는s*사람|같이s*해보자/i
 ],
 legal:[/소송|소장|판결|변론|변호사|재판|피고|원고|법원(?!형)|사건번호|증거번호|공탁|가압류|가처분|민사|형사|고소|고발|경찰|수사|계약서|법률|법령|청구취지|부당이득|명도|이송|병합|법원형이s*아닌s*법원/i],
 business:[/사업|장사|가게|매장|영업|시화성|서브마린|다이빙풀|풀장|교육생|강사|매출|손님|광고|마케팅|홍보|식당|짜장|짬뽕|운영|직원|대행사|고객|예약|프리다이빙|수조|여과|가격경쟁|사업가/i],
 development:[/스카이넷|skynet|squidlaw|스키드로우|오징어로펌|github|vercel|cloudflare|서버|코딩|개발|프로그래밍|소스코드|프로젝트|api\b|db\b|데이터베이스|홈페이지|웹사이트|배포|인덱스|검색엔진|앱개발|버그|파이프라인|백엔드|프론트엔드/i],
 finance:[/재산|금융|대출|은행|계좌|부동산|보증금|채무|채권|회수|대여금|세금|정산|신용|이자|보험|압류|담보|현금흐름|자금|공사비|임대료|투자|순이익|인건비|수익|차임/i],
 lifestyle:[/건강|몸|체력|운동|병원|수면|잠|식습관|식사|휴식|의사|검진|아프|휴가|일상|생활|출퇴근|집안|청소|여행|산책|명절|추석|새벽|노후|은퇴|시골집/i],
 interests:[/사주|명리|명리학|신살|구성학|주역|팔자|운명|요범사훈|성명학|불교|조계종|승려|스님|절\b|법고|템플스테이|독서|출판|책을|책을s*만들|역사|철학|심리|공부|배움|지식|취미|관심|유튜브|다음카페|네이버|노키아|코닥|야후|루비콘|연못가의s*기도/i],
 preferences:[/선호|취향|싫어|좋아|원칙|규칙|스타일|말투|반말|기억해|명시적s*지시|판단s*기준|우선순위|결정했|확정했|수정해|다시s*제안|반복s*설명|각주|답변s*방식|간결|길게s*말|고\s*~|복사해서|서식|레이아웃/i]
};
const normalize=s=>String(s||'').normalize('NFKC');
export function classifyTopics(text,{category='',title=''}={}){
 const content=normalize(text),hint=normalize(category),heading=normalize(title);
 const found=[];
 for(const topic of TOPIC_CATEGORIES){
  const regexes=PATTERNS[topic.id];
  if(regexes.some(rx=>rx.test(content)))found.push(topic.id);
 }
 // Legacy categories help only when the passage's own words lack an obvious
 // domain. Never tag all parts of a large mixed-topic transcript based on title.
 if(!found.length){
  const labels={
   people:/인물|관계|사람|사제/,legal:/법률|소송|사건/,business:/사업|서브마린|시화성|마케팅|다이빙/,
   development:/개발|프로젝트|it|스카이넷/i,finance:/재산|금융/,lifestyle:/건강|생활/,
   interests:/지식|관심|사주|명리/,preferences:/취향|설정|선호/
  };
  for(const [id,rx] of Object.entries(labels))if(rx.test(hint))found.push(id);
  if(!found.length&&/GENOME_두런두런|두런두런_MASTER/.test(heading))found.push('people','interests');
 }
 return found;
}
export function categoryDigestEntries(entries,{source='',name='',maxExamples=7}={}){
 const counts=Object.fromEntries(TOPIC_IDS.map(t=>[t,0]));
 const examples=Object.fromEntries(TOPIC_IDS.map(t=>[t,[]]));
 let classified=0;
 for(const item of entries){
  const content=String(item?.content||item?.text||'');
  if(!content.trim())continue;
  const tags=classifyTopics(content,{category:item.category||'',title:item.title||name});
  if(!tags.length)continue;
  classified++;
  for(const id of tags){
   counts[id]++;
   if(examples[id].length<maxExamples){
    const match=PATTERNS[id].map(rx=>rx.exec(content)).find(Boolean);
    const start=Math.max(0,(match?.index||0)-110);
    examples[id].push({
     part:String(item.part||'0'),page:Number.isFinite(Number(item.page))&&item.page!=null?Number(item.page):null,
     text:content.slice(start,start+370),at:item.at||null,role:item.role||null,
    });
   }
  }
 }
 return {version:1,source,name: String(name||'').slice(0,180),
  units:entries.length,classified,counts,examples,indexedAt:new Date().toISOString()};
}
