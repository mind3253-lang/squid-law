import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
// Used only after verified account ownership; never auto-import unknown legacy hashes.
export function hashGabiaPassword(password,{salt=randomBytes(16)}={}){
 if(typeof password!=='string'||password.length<12||Buffer.byteLength(password)>1024)throw Error('INVALID_PASSWORD');
 const s=Buffer.isBuffer(salt)?salt:Buffer.from(salt,'hex');
 if(s.length!==16)throw Error('INVALID_SALT');
 return 'scrypt$'+s.toString('hex')+'$'+scryptSync(password,s,64,{N:16384,r:8,p:1}).toString('hex');
}
export function verifyGabiaPassword(password,stored){
 if(typeof password!=='string'||typeof stored!=='string'||Buffer.byteLength(password)>1024)return false;
 const m=/^scrypt\$([0-9a-f]{32})\$([0-9a-f]{128})$/.exec(stored);
 if(!m)return false;
 const expected=Buffer.from(m[2],'hex');
 const actual=scryptSync(password,Buffer.from(m[1],'hex'),64,{N:16384,r:8,p:1});
 return timingSafeEqual(expected,actual);
}
