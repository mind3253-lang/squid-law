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
 const fileCache=new Map(),urls=new Map();
 const capture=files=>{for(const f of files)fileCache.set(f.name,f)};
 composer.addEventListener('drop',e=>capture(e.dataTransfer?.files||[]),true);
 document.getElementById('archivePickInput')?.addEventListener('change',e=>capture(e.target.files||[]),true);
 const update=()=>{
  for(const n of pending.querySelectorAll('[data-archive-pending]')){
   if(n.dataset.previewReady)continue;
   n.dataset.previewReady='1';
   const raw=n.firstChild?.textContent||'';
   const filename=raw.replace(/^📎\\s*/,'').split(' · ')[0];
   const f=fileCache.get(filename);
   const remove=n.querySelector('button');
   const name=document.createElement('span');name.className='skynet-file-name';name.textContent=filename;name.title=filename;
   const preview=document.createElement('div');preview.className='skynet-file-preview';
   if(f&&(f.type.startsWith('image/')||/\\.(png|jpe?g|gif|webp)$/i.test(filename))){
    const img=document.createElement('img');img.alt=filename;img.src=URL.createObjectURL(f);urls.set(n,img.src);preview.append(img);
   }else if(f&&/\\.pdf$/i.test(filename)){
    const frame=document.createElement('iframe');frame.title=filename+' 첫 페이지 미리보기';frame.loading='lazy';frame.tabIndex=-1;frame.src=URL.createObjectURL(f)+'#page=1&toolbar=0&navpanes=0&scrollbar=0';urls.set(n,frame.src.split('#')[0]);preview.append(frame);
   }else{
    const mark=document.createElement('span');mark.className='skynet-file-icon';mark.textContent=/\\.pdf$/i.test(filename)?'PDF':'▤';preview.append(mark);
   }
   n.replaceChildren(preview,name);
   if(remove){remove.textContent='×';remove.title='첨부 삭제';remove.setAttribute('aria-label',filename+' 삭제');n.append(remove)}
  }
  for(const [n,url] of urls)if(!n.isConnected){URL.revokeObjectURL(url);urls.delete(n)}
 };
 new MutationObserver(update).observe(pending,{childList:true});update();
}

});
