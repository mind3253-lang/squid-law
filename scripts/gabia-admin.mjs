#!/usr/bin/env node
// Allowlisted Gabia operator. Run inside GitHub Actions with existing SSH secret.
import { spawn } from 'node:child_process';
const commands = {
  status: ['systemctl is-active squidlaw-api.service','systemctl is-active squidlaw-worker.service','systemctl show squidlaw-worker.service -p ActiveState -p SubState -p Result -p ExecMainStatus --no-pager'],
  database: ["psql -p 5433 -U root -d squidlaw_production -Atqc 'SELECT current_database(), current_user'"],
  worker: ['systemctl status squidlaw-worker.service --no-pager -l','journalctl -u squidlaw-worker.service -n 80 --no-pager -o cat'],
  api: ['systemctl status squidlaw-api.service --no-pager -l','journalctl -u squidlaw-api.service -n 50 --no-pager -o cat'],
  workerconfig: ["for f in /etc/squidlaw/worker.env /etc/squidlaw/openai.env; do echo FILE:$f; if test -f $f; then awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{print $1 \"=\" (length($2)>0?\"SET\":\"EMPTY\")}' $f; else echo MISSING; fi; done"],
  config: ["awk -F= '/^(SQUIDLAW_CUSTOMER_WORKER_OWNER|SQUIDLAW_CONTINUOUS_WORKER|SQUIDLAW_WORKER_RUN_APPROVED|SQUIDLAW_WORKER_CUTOVER_APPROVED|CRON_SECRET|BLOB_READ_WRITE_TOKEN|DATABASE_URL|SQUID_CUSTOMER_DATABASE_URL|OPENAI_API_KEY)=/{print $1 \"=\" (length($2)>0?\"SET\":\"EMPTY\")}' /etc/squidlaw/api.env",'systemctl cat squidlaw-worker.service | grep -E "^(EnvironmentFile|ExecStart|User|WorkingDirectory)="']
};
const mode=process.argv[2]||'status';
if(!Object.hasOwn(commands,mode)) { console.error('Allowed modes:',Object.keys(commands).join(', '));process.exit(2); }
const host=process.env.GABIA_SSH_HOST||'ubuntu@1.201.111.35';
const key=process.env.GABIA_SSH_KEY_FILE;
if(!key) { console.error('GABIA_SSH_KEY_FILE required');process.exit(2); }
const remote='set +e; '+commands[mode].map((cmd,i)=>'echo CHECK_'+i+'; sudo -n '+cmd+' 2>&1; echo EXIT_'+i+'=$?').join('; ');
const child=spawn('ssh',['-T','-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=accept-new','-i',key,host,remote],{stdio:['ignore','pipe','pipe']});
const redact=s=>s.replace(/(postgres(?:ql)?:\/\/)[^\s]+/gi,'$1[REDACTED]').replace(/sk-[A-Za-z0-9_-]{10,}/g,'[REDACTED]').replace(/(password|token|secret)\s*[:=]\s*\S+/gi,'$1=[REDACTED]');
for(const stream of [child.stdout,child.stderr]) {
 let pending='';
 stream.on('data',data=>{
  pending+=data.toString();
  const lines=pending.split('\n');pending=lines.pop();
  for(const line of lines) console.log(redact(line));
 });
 stream.on('end',()=>{if(pending) console.log(redact(pending));});
}
child.on('error',e=>{console.error('SSH_ERROR',e.message);process.exitCode=1;});
child.on('exit',code=>{if(code)process.exitCode=code;});
