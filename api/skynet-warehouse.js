import {list,get,put} from '@vercel/blob';
const auth=req=>{try{return !!process.env.ADMIN_PASSWORD&&String(req.headers.authorization||'').startsWith('Basic ')&&Buffer.from(String(req.headers.authorization).slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD}catch{return false}};
async function readJson(path){const file=await get(path,{access:'private'});if(!file||file.statusCode!==200)return null;const chunks=[];let size=0;for await(const c of file.stream){size+=c.length;if(size>1024*1024)return null;chunks.push(c)}return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
async function scan(prefix,max=10000){const files=[];let cursor;do{const p=await list({prefix,limit:1000,...(cursor?{cursor}:{})});files.push(...p.blobs);cursor=p.hasMore?p.cursor:undefined}while(cursor&&files.length<max);return files}
const send=(res,code,obj)=>res.status(code).json(obj);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
 if(!auth(req))return send(res,401,{error:'관리자 인증 필요'});
 try{
  if(req.method==='POST'){
   const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
   const batch=String(b.batch||''),name=String(b.name||''),parts=Number(b.parts),size=Number(b.size);
   if(!/^[a-zA-Z0-9_-]{8,80}$/.test(batch)||!name||name.length>255||!Number.isInteger(parts)||parts<1||parts>100||!Number.isSafeInteger(size)||size<1||size>104857600)return send(res,400,{error:'파일 정보 오류'});
   const chunks=await scan('skynet/uploads/'+batch+'/',101);
   if(chunks.length!==parts||chunks.reduce((n,f)=>n+f.size,0)!==size||Array.from({length:parts},(_,i)=>'skynet/uploads/'+batch+'/'+String(i).padStart(5,'0')+'.bin').some(p=>!chunks.some(c=>c.pathname===p)))return send(res,409,{error:'원본 업로드 확인 실패'});
   const path='skynet/warehouse/'+batch+'.json';
   const old=await get(path,{access:'private'}).catch(()=>null);
   if(old?.statusCode===200)return send(res,200,{ok:true,duplicate:true});
   await put(path,JSON.stringify({batch,name,parts,size,uploadedAt:new Date().toISOString()}),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});
   return send(res,200,{ok:true});
  }
  if(req.method!=='GET')return send(res,405,{error:'GET/POST only'});
  const [manifests,documents,memories,uploads]=await Promise.all([scan('skynet/warehouse/'),scan('skynet/documents/'),scan('skynet/memory/'),scan('skynet/uploads/')]);
  const items=[],known=new Set();
  for(let i=0;i<manifests.length;i+=15){const part=await Promise.all(manifests.slice(i,i+15).map(async f=>{try{return await readJson(f.pathname)}catch{return null}}));for(const d of part)if(d?.name&&d?.batch){known.add(d.batch);items.push({name:d.name,uploadedAt:d.uploadedAt,size:d.size,type:d.name.split('.').pop().toUpperCase(),source:'original',id:d.batch})}}
  for(let i=0;i<documents.length;i+=15){const part=await Promise.all(documents.slice(i,i+15).map(async f=>{try{return {d:await readJson(f.pathname),f}}catch{return null}}));for(const x of part)if(x?.d?.name){const d=x.d;if(!items.some(y=>y.name===d.name)){items.push({name:d.name,uploadedAt:d.createdAt||x.f.uploadedAt,size:null,type:d.name.split('.').pop().toUpperCase(),source:'processed',id:x.f.pathname})}}}
  // Legacy chat records may contain original filenames even when extraction failed.
  for(let i=0;i<memories.length;i+=15){const part=await Promise.all(memories.slice(i,i+15).map(async f=>{try{return {d:await readJson(f.pathname),f}}catch{return null}}));for(const x of part)for(const m of x?.d?.messages||[]){const match=String(m.content||'').match(/^📎\s+(.+?)\s+·\s+(?:서버 저장 완료|서버 보관 완료|원본 저장 완료|검색 기억 등록 완료)/);if(match&&!items.some(y=>y.name===match[1]))items.push({name:match[1],uploadedAt:x.d.savedAt||x.f.uploadedAt,size:null,type:match[1].split('.').pop().toUpperCase(),source:'history',id:x.f.pathname})}}
  const uploadBatches=new Map();
  for(const file of uploads){
   const m=file.pathname.match(/^skynet\/uploads\/([^/]+)\/(\d{5})\.bin$/);
   if(!m)continue;
   const batch=m[1],part=Number(m[2]);
   if(!uploadBatches.has(batch))uploadBatches.set(batch,{count:0,size:0,uploadedAt:file.uploadedAt,parts:new Set()});
   const v=uploadBatches.get(batch);v.count++;v.size+=file.size;v.parts.add(part);
   if(String(file.uploadedAt||'')<String(v.uploadedAt||''))v.uploadedAt=file.uploadedAt;
  }
  for(const [batch,v] of uploadBatches){
   if(known.has(batch))continue;
   const matching=items.find(x=>x.batch===batch);
   if(matching)continue;
   items.push({name:'원본 파일 · 이름 미확인 ('+batch.slice(0,8)+')',uploadedAt:v.uploadedAt,size:v.size,type:'미확인',source:'unidentified',id:batch,parts:v.count});
  }
  const unidentified=[...uploadBatches.keys()].filter(batch=>!known.has(batch));
  items.sort((a,b)=>String(b.uploadedAt||'').localeCompare(String(a.uploadedAt||'')));
  return send(res,200,{items,total:items.length,originalChunkCount:uploads.length,originalBatchCount:uploadBatches.size,unidentifiedBatchCount:unidentified.length,scope:'warehouse_documents_and_history',note:'과거 파일 중 원본 파일명 기록이 없는 업로드는 식별 불가'});
 }catch(e){return send(res,502,{error:'자료창고 조회 실패',detail:String(e.message).slice(0,150)})}
}