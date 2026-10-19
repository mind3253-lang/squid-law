// Gabia role policy: server-side authorization only, never trust client role fields.
export const ROLES=Object.freeze(['customer','staff','admin']);
const rank=Object.freeze({customer:1,staff:2,admin:3});
export function normalizeRole(value){
 if(typeof value!=='string'||!Object.hasOwn(rank,value))throw Error('INVALID_ROLE');
 return value;
}
export function requireRole(identity,minimum='customer'){
 normalizeRole(minimum);
 if(!identity||typeof identity.subject!=='string'||!Object.hasOwn(rank,identity.role))throw Error('UNAUTHORIZED');
 if(rank[identity.role]<rank[minimum])throw Error('FORBIDDEN');
 return identity;
}
export function requireOwner(identity,subject){
 requireRole(identity);
 if(identity.subject!==subject)throw Error('FORBIDDEN');
 return identity;
}
