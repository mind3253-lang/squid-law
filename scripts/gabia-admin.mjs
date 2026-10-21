#!/usr/bin/env node
// Allowlisted Gabia operator. Run inside GitHub Actions with existing SSH secret.
import { spawn } from 'node:child_process';
const commands = {
  status: ['systemctl is-active squidlaw-api.service','systemctl is-active squidlaw-worker.service','systemctl show squidlaw-worker.service -p ActiveState -p SubState -p Result -p ExecMainStatus --no-pager'],
  database: ["psql -p 5433 -U root -d squidlaw_production -Atqc 'SELECT current_database(), current_user'"],
  worker: ['systemctl status squidlaw-worker.service --no-pager -l','journalctl -u squidlaw-worker.service -n 80 --no-pager -o cat'],
  api: ['systemctl status squidlaw-api.service --no-pager -l','journalctl -u squidlaw-api.service -n 50 --no-pager -o cat'],
  workerconfig: ["systemctl show squidlaw-worker.service -p ActiveState -p Result -p ExecMainStatus --no-pager", "grep -q '^OPENAI_API_KEY=' /etc/squidlaw/openai.env && echo OPENAI_API_KEY_PRESENT", "grep -q '^DATABASE_URL=' /etc/squidlaw/worker.env && echo DATABASE_URL_PRESENT", "grep -q '^CRON_SECRET=' /etc/squidlaw/worker.env && echo CRON_SECRET_PRESENT", "grep -q '^BLOB_READ_WRITE_TOKEN=' /etc/squidlaw/worker.env && echo BLOB_READ_WRITE_TOKEN_PRESENT"],
  inventory: ["grep -q '^SQUID_CUSTOMER_DATABASE_URL=' /etc/squidlaw/api.env && echo API_DB_PRESENT", "grep -q '^DATABASE_URL=' /etc/squidlaw/api.env && echo API_DATABASE_URL_PRESENT", "grep -q '^CRON_SECRET=' /etc/squidlaw/api.env && echo API_CRON_PRESENT", "grep -q '^BLOB_READ_WRITE_TOKEN=' /etc/squidlaw/api.env && echo API_BLOB_PRESENT", "grep -q '^CRON_SECRET=' /etc/squidlaw/openai.env && echo OPENAI_CRON_PRESENT", "grep -q '^BLOB_READ_WRITE_TOKEN=' /etc/squidlaw/openai.env && echo OPENAI_BLOB_PRESENT"],
  routing: [
    "curl -s -o /dev/null -w ROUTE_LOCAL_%{http_code} http://127.0.0.1:3084/api/customer-case",
    "curl -s -o /dev/null -w ROUTE_PUBLIC_%{http_code} https://squidlaw.co.kr/api/customer-case",
    "curl -s -o /dev/null -w ROUTE_AUTH_%{http_code} https://squidlaw.co.kr/api/customer-mypage-summary",
    "systemctl is-active squidlaw-api.service"
  ],
  acceptance2: [
    "systemctl show squidlaw-api.service -p ExecStart -p WorkingDirectory -p EnvironmentFiles --no-pager",
    "sh -c 'ss -lntp | grep -E \":(3000|3001|8080|8000|80|443) \" || true'",
    "sh -c 'curl -sS -o /dev/null -w PUBLIC_API_%{http_code} --max-time 12 https://squidlaw.co.kr/api/customer-case || true'",
    "sh -c 'curl -sS -o /dev/null -w PUBLIC_REPORT_%{http_code} --max-time 12 https://squidlaw.co.kr/api/customer-text-review-report || true'",
    "sh -c 'curl -sS -o /dev/null -w PUBLIC_MYPAGE_%{http_code} --max-time 12 https://squidlaw.co.kr/api/customer-mypage-summary || true'",
    "sh -c 'test -f /opt/squidlaw/app/api/customer-auth.js && echo AUTH_MODULE_PRESENT'",
    "sh -c 'test -f /opt/squidlaw/app/api/customer-case.js && echo CASE_MODULE_PRESENT'",
    "sh -c 'test -f /opt/squidlaw/app/api/customer-analysis-jobs-db.js && echo JOB_MODULE_PRESENT'",
    "sh -c 'test -f /opt/squidlaw/app/worker/continuous-worker.mjs && echo WORKER_MODULE_PRESENT'"
  ],
  acceptance: [
    "psql -p 5433 -U root -d squidlaw_production -v ON_ERROR_STOP=1 -Atqc 'BEGIN; CREATE TEMP TABLE squidlaw_smoke_test (id integer); INSERT INTO squidlaw_smoke_test VALUES (1); SELECT CASE WHEN COUNT(*)=1 THEN 1 ELSE 0 END FROM squidlaw_smoke_test; ROLLBACK;'",
    "sh -c 'curl -sS -o /dev/null -w HTTP_LOCAL_%{http_code} --max-time 12 http://127.0.0.1:3000/ || true'",
    "sh -c 'curl -sS -o /dev/null -w HTTP_PUBLIC_%{http_code} --max-time 15 https://squidlaw.co.kr/ || true'",
    "sh -c 'find /opt/squidlaw/app/api -maxdepth 3 -type f -name \"*.js\" 2>/dev/null | head -15'",
    "sh -c 'find /opt/squidlaw/app -maxdepth 3 -type f \\( -iname \"*upload*\" -o -iname \"*analysis*\" -o -iname \"*auth*\" \\) -not -path \"*/node_modules/*\" | head -25'",
    "systemctl is-active squidlaw-api.service",
    "systemctl is-active squidlaw-worker.service"
  ],
  maintenance: ["install -d -m 755 /opt/squidlaw/maintenance", "sh -c 'echo GABIA_REMOTE_MAINTENANCE_OK > /opt/squidlaw/maintenance/direct-write-test.txt'", "grep -qx GABIA_REMOTE_MAINTENANCE_OK /opt/squidlaw/maintenance/direct-write-test.txt && echo MAINTENANCE_WRITE_VERIFIED", "rm -f /opt/squidlaw/maintenance/direct-write-test.txt", "test ! -e /opt/squidlaw/maintenance/direct-write-test.txt && echo MAINTENANCE_DELETE_VERIFIED"],
  terminal: ["test -f /etc/profile.d/99-squidlaw-terminal-case.sh", "grep -q 'stty -iuclc -olcuc -xcase' /etc/profile.d/99-squidlaw-terminal-case.sh", "systemctl is-active squidlaw-api.service", "systemctl is-active squidlaw-worker.service"],
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
