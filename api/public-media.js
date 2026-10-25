import {get} from '../lib/customer-object-storage.mjs';
const prefix='squidlaw/public-media/';
export default async function handler(req,res){
 if(req.method!=='GET'&&req.method!=='HEAD'){res.statusCode=405;return res.end()}
 const name=String(req.query?.name||'');
 if(!/^[0-9]{13}-[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name)){res.statusCode=400;return res.end()}
 try{const file=await get(prefix+name,{access:'public'});if(!file||file.statusCode!==200){res.statusCode=404;return res.end()}
 const type=name.endsWith('.png')?'image/png':name.endsWith('.webp')?'image/webp':'image/jpeg';
 res.setHeader('Content-Type',type);res.setHeader('Cache-Control','public, max-age=3600');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='HEAD')return res.end();
 for await(const chunk of file.stream)res.write(chunk);
 res.end();
 }catch{res.statusCode=503;res.end()}
}