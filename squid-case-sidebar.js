document.addEventListener('DOMContentLoaded',()=>{
 const categories=[
 ['대여·금전','wallet'],['임대·명도','house'],['매매·물품','package'],
 ['공사·용역','hammer'],['손해·부당','scale'],['계약분쟁','file'],
 ['채권·가압류','shield']
 ];
 const icons={wallet:'₩',house:'⌂',package:'▣',hammer:'⚒',scale:'⚖',file:'▤',shield:'◇'};
 const sidebar=document.createElement('aside');sidebar.id='squidCaseSidebar';
 sidebar.setAttribute('aria-label','내 사건 분석 메뉴');
 const toggle=document.createElement('button');toggle.type='button';toggle.className='squidSidebarToggle';
 toggle.setAttribute('aria-label','사이드바 펼치기');toggle.title='사이드바 펼치기';
 toggle.setAttribute('aria-expanded','false');
 toggle.innerHTML='<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg>';
 sidebar.append(toggle);
 const nav=document.createElement('nav');nav.className='squidSidebarNav';
 const title=document.createElement('strong');title.className='squidSidebarHeading';title.textContent='내 사건 분석';nav.append(title);
 const selected=new URLSearchParams(location.search).get('case');
 categories.forEach(([name,icon],index)=>{
  const link=document.createElement('a');link.href='customer.html?case='+String(index+1);
  link.title=name;link.setAttribute('aria-label',name);link.className='squidSidebarLink';
  if(location.pathname.endsWith('/customer.html')&&selected===String(index+1)){link.classList.add('active');link.setAttribute('aria-current','page')}
  const mark=document.createElement('span');mark.className='squidSidebarIcon';mark.textContent=icons[icon];
  const label=document.createElement('span');label.className='squidSidebarLabel';label.textContent=name;
  link.append(mark,label);nav.append(link);
 });
 sidebar.append(nav);
 const bottom=document.createElement('div');bottom.className='squidSidebarBottom';
 const my=document.createElement('a');my.href='mypage.html';my.className='squidSidebarLink';my.title='마이페이지';my.setAttribute('aria-label','마이페이지');
 if(location.pathname.endsWith('/mypage.html')){my.classList.add('active');my.setAttribute('aria-current','page')}
 const icon=document.createElement('span');icon.className='squidSidebarIcon';icon.textContent='♙';
 const label=document.createElement('span');label.className='squidSidebarLabel';label.textContent='마이페이지';
 my.append(icon,label);bottom.append(my);sidebar.append(bottom);
 document.body.append(sidebar);document.body.classList.add('squid-has-sidebar');
 const saved=localStorage.getItem('squid-sidebar-open')==='1';
 function setOpen(open){sidebar.classList.toggle('open',open);document.body.classList.toggle('squid-sidebar-open',open);toggle.setAttribute('aria-expanded',String(open));toggle.title=open?'사이드바 접기':'사이드바 펼치기';toggle.setAttribute('aria-label',toggle.title);localStorage.setItem('squid-sidebar-open',open?'1':'0')}
 setOpen(saved);toggle.addEventListener('click',()=>setOpen(!sidebar.classList.contains('open')));
 // Existing top nav, home case cards and analysis links remain unchanged.
});