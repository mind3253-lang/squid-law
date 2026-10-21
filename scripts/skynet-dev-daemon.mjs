import { spawn } from 'node:child_process';
const interval=Math.max(10,Number(process.env.SKYNET_DEV_POLL_SECONDS)||30)*1000;
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});
process.on('SIGINT',()=>{stopping=true;});
function once() {
 return new Promise(resolve=>{
  const child=spawn(process.execPath,[new URL('./skynet-dev-worker.mjs',import.meta.url).pathname],{stdio:'inherit',env:process.env});
  child.on('error',err=>{console.error('SKYNET_DEV_SPAWN_ERROR',err.message);resolve();});
  child.on('exit',()=>resolve());
 });
}
while(!stopping) {
 await once();
 if(stopping) break;
 await new Promise(resolve=>setTimeout(resolve,interval));
}
