/* SQUIDLAW intake guidance: client-side advisory only; never changes paid records. */
(()=>{
'use strict';
const TYPES=[
 {name:'대여·금전',terms:['빌려준 돈','빌린 돈','차용증','대여금','차용금','금전소비대차','빌려줬','빌려주었']},
 {name:'임대·명도',terms:['임대차','월세','전세','보증금 반환','명도','임차인','임대인','차임']},
 {name:'매매·물품',terms:['매매대금','물품대금','납품대금','물건을 팔','상품대금','판매대금']},
 {name:'공사·용역',terms:['공사비','공사대금','인테리어','시공','하도급','용역대금','공사를 해','공사비를','공사 잔금']},
 {name:'손해·부당',terms:['손해배상','부당이득','불법행위','교통사고','배상금']},
 {name:'계약분쟁',terms:['계약해제','계약취소','계약위반','계약 해지']},
 {name:'채권·가압류',terms:['가압류','가처분','채권압류','압류명령']}
];
function classify(s){const q=(s||'').trim().toLowerCase();if(q.length<8)return null;const scored=TYPES.map((t,i)=>({i,score:t.terms.reduce((a,k)=>a+(q.includes(k)?1:0),0)})).sort((a,b)=>b.score-a.score);if(!scored[0].score||scored[0].score===scored[1].score)return null;return scored[0].i}
function start(){
 const root=document.getElementById('squid-intake');if(!root)return;
 const selected=new URLSearchParams(location.search).get('case');
 const current=/^[1-7]$/.test(selected||'')?Number(selected)-1:null;
 root.innerHTML='<h2>사건유형 확인 · AI 이용 안내</h2><p class="intake-muted">사건 내용을 간단히 적으면 해당 분쟁유형을 안내합니다. 이 단계에서는 AI 서버에 내용을 전송하지 않습니다.</p><label for="squid-intake-text">어떤 이유로 청구하거나 청구받았나요?</label><textarea id="squid-intake-text" rows="3" maxlength="1500" placeholder="예: 인테리어 공사를 완료했는데 공사비 3,000만 원을 못 받았습니다."></textarea><div class="intake-actions"><button type="button" id="squid-intake-check">분쟁유형 확인</button><button type="button" id="squid-intake-policy">AI 분석 원칙 보기</button></div><div id="squid-intake-result" role="status" aria-live="polite"></div>';
 const output=root.querySelector('#squid-intake-result'),input=root.querySelector('textarea');
 root.querySelector('#squid-intake-policy').onclick=()=>{output.innerHTML='<div class="intake-result"><b>SQUIDLAW의 분석 원칙</b><p>일반적인 무제한 AI 법률상담 대신 사건기록과 증거를 객관적으로 대조하고 출처를 확인하는 분석을 지향합니다. 사용자에게 유리한 결론이나 승소를 단정하지 않습니다. 분석자료를 토대로 변호사 자문 또는 직접 전자소송을 선택할 수 있습니다.</p><p>사건유형 및 이용방법은 안내하지만, 개별 사건의 승소 보장이나 법률대리 업무는 제공하지 않습니다.</p></div>'};
 root.querySelector('#squid-intake-check').onclick=()=>{
  const value=input.value.trim();output.replaceChildren();
  if(value.length<8){output.textContent='사건 발생 원인을 조금 더 구체적으로 입력해 주세요.';return}
  const i=classify(value);
  const box=document.createElement('div');box.className='intake-result';output.append(box);
  if(i===null){box.textContent='입력하신 내용만으로 사건유형을 특정하기 어렵습니다. 계약 관계와 돈을 청구하는 원인을 확인해 주세요. 자동으로 유형을 변경하지 않습니다.';return}
  const heading=document.createElement('b');heading.textContent='추천 분쟁유형: '+TYPES[i].name;box.append(heading);
  const p=document.createElement('p');p.textContent=current!==null&&current!==i?'현재 선택한 '+TYPES[current].name+'과 다릅니다. 금전 청구라도 발생 원인에 따라 분쟁유형이 달라집니다.':'입력한 사건의 주요 표현을 기준으로 분류한 참고 결과입니다. 복합 사건은 추가 확인이 필요합니다.';box.append(p);
  const link=document.createElement('a');link.href='customer.html?case='+(i+1);link.className='intake-link';link.textContent='해당 유형 안내로 이동';box.append(link);
  const note=document.createElement('p');note.className='intake-muted';note.textContent='이미 결제한 사건은 새로 결제하지 마세요. 현재 이동은 안내 화면 전환일 뿐, 기존 사건의 유형·결제·자료를 변경하지 않습니다. 실제 사건 변경은 로그인·사건 저장 기능 연동 후 제공됩니다.';box.append(note);
 };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();