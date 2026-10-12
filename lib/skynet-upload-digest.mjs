import {createHash} from 'node:crypto';
export function uploadDigest(parts){if(!Array.isArray(parts)||parts.some(p=>!Buffer.isBuffer(p)))throw Error('INVALID_PARTS');const h=createHash('sha256');let size=0;for(const p of parts){size+=p.length;h.update(p)}return {size,sha256:h.digest('hex')}}
