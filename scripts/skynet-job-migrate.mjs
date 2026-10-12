import {migrateSkynetJobs} from '../lib/skynet-job-migration.mjs';
if(!process.env.POSTGRES_URL){console.error('POSTGRES_URL_REQUIRED');process.exitCode=1}else{try{console.log(JSON.stringify(await migrateSkynetJobs()))}catch(e){console.error(String(e.message));process.exitCode=1}}
