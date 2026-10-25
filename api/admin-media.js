import {get,list,put,del} from '../lib/customer-object-storage.mjs';
import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
const prefix='squidlaw/public-media/';
const MAX=1200000;
function authorized(req){
 try{const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('squid_admin_session='));if(!cookie||!process.env.ADMIN_PASSWORD)return false;
 const [time,sig]=cookie.slice('squid_admin_session='.length).split('.');
 if(!/^\d{13}$/.test(time)||Number(time)<=Date.now()||Number(time)>Date.now()+86400000)return false;
 const expected=createHmac('sha256',process.env.ADMIN_PASSWORD).update(time).digest('hex');
 return sig?.length===expected.length&&timingSafeEqual(Buffer.from(sig),Buffer.from(expected))
 }catch{return false}
}
function reply(res,status,obj){res.status(status).setHeader('Cache-Control','no-store').json(obj)}
function sameOrigin(req){try{const origin=req.headers.origin;return !origin||new URL(origin).host===req.headers.host}catch{return false}}
export default async function handler(req,res){
 if(!authorized(req))return reply(res,401,{error:'관리자 로그인이 필요합니다.'});
 if(!['GET','POST','DELETE'].includes(req.method))return reply(res,405,{error:'METHOD_NOT_ALLOWED'});
 if(req.method!=='GET'&&!sameOrigin(req))return reply(res,403,{error:'ORIGIN_DENIED'});
 try{
 if(req.method==='GET'){
 let cursor,images=[];
 do{const page=await list({prefix,limit:100,cursor});for(const blob of page.blobs){if(!/\.(png|jpe?g|webp)$/.test(blob.pathname))continue;images.push({name:blob.pathname.split('/').pop(),url:'/api/public-media?name='+encodeURIComponent(blob.pathname.split('/').pop()),createdAt:blob.uploadedAt||null})}cursor=page.hasMore?page.cursor:undefined}while(cursor&&images.length<300);
 return reply(res,200,{images});
 }
 if(req.method==='POST'){
 const {data,name}=req.body||{};
 if(typeof data!=='string'||data.length>MAX*1.4+100||typeof name!=='string'||name.length>180)return reply(res,400,{error:'INVALID_IMAGE'});
 const match=data.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
 if(!match)return reply(res,400,{error:'지원 형식: JPG, PNG, WEBP'});
 const bytes=Buffer.from(match[2],'base64');
 if(!bytes.length||bytes.length>MAX)return reply(res,413,{error:'이미지는 1.2MB 이하로 업로드해 주세요.'});
 const kind=match[1],ok=kind==='image/png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):kind==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!ok)return reply(res,400,{error:'IMAGE_SIGNATURE_INVALID'});
 const ext=kind==='image/png'?'png':kind==='image/jpeg'?'jpg':'webp';
 const filename=Date.now()+'-'+randomUUID()+'.'+ext;
 await put(prefix+filename,bytes,{access:'public',addRandomSuffix:false,allowOverwrite:false,contentType:kind});
 return reply(res,201,{ok:true,url:'/api/public-media?name='+encodeURIComponent(filename),name:filename});
 }
 const name=String(req.body?.name||'');
 if(!/^[0-9]{13}-[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name))return reply(res,400,{error:'INVALID_NAME'});
 await del(prefix+name);
 return reply(res,200,{ok:true});
 }catch(e){console.error('MEDIA_ADMIN_FAILURE',e?.code||e?.name);return reply(res,503,{error:'IMAGE_STORAGE_UNAVAILABLE'})}
}
