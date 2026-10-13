document.addEventListener('DOMContentLoaded',()=>{const sidebar=document.createElement('aside');sidebar.id='skynetSidebar';sidebar.innerHTML='<button type="button" id="skynetSidebarToggle" title="사이드바 펼치기" aria-label="사이드바 펼치기" aria-expanded="false"></button><nav id="skynetSidebarPanel" aria-label="SKYNET 관리 도구"><strong>관리 도구</strong></nav>';document.body.append(sidebar);const tools=document.createElement('div');tools.id='skynetToolContent';tools.innerHTML='<button class="skynetToolClose" type="button">✕ 닫기</button>';document.body.append(tools);const panel=document.getElementById('skynetSidebarPanel'),toggle=document.getElementById('skynetSidebarToggle');const warehouse=document.createElement('section');warehouse.id='skynetWarehouse';document.body.append(warehouse);warehouse.innerHTML='<h2>자료창고</h2><p class="muted" id="warehouseStatus">자료 목록 불러오는 중…</p><div id="warehouseRows"></div>';const categories=document.createElement('section');categories.id='skynetCategories';document.body.append(categories);categories.hidden=true;categories.style.display='none';categories.innerHTML='<h2>기억 저장소</h2><p class="muted">게놈 원본 분류 상태를 확인 중…</p><button type="button" id="skynetCategoryRetry" style="padding:6px 10px;margin:8px 0">재분류 재시도</button><div id="skynetCategoryRows"></div><div id="skynetCategoryDetails" hidden></div>';const categoryLabels=['인물 · 인간관계','법률 · 사건','사업 · 업무','프로젝트 · 개발','재산 · 금융','건강 · 생활','지식 · 관심사','사용자 설정 · 취향','프라이버시'];for(const label of categoryLabels){const row=document.createElement('div');row.textContent=label==='프라이버시'?'🔒 프라이버시':label;row.style.padding='12px';row.style.borderBottom='1px solid #e4e8ef';if(label==='프라이버시'){row.setAttribute('aria-disabled','true');row.title='암구호로만 진입하는 비밀대화';}categories.querySelector('#skynetCategoryRows').append(row)}const items=[['skynetWarehouse','자료창고']];const profile=[...document.querySelectorAll('body > section')].find(n=>n.querySelector('h3')?.textContent.includes('오징어 장기 성격'));if(profile){profile.id='skynetProfileManager';profile.hidden=true}const memory=document.querySelector('section.internal-memory');if(memory){memory.id='skynetMemoryManager';memory.hidden=true}const icons=['▤','◷','▦','⚙','▧','▧'];const memoryHeader=document.createElement('div');memoryHeader.className='skynetToolLink';memoryHeader.textContent='▧  기억 저장소';memoryHeader.style.cssText='padding:12px 14px;font-weight:600';panel.append(memoryHeader);const memoryList=document.createElement('div');memoryList.id='skynetSidebarCategories';memoryList.style.cssText='padding-left:14px';panel.append(memoryList);let warehouseLoaded=false;
const categoryIds=['people','legal','business','development','finance','lifestyle','interests','preferences'];
const sourcePrefixes=['skynet/document-segments/','skynet/documents/','skynet/imports/','skynet/memory/','skynet/records/','skynet/db/'];
let categoryDashboard=null,categoryLoading=false,categoryQueued=false;
let categoryRunning=false,categoryMigrationAttempted=false,categoryError='';
const catPause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function updateCategoryCounts(message=''){
 if(message)categoryError=message;
 const rows=categories.querySelector('#skynetCategoryRows').children;
 const ready=!!categoryDashboard;
 for(let i=0;i<8;i++){
  const count=ready?Number(categoryDashboard.counts?.[categoryIds[i]]||0):null;
  rows[i].dataset.topic=categoryIds[i];
  rows[i].textContent=categoryLabels[i]+' · '+(count===null?'불러오는 중':count+'구간')+
    (ready&&!categoryDashboard.complete?' · 기존 자료 확인 중':'');
  rows[i].title=ready?'이미 색인된 원문 구간 수 · 여러 주제로 중복 분류 가능':'분류 DB 연결 대기';
 }
 const status=categories.querySelector('.muted');
 const progress=categoryDashboard?.backfill||[];
 const processed=progress.reduce((n,p)=>n+(Number(p.processed)||0),0);
 const failed=progress.reduce((n,p)=>n+(Number(p.failed)||0),0);
 const done=progress.filter(p=>p.complete).length;
 status.textContent=ready?
  '색인 출처 '+categoryDashboard.sourceCount+'개 · '+processed+'개 기존 원본 확인 · '+
  done+'/'+sourcePrefixes.length+'개 영역 완료'+(failed?' · 실패 '+failed+'건':'')+
  (categoryDashboard.complete?' · 실시간 집계 준비 완료':categoryRunning?' · 기존 자료 백그라운드 정리 중':' · 기존 자료 분류 대기')+
  (categoryError?' · '+categoryError:''):
  '분류 요약 연결 중'+(categoryError?' · '+categoryError:'');
 renderSidebarCategories();
}
async function loadCategories({force=false}={}){
 if(categoryLoading){if(force)categoryQueued=true;return}
 categoryLoading=true;
 try{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  let response;
  try{response=await fetch('/admin/skynet-category-dashboard',{
   credentials:'same-origin',cache:'no-store',signal:controller.signal
  })}finally{clearTimeout(timer)}
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok)throw Error(data.detail||data.error||'HTTP '+response.status);
  categoryDashboard=data;categoryError='';
  updateCategoryCounts();
  // Old data is migrated once, in the background; all subsequent page loads
  // require one summary query, not thousands of Blob reads.
  if(!data.complete&&!categoryMigrationAttempted&&!categoryRunning){
   categoryMigrationAttempted=true;
   setTimeout(()=>void runFastClassification(),900);
  }
 }catch(e){categoryError='요약 조회 실패: '+e.message;updateCategoryCounts()}
 finally{
  categoryLoading=false;
  if(categoryQueued){categoryQueued=false;setTimeout(()=>void loadCategories({force:true}),500)}
 }
}
async function requestCategoryBatch(body,timeout=28000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetch('/admin/skynet-category-fast-backfill',{
   method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
   body:JSON.stringify(body),signal:controller.signal
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok)throw Error(data.detail||data.error||'HTTP '+response.status);
  return data;
 }finally{clearTimeout(timer)}
}
async function runFastClassification(){
 if(categoryRunning)return;
 // Web Locks prevent duplicate tabs; SQL leases prevent duplicate devices
 // and concurrent server functions from indexing the same source page.
 if(navigator.locks?.request){
  return navigator.locks.request('skynet-category-migrate',{ifAvailable:true},async lock=>{
   if(lock)await runFastClassificationUnlocked();
   else updateCategoryCounts('다른 탭에서 기존 자료 분류 중');
  });
 }
 return runFastClassificationUnlocked();
}
async function runFastClassificationUnlocked(){
 if(categoryRunning)return;
 categoryRunning=true;
 updateCategoryCounts();
 let ticks=0,failedRequests=0;
 try{
  const worker=async prefix=>{
   while(categoryRunning){
    if(document.getElementById('sendChat')?.disabled){await catPause(1800);continue}
    let result;
    try{result=await requestCategoryBatch({action:'step',prefix})}
    catch(e){
     failedRequests++;
     categoryError=prefix+' 작업 일시 중단: '+e.message;
     break;
    }
    if(result.complete)break;
    if(result.busy){await catPause(2000);continue}
    ticks++;
    if(ticks%3===0){void loadCategories({force:true})}
    await catPause(50);
   }
  };
  // At most three prefix workers, bounded by the server's DB leases.
  for(let i=0;i<sourcePrefixes.length;i+=3){
   await Promise.all(sourcePrefixes.slice(i,i+3).map(worker));
  }
 }finally{
  categoryRunning=false;
  await loadCategories({force:true});
  if(failedRequests)updateCategoryCounts('일부 분류 작업 실패 · 재분류 재시도로 복구');
 }
}
window.addEventListener('skynet:category-index-changed',()=>{void loadCategories({force:true})});
const retryButton=document.getElementById('skynetCategoryRetry');
if(retryButton)retryButton.onclick=async()=>{
 if(categoryRunning)return;
 retryButton.disabled=true;
 try{
  const response=await fetch('/admin/skynet-category-dashboard',{
   method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
   body:JSON.stringify({action:'reset'})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok)throw Error(data.error||'재분류 초기화 실패');
  categoryMigrationAttempted=true;
  await runFastClassification();
 }catch(e){updateCategoryCounts('재분류 재시도 실패: '+e.message)}
 finally{retryButton.disabled=false}
};
renderSidebarCategories();
void loadCategories();
window.addEventListener('skynet:source-added',()=>{
 // New sources are indexed at write time and read via one fresh aggregate.
 setTimeout(()=>void loadCategories({force:true}),300);
});
function renderSidebarCategories(){memoryList.replaceChildren();for(const [i,row] of [...categories.querySelector('#skynetCategoryRows').children].entries()){const label=row.textContent;const el=document.createElement('div');el.textContent=label;el.style.cssText='padding:9px 10px;font-size:12px;white-space:nowrap';if(label.includes('프라이버시')){el.style.opacity='.55';el.title='암구호 전용 · 목록 접근 불가';}if(!label.includes('프라이버시')){el.style.cursor='pointer';el.onclick=()=>openMemoryCategory(i)}memoryList.append(el)}}const sideIcons=['users','scale','briefcase-business','code-2','wallet','heart-pulse','book-open','sliders-horizontal','lock-keyhole'];
const sideSvg=paths=>'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
const glyphs=[
'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
'<path d="M12 3v18M5 6h14M7 6 3 14h8L7 6Zm10 0-4 8h8l-4-8ZM5 21h14"/>',
'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
'<path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-11-2 14"/>',
'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M16 14h5M3 9h18"/>',
'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
'<path d="M12 7v14M3 18V5a2 2 0 0 1 2-2h3a4 4 0 0 1 4 4 4 4 0 0 1 4-4h3a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2h-3a4 4 0 0 0-4 4 4 4 0 0 0-4-4H5a2 2 0 0 0-2 2Z"/>',
'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
];
const decorateSidebar=()=>{[...memoryList.children].forEach((node,i)=>{const label=node.textContent;node.classList.add('skynetMemoryNavItem');node.title=label;node.setAttribute('aria-label',label);node.innerHTML=sideSvg(glyphs[i]||glyphs[6])+'<span class="skynetMemoryNavText"></span>';node.querySelector('.skynetMemoryNavText').textContent=label})};
const sideObserver=new MutationObserver(decorateSidebar);sideObserver.observe(memoryList,{childList:true});decorateSidebar();
memoryHeader.innerHTML=sideSvg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/>')+'<span class="skynetToolText">기억 저장소</span>';
memoryHeader.title='기억 저장소';
async function openMemoryCategory(index){
 const id=categoryIds[index];if(!id)return;
 const wrap=categories.querySelector('#skynetCategoryDetails');wrap.replaceChildren();wrap.hidden=false;
 const back=document.createElement('button');back.type='button';back.textContent='← 전체 분류';
 back.onclick=()=>{wrap.hidden=true;categories.querySelector('#skynetCategoryRows').hidden=false};
 const heading=document.createElement('h3');heading.textContent=categoryLabels[index];
 const status=document.createElement('p');status.className='muted';
 const total=Number(categoryDashboard?.counts?.[id]||0);
 status.textContent='분류된 원문 '+total+'구간 · 출처 근거를 필요한 만큼만 불러와';
 const results=document.createElement('div'),more=document.createElement('button');
 more.type='button';more.textContent='관련 원문 더 보기';
 wrap.append(back,heading,status,results,more);
 categories.querySelector('#skynetCategoryRows').hidden=true;
 categories.style.display='block';categories.hidden=false;tools.append(categories);tools.classList.add('active');
 let offset=0,busy=false;
 async function nextPage(){
  if(busy)return;busy=true;more.disabled=true;status.textContent='관련 출처 검색 중…';
  try{
   const url='/admin/skynet-category-dashboard?topic='+encodeURIComponent(id)+'&offset='+offset+'&limit=20';
   const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.ok)throw Error(data.detail||data.error||'HTTP '+response.status);
   let shown=0;
   for(const file of data.records||[]){
    for(const example of (file.examples?.[id]||[]).slice(0,5)){
     const article=document.createElement('article');article.className='item';article.style.margin='8px 0';
     const title=document.createElement('strong');
     title.textContent=(file.name||'원문 자료')+(example.page?' · '+example.page+'쪽':'');
     const excerpt=document.createElement('p');excerpt.style.whiteSpace='pre-wrap';
     excerpt.textContent=String(example.text||'');
     const provenance=document.createElement('p');provenance.className='muted';
     provenance.textContent='출처: '+file.source+' · 위치: '+(example.part||'미확인')+(example.at?' · 기록일: '+example.at:'');
     article.append(title,excerpt,provenance);results.append(article);shown++;
    }
   }
   offset=data.nextOffset??offset;
   more.hidden=!data.hasMore;
   status.textContent='관련 원문 '+total+'구간 · 현재 미리보기 '+results.children.length+'건'+
    (data.errors?.length?' · 출처 일부 조회 실패 '+data.errors.length+'개':'');
   if(!shown&&results.children.length===0){
    const empty=document.createElement('p');
    empty.textContent=categoryDashboard?.complete?'이 항목의 원문 미리보기가 없습니다.':'기존 게놈 자료를 정리 중이야. 현재 색인된 출처만 표시해.';
    results.append(empty);
   }
  }catch(e){status.textContent='관련 원문 조회 실패: '+e.message}
  finally{busy=false;more.disabled=false}
 }
 more.onclick=()=>void nextPage();
 await nextPage();
}
async function recoverWarehouseNames(){let messages=[];try{const raw=JSON.parse(localStorage.getItem('skynet_chat_v1')||'[]');if(Array.isArray(raw))messages=raw}catch{}let recovered=0;for(const m of messages){const a=m?.archive;if(!a||!a.name||!a.batch||!a.parts||!a.size)continue;try{const r=await fetch('/admin/skynet-warehouse',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({name:a.name,batch:a.batch,parts:a.parts,size:a.size})});if(r.ok)recovered++}catch{}}return recovered}
async function loadWarehouse(){const status=document.getElementById('warehouseStatus'),wrap=document.getElementById('warehouseRows');status.textContent='자료 목록 불러오는 중…';try{await recoverWarehouseNames();const r=await fetch('/admin/skynet-warehouse',{credentials:'same-origin',cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error||'조회 실패');wrap.replaceChildren();const table=document.createElement('table');table.className='skynetWarehouseTable';const head=document.createElement('thead');head.innerHTML='<tr><th>파일명</th><th>등록일</th><th>형식</th></tr>';table.append(head);const body=document.createElement('tbody');for(const f of j.items||[]){const tr=document.createElement('tr');for(const v of [f.name,f.uploadedAt?new Date(f.uploadedAt).toLocaleString('ko-KR'):'—',f.type||'—']){const td=document.createElement('td');td.textContent=v;tr.append(td)}body.append(tr)}table.append(body);wrap.append(table);status.textContent='이름 확인 '+(j.namedCount??j.total??0)+'개 · 원본 업로드 '+(j.originalBatchCount??'확인 불가')+'묶음 ('+(j.originalChunkCount??'—')+'조각) · 이름 연결 안 된 묶음 '+(j.unidentifiedBatchCount??'—')+'개';warehouseLoaded=true}catch(e){status.textContent='자료 조회 실패: '+e.message}}const nodes=[];for(const [id,label] of items){const node=document.getElementById(id);if(!node)continue;nodes.push(node);tools.append(node);node.hidden=true;const b=document.createElement('button');b.type='button';b.className='skynetToolLink';b.title=label;b.setAttribute('aria-label',label);const ico=document.createElement('span');ico.className='skynetToolIcon';ico.textContent=icons[items.findIndex(item=>item[0]===id)]||'▣';const txt=document.createElement('span');txt.className='skynetToolText';txt.textContent=label;b.append(ico,txt);b.onclick=()=>{if(id==='skynetWarehouse'&&!warehouseLoaded)loadWarehouse();if(id==='skynetCategories')loadCategories();nodes.forEach(n=>n.hidden=n!==node);panel.querySelectorAll('.skynetToolLink').forEach(x=>x.classList.toggle('active',x===b));tools.classList.add('active')};panel.append(b)}toggle.onclick=()=>{const open=sidebar.classList.toggle('open');document.body.classList.toggle('skynet-sidebar-open',open);toggle.setAttribute('aria-expanded',String(open));toggle.title=open?'사이드바 접기':'사이드바 펼치기';toggle.setAttribute('aria-label',toggle.title);if(!open)tools.classList.remove('active')};toggle.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg>';tools.querySelector('.skynetToolClose').onclick=()=>{tools.classList.remove('active');nodes.forEach(n=>n.hidden=true)}});
document.addEventListener('DOMContentLoaded',()=>{
const composer=document.getElementById('chatComposer'),bar=composer?.querySelector('.composerbar'),reason=document.getElementById('skynetReasoning'),input=document.getElementById('chatInput');
if(!composer||!bar)return;
if(input)input.placeholder='SKYNET에게 이야기하세요.';
const helper=bar.querySelector('.muted');if(helper)helper.textContent='파일은 대화창에 끌어놓을 수 있습니다.';
const label=reason?.parentElement;if(label){label.id='skynetReasoningLabel';label.textContent='추론 수준 ';label.append(reason);bar.insertBefore(label,document.getElementById('sendChat'))}
const attachment=document.getElementById('archivePickButton');if(attachment){attachment.title='파일 첨부';attachment.setAttribute('aria-label','파일 첨부')}
const send=document.getElementById('sendChat');if(send){send.title='보내기';send.setAttribute('aria-label','보내기')}
const status=document.getElementById('archiveStatus');if(status){status.textContent='파일은 대화창에 끌어놓을 수 있습니다.';const observer=new MutationObserver(()=>{if(status.textContent==='파일을 선택해 첨부한 뒤 보내기를 누르세요.')status.textContent='파일은 대화창에 끌어놓을 수 있습니다.';status.classList.toggle('skynet-status-alert',/실패|오류|제한|초과|필요/.test(status.textContent))});observer.observe(status,{childList:true,characterData:true,subtree:true})}
const pending=document.getElementById('pendingFiles');
if(pending){
 const cache=new Map(),objectUrls=new Map();
 const capture=files=>{for(const f of files)cache.set(f.name,f)};
 composer.addEventListener('drop',e=>capture(e.dataTransfer?.files||[]),true);
 document.getElementById('archivePickInput')?.addEventListener('change',e=>capture(e.target.files||[]),true);
 let pdfLibrary;
 const loadPdf=()=>pdfLibrary||(pdfLibrary=new Promise((resolve,reject)=>{
   if(window.pdfjsLib){resolve(window.pdfjsLib);return}
   const script=document.createElement('script');
   script.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
   script.onload=()=>{if(!window.pdfjsLib){reject(Error('PDF renderer unavailable'));return}
     window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
     resolve(window.pdfjsLib)};
   script.onerror=()=>reject(Error('PDF renderer could not load'));
   document.head.append(script);
 })).catch(err=>{pdfLibrary=null;throw err});
 async function renderPdf(file,preview,node){
   try{
     const lib=await loadPdf();
     const bytes=new Uint8Array(await file.arrayBuffer());
     const doc=await lib.getDocument({data:bytes}).promise;
     const page=await doc.getPage(1);
     const viewport=page.getViewport({scale:1});
     const scale=Math.min(2,150/viewport.width,170/viewport.height);
     const view=page.getViewport({scale});
     const canvas=document.createElement('canvas');
     canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
     await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;
     if(node.isConnected){preview.replaceChildren(canvas);preview.classList.remove('skynet-preview-loading')}
     await doc.destroy();
   }catch(err){
     if(node.isConnected){preview.classList.remove('skynet-preview-loading');preview.textContent='PDF';preview.title='미리보기를 표시할 수 없습니다'}
   }
 }
 const update=()=>{
   for(const node of pending.querySelectorAll('[data-archive-pending]')){
     if(node.dataset.previewReady)continue;
     node.dataset.previewReady='1';
     const raw=node.firstChild?.textContent||'';
     const filename=raw.replace(/^📎\s*/,'').split(' · ')[0];
     const file=cache.get(filename);
     const remove=node.querySelector('button');
     const name=document.createElement('span');name.className='skynet-file-name';name.textContent=filename;name.title=filename;
     const preview=document.createElement('div');preview.className='skynet-file-preview';
     if(file && (file.type.startsWith('image/')||/\.(png|jpe?g)$/i.test(filename))){
       const img=document.createElement('img');img.alt=filename;
       const url=URL.createObjectURL(file);objectUrls.set(node,url);img.src=url;preview.append(img);
     }else if(file && /\.pdf$/i.test(filename)){
       preview.textContent='PDF';preview.classList.add('skynet-preview-loading');
       renderPdf(file,preview,node);
     }else{
       preview.textContent=/\.pdf$/i.test(filename)?'PDF':'▤';
     }
     node.replaceChildren(preview,name);
     if(remove){remove.textContent='×';remove.title='첨부 삭제';remove.setAttribute('aria-label',filename+' 삭제');node.append(remove)}
   }
   for(const [node,url] of objectUrls)if(!node.isConnected){URL.revokeObjectURL(url);objectUrls.delete(node)}
 };
 new MutationObserver(update).observe(pending,{childList:true});update();
}

});
