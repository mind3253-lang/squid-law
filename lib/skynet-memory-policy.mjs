// SKYNET conversation and memory policy. Server-first, owner-scoped and revision-checked.
import {createHash} from 'node:crypto';
export const skynetOwnerKey=subject=>{
 if(typeof subject!=='string'||!subject)throw Error('SKYNET_UNAUTHORIZED');
 return createHash('sha256').update(subject).digest('hex');
};
export function validateSkynetMessage(message){
 if(!message||typeof message!=='object'||!['user','assistant','system'].includes(message.role)||typeof message.text!=='string'||message.text.length>200000)throw Error('INVALID_SKYNET_MESSAGE');
 return {role:message.role,text:message.text};
}
export function mergeSkynetMemory(current,incoming){
 if(!incoming||typeof incoming.key!=='string'||incoming.key.length>160||!Number.isSafeInteger(incoming.revision)||incoming.revision<1||typeof incoming.value!=='string'||incoming.value.length>10000)throw Error('INVALID_SKYNET_MEMORY');
 if(current&&incoming.revision!==current.revision+1)throw Error('SKYNET_MEMORY_REVISION_CONFLICT');
 if(!current&&incoming.revision!==1)throw Error('SKYNET_MEMORY_REVISION_CONFLICT');
 return {key:incoming.key,value:incoming.value,revision:incoming.revision};
}
