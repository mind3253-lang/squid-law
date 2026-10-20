import {list,get,put,del} from '../lib/customer-object-storage.mjs';
import {createHash} from 'node:crypto';
const auth=req=>{try{return !!process.env.ADMIN_PASSWORD&&String(req.headers.authorization||'').startsWith('Basic ')&&Buffer.from(String(req.headers.authorization).slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD}catch{return false}};
async function readJson(path){const file=await get(path,{access:'private'});if(!file||file.statusCode!==200)return null;const chunks=[];let size=0;for await(const c of file.stream){size+=c.length;if(size>1024*1024)return null;chunks.push(c)}return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
async function scan(prefix,max=10000){const files=[];let cursor;do{const p=await list({prefix,limit:1000,...(cursor?{cursor}:{})});files.push(...p.blobs);cursor=p.hasMore?p.cursor:undefined}while(cursor&&files.length<max);return files}
const send=(res,code,obj)=>res.status(code).json(obj);
async function contentHash(chunks){
 const h=createHash('sha256');
 for(const f of [...chunks].sort((a,b)=>a.pathname.localeCompare(b.pathname))){
  const blob=await get(f.pathname,{access:'private'});
  if(!blob||blob.statusCode!==200)throw Error('원본 파일 읽기 실패');
  for await(const piece of blob.stream)h.update(piece);
 }
 return h.digest('hex');
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
 if(!auth(req))return send(res,401,{error:'관리자 인증 필요'});
 try{
  if(req.method==='POST'){
   const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
   const batch=String(b.batch||''),name=String(b.name||''),parts=Number(b.parts),size=Number(b.size);
   if(!/^[a-zA-Z0-9_-]{8,80}$/.test(batch)||!name||name.length>255||!Number.isInteger(parts)||parts<1||parts>99999||!Number.isSafeInteger(size)||size<1)return send(res,400,{error:'파일 정보 오류'});
   const chunks=await scan('skynet/uploads/'+batch+'/',parts+1);
   if(chunks.length!==parts||chunks.reduce((n,f)=>n+f.size,0)!==size||Array.from({length:parts},(_,i)=>'skynet/uploads/'+batch+'/'+String(i).padStart(5,'0')+'.bin').some(p=>!chunks.some(c=>c.pathname===p)))return send(res,409,{error:'원본 업로드 확인 실패'});
   const hash=await contentHash(chunks);
   // Content-addressed lookup: avoid fetching every warehouse manifest on each upload.
   const indexPath='skynet/warehouse-hashes/'+hash+'.json';
   const indexed=await readJson(indexPath).catch(()=>null);
   if(indexed?.batch&&indexed.batch!==batch){
    const canonical=await readJson('skynet/warehouse/'+indexed.batch+'.json').catch(()=>null);
    if(canonical?.hash===hash)return send(res,200,{ok:true,duplicate:true,canonicalBatch:indexed.batch,hash});
   }
   const path='skynet/warehouse/'+batch+'.json';
   const old=await get(path,{access:'private'}).catch(()=>null);
   if(old?.statusCode===200){
    const previous=await readJson(path);
    if(previous?.hash===hash){await put(indexPath,JSON.stringify({batch,hash}),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});return send(res,200,{ok:true,registered:true,hash});}
    if(previous?.hash&&previous.hash!==hash)return send(res,409,{error:'원본 해시 충돌'});
    await put(path,JSON.stringify({...previous,batch,name:previous?.name||name,parts,size,hash,uploadedAt:chunks.map(c=>c.uploadedAt).sort()[0]}),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});
    await put(indexPath,JSON.stringify({batch,hash}),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});
    return send(res,200,{ok:true,hash,updated:true});
   }
   await put(path,JSON.stringify({batch,name,parts,size,hash,uploadedAt:chunks.map(c=>c.uploadedAt).sort()[0]}),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});
   await put(indexPath,JSON.stringify({batch,hash}),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'}).catch(async e=>{const owner=await readJson(indexPath).catch(()=>null);if(owner?.batch!==batch)throw e});
   return send(res,200,{ok:true});
  }
  if(req.method==='PUT'){
   const uploads=await scan('skynet/uploads/');
   const manifests=await scan('skynet/warehouse/');
   const names=new Map();
   for(const m of manifests){const x=await readJson(m.pathname).catch(()=>null);if(x?.batch)names.set(x.batch,x)}
   const groups=new Map();
   for(const file of uploads){const m=file.pathname.match(/^skynet\/uploads\/([^/]+)\/(\d{5})\.bin$/);if(!m)continue;if(!groups.has(m[1]))groups.set(m[1],[]);groups.get(m[1]).push(file)}
   const verified=[];
   for(const [batch,parts] of groups){const ordered=parts.sort((a,b)=>a.pathname.localeCompare(b.pathname));if(ordered.some((x,i)=>!x.pathname.endsWith('/'+String(i).padStart(5,'0')+'.bin')))continue;verified.push({batch,parts:ordered,hash:names.get(batch)?.hash&&names.get(batch)?.parts===ordered.length&&names.get(batch)?.size===ordered.reduce((n,p)=>n+p.size,0)?names.get(batch).hash:await contentHash(ordered),date:String(ordered[0].uploadedAt||''),name:names.get(batch)})}
   const byHash=new Map();for(const item of verified){if(!byHash.has(item.hash))byHash.set(item.hash,[]);byHash.get(item.hash).push(item)}
   const duplicateGroups=[...byHash.values()].filter(g=>g.length>1);
   let deleted=0,failed=0;const failures=[];
   for(const group of duplicateGroups){group.sort((a,b)=>Number(!!b.name)-Number(!!a.name)||a.date.localeCompare(b.date));const keep=group[0];for(const extra of group.slice(1)){try{await del(extra.parts.map(x=>x.pathname));if(extra.name)await del('skynet/warehouse/'+extra.batch+'.json');deleted++}catch(e){failed++;failures.push(extra.batch+': '+String(e.message).slice(0,90))}}}
   return send(res,failed?207:200,{ok:failed===0,scanned:verified.length,duplicateGroups:duplicateGroups.length,deleted,failed,failures});
  }
  if(req.method!=='GET')return send(res,405,{error:'GET/POST only'});
  if(req.query?.mode==='hwp-retry'){
   const originals=await scan('skynet/warehouse/',12000);
   const records=[];
   for(let i=0;i<originals.length;i+=20){
    const group=await Promise.all(originals.slice(i,i+20).map(f=>readJson(f.pathname).catch(()=>null)));
    for(const d of group)if(d&&/\.(hwp|hwpx)$/i.test(d.name||'')&&/^[a-zA-Z0-9_-]{8,80}$/.test(d.batch||'')&&Number.isInteger(d.parts)&&d.parts>0&&d.parts<=100&&d.size<=25*1048576)
     records.push({name:d.name,batch:d.batch,parts:d.parts,uploadedAt:d.uploadedAt||''});
   }
   records.sort((a,b)=>b.uploadedAt.localeCompare(a.uploadedAt));
   return send(res,200,{items:records.slice(0,30)});
  }
  // Query a specific docket across BOTH indexed PDF manifests and original
  // uploaded-file registrations. A 100-most-recent index is not sufficient.
  if(req.query?.mode==='case-pdf'){
   const docket=String(req.query?.docket||'').replace(/\s+/g,'');
   if(!/^20\d{2}(?:가단|가합|가소|나|다|카기|카단|카합)\d{4,8}$/.test(docket))
    return send(res,400,{error:'INVALID_CASE_DOCKET'});
   const matches=name=>{
    const normalized=String(name||'').replace(/\s+/g,'');
    // Followed by a nondigit prevents 12878 from matching 128789.
    return normalized.includes(docket)&&
     new RegExp(docket+'(?!\\d)').test(normalized)&&/\.pdf$/i.test(name||'');
   };
   const [documentFiles,originalFiles]=await Promise.all([
    scan('skynet/documents/',12000),scan('skynet/warehouse/',12000)
   ]);
   const docs=[];
   for(let i=0;i<documentFiles.length;i+=20){
    const group=await Promise.all(documentFiles.slice(i,i+20).map(async f=>{
     if(!/^skynet\/documents\/[a-f0-9]{64}\.json$/.test(f.pathname))return null;
     const row=await readJson(f.pathname).catch(()=>null);
     if(!row||!matches(row.name)||row.hash+'.json'!==f.pathname.split('/').at(-1)||
      !Number.isSafeInteger(row.pageCount)||row.pageCount<1||
      !Number.isSafeInteger(row.segmentCount)||row.segmentCount<1)return null;
     return {name:row.name,hash:row.hash,pageCount:row.pageCount,
      indexed:true,updatedAt:row.completedAt||f.uploadedAt};
    }));
    docs.push(...group.filter(Boolean));
   }
   const existing=new Set(docs.map(x=>x.hash));
   const originals=[];
   for(let i=0;i<originalFiles.length;i+=20){
    const group=await Promise.all(originalFiles.slice(i,i+20).map(async f=>{
     const row=await readJson(f.pathname).catch(()=>null);
     if(!row||!matches(row.name)||!/^[a-f0-9]{64}$/.test(row.hash||'')||
      existing.has(row.hash)||!/^[a-zA-Z0-9_-]{8,80}$/.test(row.batch||'')||
      !Number.isInteger(row.parts)||row.parts<1||row.parts>99999)return null;
     return {name:row.name,hash:row.hash,batch:row.batch,parts:row.parts,
      indexed:false,updatedAt:row.uploadedAt||f.uploadedAt};
    }));
    originals.push(...group.filter(Boolean));
   }
   const unique=new Map();
   for(const item of [...docs,...originals]){
    if(!unique.has(item.hash)||item.indexed)unique.set(item.hash,item);
   }
   return send(res,200,{mode:'case-pdf',docket,
    items:[...unique.values()].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))),
    indexedCount:docs.length,originalCount:originals.length});
  }

  // Select a VERIFIED indexed PDF directly, without uploading or re-extracting.
  // Every option is bound to the immutable document SHA-256 and pageCount.
  if(req.query?.mode==='indexed-pdfs'){
   const docs=(await scan('skynet/documents/',5000))
    .filter(x=>/^skynet\/documents\/[a-f0-9]{64}\.json$/.test(x.pathname))
    .sort((a,b)=>String(b.uploadedAt||'').localeCompare(String(a.uploadedAt||'')))
    .slice(0,100);
   const indexed=[];
   for(let i=0;i<docs.length;i+=12){
    const batch=await Promise.all(docs.slice(i,i+12).map(async x=>{
     const row=await readJson(x.pathname).catch(()=>null);
     return row&&/^[a-f0-9]{64}$/.test(row.hash||'')&&
      x.pathname==='skynet/documents/'+row.hash+'.json'&&
      Number.isSafeInteger(row.pageCount)&&row.pageCount>0&&
      Number.isSafeInteger(row.segmentCount)&&row.segmentCount>0&&
      /\.pdf$/i.test(row.name||'')?
      {name:row.name,hash:row.hash,pageCount:row.pageCount,
       indexedAt:row.completedAt||x.uploadedAt}:null;
    }));
    indexed.push(...batch.filter(Boolean));
   }
   return send(res,200,{items:indexed,total:indexed.length,mode:'indexed-pdfs'});
  }

  // Fast retry selector: the original upload is already stored. Avoid scanning
  // every chat memory, search index and uploaded chunk just to find a PDF name.
  if(req.query?.mode==='pdf-retry'){
   const registered=await scan('skynet/warehouse/');
   const latest=registered.sort((a,b)=>String(b.uploadedAt||'').localeCompare(String(a.uploadedAt||''))).slice(0,80);
   const parsed=[];
   for(let i=0;i<latest.length;i+=15){
    const group=await Promise.all(latest.slice(i,i+15).map(x=>readJson(x.pathname).catch(()=>null)));
    parsed.push(...group);
   }
   const items=parsed.filter(x=>x&&/\.pdf$/i.test(x.name||'')&&
    /^[a-zA-Z0-9_-]{8,80}$/.test(x.batch||'')&&
    Number.isInteger(x.parts)&&x.parts>=1&&x.parts<=99999&&
    Number.isSafeInteger(x.size)&&x.size>0)
    .sort((a,b)=>String(b.uploadedAt||'').localeCompare(String(a.uploadedAt||'')))
    .slice(0,15).map(x=>({name:x.name,batch:x.batch,parts:x.parts,size:x.size,
     uploadedAt:x.uploadedAt,type:'PDF',source:'original'}));
   return send(res,200,{items,total:items.length,mode:'pdf-retry'});
  }
  const [manifests,documents,memories,uploads]=await Promise.all([scan('skynet/warehouse/'),scan('skynet/documents/'),scan('skynet/memory/'),scan('skynet/uploads/')]);
  const items=[],known=new Set(),seenHashes=new Set();
  for(let i=0;i<manifests.length;i+=15){const part=await Promise.all(manifests.slice(i,i+15).map(async f=>{try{return await readJson(f.pathname)}catch{return null}}));for(const d of part)if(d?.name&&d?.batch){known.add(d.batch);if(d.hash&&seenHashes.has(d.hash))continue;if(d.hash)seenHashes.add(d.hash);items.push({name:d.name,uploadedAt:(uploads.filter(f=>f.pathname.startsWith('skynet/uploads/'+d.batch+'/')).map(f=>f.uploadedAt).sort()[0]||d.uploadedAt),size:d.size,parts:d.parts,type:d.name.split('.').pop().toUpperCase(),source:'original',id:d.batch,batch:d.batch})}}
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
  // Reuse the existing SHA-256 content identities from document extraction.
  // Never merge merely because filenames match.
  const documentHashes=new Map();
  for(let i=0;i<documents.length;i+=15){
   const part=await Promise.all(documents.slice(i,i+15).map(async f=>{try{return await readJson(f.pathname)}catch{return null}}));
   for(const d of part)if(d?.hash&&d?.name)documentHashes.set(d.name,(documentHashes.get(d.name)||new Set()).add(d.hash));
  }
  // Only exact verified content identities are eligible for deduplication.
  // Legacy uploads lacking a per-batch hash remain visible until verified.
  const processedHashes=new Set(),unique=[];
  for(const item of items){
   const hashes=documentHashes.get(item.name);
   const hash=hashes?.size===1?[...hashes][0]:null;
   if(item.source==='processed'&&hash&&processedHashes.has(hash))continue;
   if(item.source==='processed'&&hash)processedHashes.add(hash);
   unique.push(item);
  }
  items.length=0;items.push(...unique);
  items.sort((a,b)=>String(b.uploadedAt||'').localeCompare(String(a.uploadedAt||'')));
  return send(res,200,{items,total:items.length,namedCount:items.filter(x=>x.source!=='unidentified').length,originalChunkCount:uploads.length,originalBatchCount:uploadBatches.size,unidentifiedBatchCount:unidentified.length,scope:'warehouse_documents_and_history',note:'과거 파일 중 원본 파일명 기록이 없는 업로드는 식별 불가'});
 }catch(e){return send(res,502,{error:'자료창고 조회 실패',detail:String(e.message).slice(0,150)})}
}