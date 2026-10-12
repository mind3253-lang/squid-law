import {validateWriteLock} from './skynet-job-lock.mjs';
export async function assertPersistedWriteLock({jobId,owner,lock}){if(!lock||typeof lock.token!=='string'||!(await validateWriteLock({jobId,owner,token:lock.token})))throw Error('LOCK_NOT_HELD');return true}
