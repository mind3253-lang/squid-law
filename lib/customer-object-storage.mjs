import {Readable} from 'node:stream';
import {getPrivateObject,putPrivateObject,listPrivateObjects,deletePrivateObject} from './gabia-private-objects.mjs';
const selected=()=>{const v=process.env.SQUIDLAW_OBJECT_BACKEND||'gabia';if(v!=='gabia')throw Error('INVALID_STORAGE_BACKEND');return v};
export async function get(key,opts={access:'private'}){
 try{
  const data=await getPrivateObject(key);
  return {statusCode:200,pathname:key,stream:Readable.from([data])};
 }catch(e){if(e.code==='ENOENT')return null;throw e}
}
export async function put(key,body,opts={}){
 if(opts.access!=='private'||opts.addRandomSuffix===true)throw Error('UNSUPPORTED_STORAGE_OPTIONS');
 return putPrivateObject(key,body,{allowOverwrite:opts.allowOverwrite===true});
}
export async function list(opts={}){
 const r=await listPrivateObjects(opts.prefix||'',{limit:opts.limit||1000,cursor:opts.cursor});
 return {blobs:r.objects,hasMore:r.hasMore,cursor:r.cursor};
}
export const objectBackend=selected;
export async function storageHealth(){
 const {objectRoot}=await import('./gabia-private-objects.mjs');
 const {stat}=await import('node:fs/promises');
 try{
  const root=objectRoot();
  const info=await stat(root);
  return {ok:info.isDirectory(),backend:selected()};
 }catch(e){return {ok:false,backend:selected(),code:String(e?.code||'STORAGE_ERROR')}}
}

export async function del(keys){
 for(const key of (Array.isArray(keys)?keys:[keys]))await deletePrivateObject(key);
}
