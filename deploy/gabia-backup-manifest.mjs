// Create a privacy-safe backup manifest without reading or exporting customer documents.
import {createHash} from 'node:crypto';
export function buildGabiaBackupManifest(entries,{createdAt=new Date().toISOString()}={}){
 if(!Array.isArray(entries)||!entries.length)throw Error('BACKUP_ENTRIES_REQUIRED');
 const paths=new Set();
 const files=entries.map(entry=>{
  if(typeof entry?.relativePath!=='string'||!/^[-a-zA-Z0-9_./]+$/.test(entry.relativePath)||entry.relativePath.startsWith('/')||entry.relativePath.split('/').includes('..')||paths.has(entry.relativePath))throw Error('INVALID_BACKUP_PATH');
  paths.add(entry.relativePath);
  if(!Number.isSafeInteger(entry.size)||entry.size<0||!Buffer.isBuffer(entry.bytes)||entry.bytes.length!==entry.size)throw Error('INVALID_BACKUP_ENTRY');
  return {relativePath:entry.relativePath,size:entry.size,sha256:createHash('sha256').update(entry.bytes).digest('hex')};
 });
 if(!Number.isFinite(Date.parse(createdAt)))throw Error('INVALID_BACKUP_TIMESTAMP');
 return {version:1,createdAt,files};
}
export function verifyGabiaBackupManifest(manifest,entries){
 if(manifest?.version!==1||!Array.isArray(manifest.files)||!Array.isArray(entries))return false;
 try{
  const recreated=buildGabiaBackupManifest(entries,{createdAt:manifest.createdAt});
  return JSON.stringify(recreated)===JSON.stringify(manifest);
 }catch{return false;}
}
