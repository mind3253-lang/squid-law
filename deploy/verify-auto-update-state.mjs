// Run on Gabia to distinguish timer activation from an applied update.
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const current=execFileSync('git',['-C','/opt/squidlaw/app','rev-parse','HEAD'],{encoding:'utf8',timeout:3000}).trim();
let status;
try{status=JSON.parse(await readFile('/var/lib/squidlaw/auto-update-status.json','utf8'));}
catch{console.log(JSON.stringify({verified:false,reason:'NO_VALID_AUTO_UPDATE_RECORD',current}));process.exit(1);}
const validRevision=typeof status.revision==='string'&&/^[a-f0-9]{40}$/.test(status.revision);
const validTime=typeof status.recordedAt==='string'&&Number.isFinite(Date.parse(status.recordedAt));
const validOutcome=['applied','already_current'].includes(status.outcome);
const verified=validRevision&&validTime&&validOutcome&&status.revision===current;
console.log(JSON.stringify({verified,current,recordedRevision:validRevision?status.revision:null,
 outcome:status.outcome,recordedAt:validTime?status.recordedAt:null,
 scope:'local revision and last update record only; no customer API or AI validation'},null,2));
if(!verified)process.exitCode=1;
