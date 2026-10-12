import {randomUUID} from 'node:crypto';
export function appendJobEvent(job,type,details={}){const event={id:randomUUID(),type,at:new Date().toISOString(),details};return {...job,events:[...(job.events||[]),event].slice(-200),updatedAt:event.at}}
