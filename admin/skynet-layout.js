document.addEventListener('DOMContentLoaded',()=>{const sidebar=document.createElement('aside');sidebar.id='skynetSidebar';sidebar.innerHTML='<button type="button" id="skynetSidebarToggle" title="사이드바 펼치기" aria-label="사이드바 펼치기" aria-expanded="false"></button><nav id="skynetSidebarPanel" aria-label="SKYNET 관리 도구"><strong>관리 도구</strong></nav>';document.body.append(sidebar);const tools=document.createElement('div');tools.id='skynetToolContent';tools.innerHTML='<button class="skynetToolClose" type="button">✕ 닫기</button>';document.body.append(tools);const panel=document.getElementById('skynetSidebarPanel'),toggle=document.getElementById('skynetSidebarToggle');const items=[['indexManager','장기기억 검색 인덱스'],['timelineManager','사건별 타임라인'],['dataManager','저장 데이터 관리']];const profile=[...document.querySelectorAll('body > section')].find(n=>n.querySelector('h3')?.textContent.includes('오징어 장기 성격'));if(profile){profile.id='skynetProfileManager';items.push(['skynetProfileManager','오징어 성격 · 사용자 취향'])}const memory=document.querySelector('section.internal-memory');if(memory){memory.id='skynetMemoryManager';items.push(['skynetMemoryManager','기억 작업방'])}const icons=['▤','◷','▦','⚙','▧'];const nodes=[];for(const [id,label] of items){const node=document.getElementById(id);if(!node)continue;nodes.push(node);tools.append(node);node.hidden=true;const b=document.createElement('button');b.type='button';b.className='skynetToolLink';b.title=label;b.setAttribute('aria-label',label);const ico=document.createElement('span');ico.className='skynetToolIcon';ico.textContent=icons[items.findIndex(item=>item[0]===id)]||'▣';const txt=document.createElement('span');txt.className='skynetToolText';txt.textContent=label;b.append(ico,txt);b.onclick=()=>{nodes.forEach(n=>n.hidden=n!==node);panel.querySelectorAll('.skynetToolLink').forEach(x=>x.classList.toggle('active',x===b));tools.classList.add('active')};panel.append(b)}toggle.onclick=()=>{const open=sidebar.classList.toggle('open');document.body.classList.toggle('skynet-sidebar-open',open);toggle.setAttribute('aria-expanded',String(open));toggle.title=open?'사이드바 접기':'사이드바 펼치기';toggle.setAttribute('aria-label',toggle.title);if(!open)tools.classList.remove('active')};toggle.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg>';tools.querySelector('.skynetToolClose').onclick=()=>{tools.classList.remove('active');nodes.forEach(n=>n.hidden=true)}});
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
