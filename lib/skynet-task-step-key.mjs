import {createHash} from 'node:crypto';
export function taskStepNumber(taskId,index){if(!/^[\w-]{1,80}$/.test(taskId)||!Number.isSafeInteger(index)||index<0||index>29)throw Error('INVALID_TASK_STEP');const hash=createHash('sha256').update(taskId).digest();return hash.readUInt32BE(0)*32+index}
