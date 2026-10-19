// Offline, names-only inspection. Never print secret values or connect to DB.
import {readFileSync,existsSync,statSync} from 'node:fs';
const path=process.argv[2]||'/etc/squidlaw/worker.env';
const names=['CRON_SECRET','BLOB_READ_WRITE_TOKEN','SQUID_CUSTOMER_DATABASE_URL','SQUID_CUSTOMER_DATABASE_DATABASE_URL','OPENAI_API_KEY','SQUIDLAW_CUSTOMER_WORKER_OWNER','SQUIDLAW_WORKER_RUN_APPROVED','SQUIDLAW_WORKER_CUTOVER_APPROVED'];
if(!existsSync(path)){console.log('ENV_FILE_ABSENT');process.exit(0)}
const st=statSync(path);
console.log('ENV_FILE_MODE', (st.mode&0o777).toString(8));
const values=new Map();
for(const line of readFileSync(path,'utf8').split(/\r?\n/)){
 const match=line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/);
 if(!match)continue;
 values.set(match[1],match[2].trim().replace(/^(['"])(.*)\1$/,'$2'));
}
for(const name of names){
 const value=values.get(name);
 console.log(name,value===undefined?'absent':value===''?'empty':'present');
}
console.log('APPROVALS_ARE_NOT_VALIDATED_BY_THIS_INSPECTION');
