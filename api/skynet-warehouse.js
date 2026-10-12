import {list,get} from '@vercel/blob';
const auth=req=>{try{return !!process.env.ADMIN_PASSWORD&&String(req.headers.authorization||'').startsWith('Basic ')&&Buffer.from(String(req.headers.authorization).slice(6),'base64').toString()==='admin:'+process.env.ADMIN_PASSWORD}catch{return false}};
async function readJson(path){const file=await get(path,{access:'private'});if(!file||file.statusCode!==200)return null;const chunks=[];let size=0;for await(const c of file.stream){size+=c.length;if(size>1024*1024)return null;chunks.push(c)}return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization');
 if(!auth(req))return res.status(401).json({error:'관리자 인증 필요'});
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 try{
  const blobs=[];let cursor;
  do{const page=await list({prefix:'skynet/documents/',limit:1000,...(cursor?{cursor}:{})});blobs.push(...page.blobs.filter(b=>/^skynet\\/documents\\/[a-f0-9]{64}\\.json$/.test(b.pathname)));cursor=page.hasMore?page.cursor:undefined}while(cursor&&blobs.length<10000);
  const items=[];
  for(let i=0;i<blobs.length;i+=12){const part=await Promise.all(blobs.slice(i,i+12).map(async b=>{try{const data=await readJson(b.pathname);if(!data||typeof data.name!=='string'||!data.name.trim())return null;return {name:data.name,uploadedAt:data.createdAt||b.uploadedAt||null,size:null,type:data.name.split('.').pop().toUpperCase(),source:'document',id:b.pathname}}catch{return null}}));items.push(...part.filter(Boolean))}
  items.sort((a,b)=>String(b.uploadedAt||'').localeCompare(String(a.uploadedAt||'')));
  return res.status(200).json({items,total:items.length,scope:'indexed_documents',note:'원본 업로드 전체가 아닌 문서 처리 기록에서 파일명이 확인된 목록'});
 }catch(e){return res.status(502).json({error:'자료창고 조회 실패',detail:String(e.message).slice(0,150)})}
}