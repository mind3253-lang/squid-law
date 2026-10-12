import {createHash} from 'node:crypto';
export function autosaveId(messages){if(!Array.isArray(messages)||messages.length!==2||messages[0]?.role!=='user'||messages[1]?.role!=='assistant')throw Error('INVALID_PAIR');return createHash('sha256').update(JSON.stringify(messages)).digest('hex')}

export function isAutosavePair(messages){return Array.isArray(messages)&&messages.length===2&&messages[0]?.role==='user'&&messages[1]?.role==='assistant'&&messages.every(m=>typeof m.content==='string'&&m.content.trim().length>0)}
