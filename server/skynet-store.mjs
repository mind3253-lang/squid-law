// SKYNET isolated conversation repository; caller identity comes from verified session.
import {randomUUID} from 'node:crypto';
import {skynetOwnerKey,validateSkynetMessage,mergeSkynetMemory} from '../lib/skynet-memory-policy.mjs';
const uuid=/^[0-9a-f-]{36}$/i;
export function createSkynetStore(pool){
 if(!pool?.query)throw Error('SKYNET_DB_MISSING');
 return {
  async append({subject,roomId,message}){
   if(!uuid.test(roomId||''))throw Error('INVALID_SKYNET_ROOM');
   const owner=skynetOwnerKey(subject),m=validateSkynetMessage(message),id=randomUUID();
   const r=await pool.query('INSERT INTO skynet_messages(owner_key,room_id,message_id,role,body) VALUES($1,$2,$3,$4,$5) RETURNING message_id,created_at',[owner,roomId,id,m.role,m.text]);
   return r.rows[0];
  },
  async history({subject,roomId,limit=50}){
   if(!uuid.test(roomId||'')||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('INVALID_SKYNET_QUERY');
   const r=await pool.query('SELECT message_id,role,body,created_at FROM skynet_messages WHERE owner_key=$1 AND room_id=$2 ORDER BY created_at DESC,message_id DESC LIMIT $3',[skynetOwnerKey(subject),roomId,limit]);
   return r.rows.reverse();
  },
  async updateMemory({subject,key,value,revision}){
   const owner=skynetOwnerKey(subject);
   const next=mergeSkynetMemory(null,{key,value,revision});
   const r=await pool.query('INSERT INTO skynet_memories(owner_key,memory_key,body,revision) VALUES($1,$2,$3,$4) ON CONFLICT(owner_key,memory_key) DO UPDATE SET body=EXCLUDED.body,revision=EXCLUDED.revision,updated_at=now() WHERE skynet_memories.revision=EXCLUDED.revision-1 RETURNING revision',[owner,next.key,next.value,next.revision]);
   if(r.rowCount!==1)throw Error('SKYNET_MEMORY_REVISION_CONFLICT');
   return r.rows[0];
  }
 };
}
