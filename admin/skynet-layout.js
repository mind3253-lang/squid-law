document.addEventListener('DOMContentLoaded',()=>{const sidebar=document.createElement('aside');sidebar.id='skynetSidebar';sidebar.innerHTML='<button type="button" id="skynetSidebarToggle" title="사이드바 펼치기" aria-label="사이드바 펼치기" aria-expanded="false"></button><nav id="skynetSidebarPanel" aria-label="SKYNET 관리 도구"><strong>관리 도구</strong></nav>';document.body.append(sidebar);const tools=document.createElement('div');tools.id='skynetToolContent';tools.innerHTML='<button class="skynetToolClose" type="button">✕ 닫기</button>';document.body.append(tools);const panel=document.getElementById('skynetSidebarPanel'),toggle=document.getElementById('skynetSidebarToggle');const warehouse=document.createElement('section');warehouse.id='skynetWarehouse';document.body.append(warehouse);warehouse.innerHTML='<h2>자료창고</h2><p class="muted" id="warehouseStatus">자료 목록 불러오는 중…</p><div id="warehouseRows"></div>';const categories=document.createElement('section');categories.id='skynetCategories';document.body.append(categories);categories.hidden=true;categories.style.display='none';categories.innerHTML='<h2>기억 저장소</h2><p class="muted">게놈 원본 분류 상태를 확인 중…</p><div id="skynetCategoryRows"></div><div id="skynetCategoryDetails" hidden></div>';const categoryLabels=['인물 · 인간관계','법률 · 사건','사업 · 업무','프로젝트 · 개발','재산 · 금융','건강 · 생활','지식 · 관심사','사용자 설정 · 취향','프라이버시'];for(const label of categoryLabels){const row=document.createElement('div');row.textContent=label==='프라이버시'?'🔒 프라이버시':label;row.style.padding='12px';row.style.borderBottom='1px solid #e4e8ef';if(label==='프라이버시'){row.setAttribute('aria-disabled','true');row.title='암구호로만 진입하는 비밀대화';}categories.querySelector('#skynetCategoryRows').append(row)}const items=[['skynetWarehouse','자료창고']];const profile=[...document.querySelectorAll('body > section')].find(n=>n.querySelector('h3')?.textContent.includes('오징어 장기 성격'));if(profile){profile.id='skynetProfileManager';profile.hidden=true}const memory=document.querySelector('section.internal-memory');if(memory){memory.id='skynetMemoryManager';memory.hidden=true}const icons=['▤','◷','▦','⚙','▧','▧'];const memoryHeader=document.createElement('div');memoryHeader.className='skynetToolLink';memoryHeader.textContent='▧  기억 저장소';memoryHeader.style.cssText='padding:12px 14px;font-weight:600';panel.append(memoryHeader);const memoryList=document.createElement('div');memoryList.id='skynetSidebarCategories';memoryList.style.cssText='padding-left:14px';panel.append(memoryList);let warehouseLoaded=false;
const categoryIds=['people','legal','business','development','finance','lifestyle','interests','preferences'];
const sourcePrefixes=['skynet/imports/','skynet/memory/','skynet/documents/','skynet/document-segments/','skynet/records/','skynet/db/'];
const categorySources=new Map();
let categoryLoading=false,categoryReadErrors=0,categoryLoadedAll=false,categoryTimer;
function backfillComplete(){
 try{const state=JSON.parse(localStorage.getItem('skynet_index_cursor_v2_topic_categories')||'{}');
  return sourcePrefixes.every(p=>state['done:'+p]===true)&&!sourcePrefixes.some(p=>state['error:'+p]);
 }catch{return false}
}
function updateCategoryCounts(progress=''){
 const rows=categories.querySelector('#skynetCategoryRows').children;
 const complete=categoryLoadedAll&&backfillComplete()&&categoryReadErrors===0;
 for(let i=0;i<8;i++){
  const id=categoryIds[i];let total=0,sources=0;
  for(const record of categorySources.values()){const n=Number(record.counts?.[id])||0;if(n){total+=n;sources++}}
  rows[i].dataset.topic=id;
  rows[i].textContent=categoryLabels[i]+' · '+(complete?total+'건':total?total+'건 이상 · 분류 중':'집계 중');
  rows[i].title=total?'관련 원본 '+sources+'개 출처 확인':'원본 분류 완료 전에는 0건으로 확정하지 않습니다';
 }
 categories.querySelector('.muted').textContent='원본 '+categorySources.size+'개 출처 분류 확인'+
  (complete?' · 전체 재분류 완료':' · 기존 자료 재분류 진행/확인 필요')+
  (categoryReadErrors?' · 읽기 오류 '+categoryReadErrors+'건':'')+(progress?' · '+progress:'');
 renderSidebarCategories();
}
async function loadCategories(){
 if(categoryLoading)return;
 categoryLoading=true;categoryLoadedAll=false;categoryReadErrors=0;
 updateCategoryCounts('분류 자료 불러오는 중');
 try{
  const found=new Map();let cursor,read=0;
  do{
   const url='/api/skynet-categories?limit=40'+(cursor?'&cursor='+encodeURIComponent(cursor):'');
   const r=await fetch(url,{credentials:'same-origin',cache:'no-store'}),j=await r.json().catch(()=>({}));
   if(!r.ok||!Array.isArray(j.records))throw Error(j.error||'HTTP '+r.status);
   for(const record of j.records)if(record&&record.source)found.set(record.source,record);
   categoryReadErrors+=(j.errors||[]).length;
   cursor=j.hasMore&&j.nextCursor?j.nextCursor:null;
   read+=j.scanned||0;
   categorySources.clear();for(const [key,value] of found)categorySources.set(key,value);
   updateCategoryCounts('출처 '+read+'개 조사');
   if(read>50000){categoryReadErrors++;break}
  }while(cursor);
  categoryLoadedAll=!cursor;
  updateCategoryCounts();
 }catch(e){categories.querySelector('.muted').textContent='분류 조회 실패: '+e.message+' · 원본 부재를 뜻하지 않음';renderSidebarCategories()}
 finally{categoryLoading=false}
}
function requestCategoryRefresh(){clearTimeout(categoryTimer);categoryTimer=setTimeout(loadCategories,5500)}
window.addEventListener('skynet:category-index-changed',requestCategoryRefresh);
function renderSidebarCategories(){memoryList.replaceChildren();for(const [i,row] of [...categories.querySelector('#skynetCategoryRows').children].entries()){const label=row.textContent;const el=document.createElement('div');el.textContent=label;el.style.cssText='padding:9px 10px;font-size:12px;white-space:nowrap';if(label.includes('프라이버시')){el.style.opacity='.55';el.title='암구호 전용 · 목록 접근 불가';}if(!label.includes('프라이버시')){el.style.cursor='pointer';el.onclick=()=>openMemoryCategory(i)}memoryList.append(el)}}renderSidebarCategories();loadCategories();
const sideIcons=['users','scale','briefcase-business','code-2','wallet','heart-pulse','book-open','sliders-horizontal','lock-keyhole'];
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
function openMemoryCategory(index){
 const id=categoryIds[index];if(!id)return;
 const wrap=categories.querySelector('#skynetCategoryDetails');wrap.replaceChildren();wrap.hidden=false;
 const back=document.createElement('button');back.type='button';back.textContent='← 전체 분류';
 back.onclick=()=>{wrap.hidden=true;categories.querySelector('#skynetCategoryRows').hidden=false};
 const h=document.createElement('h3');h.textContent=categoryLabels[index];wrap.append(back,h);
 categories.querySelector('#skynetCategoryRows').hidden=true;
 const entries=[];let total=0;
 for(const file of categorySources.values()){
  const n=Number(file.counts?.[id])||0;if(!n)continue;total+=n;
  for(const example of file.examples?.[id]||[])entries.push({source:file.source,name:file.name,...example});
 }
 const meta=document.createElement('p');meta.className='muted';
 meta.textContent='관련 구간 '+total+'건'+(backfillComplete()&&categoryLoadedAll?'':' 이상 · 재분류 진행 중')+' · 원문 미리보기';
 wrap.append(meta);
 if(!entries.length){const p=document.createElement('p');p.textContent='이 분류에서 아직 검색 가능한 원문이 확인되지 않았습니다. 분류가 완료되기 전까지 0건으로 확정하지 않습니다.';wrap.append(p)}
 let shown=0;
 const more=document.createElement('button');more.type='button';more.textContent='기억 미리보기 더 보기';
 more.onclick=()=>{const batch=entries.slice(shown,shown+70);
  for(const item of batch){
   const article=document.createElement('article');article.className='item';article.style.margin='8px 0';
   const title=document.createElement('strong');title.textContent=(item.name||'원본 자료')+(item.page?' · '+item.page+'쪽':'');
   const excerpt=document.createElement('p');excerpt.style.whiteSpace='pre-wrap';excerpt.textContent=item.text;
   const provenance=document.createElement('p');provenance.className='muted';
   provenance.textContent='출처: '+item.source+' · 위치: '+(item.part||'미확인')+(item.at?' · 기록일: '+item.at:'');
   article.append(title,excerpt,provenance);wrap.insertBefore(article,more);
  }
  shown+=batch.length;more.hidden=shown>=entries.length;
 };
 wrap.append(more);more.click();
 categories.style.display='block';categories.hidden=false;tools.append(categories);tools.classList.add('active');
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
