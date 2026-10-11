/* SQUIDLAW browser-only case archive prototype. Not server storage or billing. */
(()=>{'use strict';
const DB='squidlaw-case-preview-v2',STORE='documents';
let account=null;async function requireAccount(){if(account)return account;const r=await fetch('/api/customer-auth',{credentials:'same-origin',cache:'no-store'});const d=await r.json();if(!r.ok||!d.authenticated)throw Error('로그인이 필요합니다');account=d.id;return account}
const cases=[{id:'SL-20261007-001',type:'대여·금전'},{id:'SL-20261006-003',type:'임대·명도'}];
function db(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(STORE)){const s=d.createObjectStore(STORE,{keyPath:'id'});s.createIndex('caseId','caseId')}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function transaction(mode,action){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction(STORE,mode),s=t.objectStore(STORE);let req;try{req=action(s)}catch(e){d.close();reject(e);return}req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);t.oncomplete=()=>d.close();t.onerror=()=>reject(t.error)})}
async function records(caseId){const user=await requireAccount();const all=await transaction('readonly',s=>s.index('caseId').getAll(user+'::'+caseId));return all.sort((a,b)=>a.createdAt.localeCompare(b.createdAt))}
async function save(caseId,file,side='customer'){const user=await requireAccount();if(!cases.some(c=>c.id===caseId))throw Error('사건을 선택해 주세요.');if(file.type!=='application/pdf'&&!/\.pdf$/i.test(file.name))throw Error('현재 시험판은 PDF만 보관합니다. 다른 형식은 PDF로 변환한 후 올려 주세요.');if(file.size>30*1024*1024)throw Error('시험판 파일당 30MB 제한입니다.');const item={id:crypto.randomUUID(),caseId:user+'::'+caseId,side,name:file.name,size:file.size,createdAt:new Date().toISOString(),blob:file};await transaction('readwrite',s=>s.add(item));return item}
async function open(item){const url=URL.createObjectURL(item.blob),a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
const fmt=n=>(n/1024/1024).toFixed(2)+' MB';
function usage(items){const bytes=items.reduce((n,x)=>n+x.size,0);return {bytes,formatted:fmt(bytes)}}
window.SquidCasePreview={cases,records,save,open,usage,fmt};
})();
