import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../shared-error-diagnostics.js',import.meta.url),'utf8');
function harness(fetchImpl){
 const saved=new Map(),events=[];
 const location={pathname:'/admin/skynet.html',href:'https://example.test/admin/skynet.html'};
 const window={fetch:fetchImpl,dispatchEvent:e=>events.push(e),addEventListener(){}};
 const sessionStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 class CustomEvent{constructor(type,options){this.type=type;this.detail=options.detail}}
 const sandbox={window,location,sessionStorage,CustomEvent,URL,Date,Math,JSON,Error,Number,String,Array,Object,Map,console:{error(){}}};
 vm.runInNewContext(source,sandbox,{filename:'shared-error-diagnostics.js'});
 return {window,events,saved};
}
test('HTTP 500 is collected without reading response bodies',async()=>{
 let cloned=false;
 const h=harness(async()=>({ok:false,status:500,statusText:'Internal Server Error',headers:{get:()=>null},clone(){cloned=true;throw Error('body must not be read')}}));
 const response=await h.window.fetch('/api/skynet-chat');
 assert.equal(response.status,500);
 assert.equal(h.window.SQUID_DIAGNOSTICS.list().length,1);
 assert.equal(h.window.SQUID_DIAGNOSTICS.list()[0].type,'api_http_error');
 assert.equal(cloned,false);
 assert.equal(h.events.length,1);
});
test('HTTP 401 is not treated as a server fault',async()=>{
 const h=harness(async()=>({ok:false,status:401,statusText:'Unauthorized',headers:{get:()=>null}}));
 await h.window.fetch('/api/skynet-chat');
 assert.equal(h.window.SQUID_DIAGNOSTICS.list().length,0);
});
test('network failure is captured and rethrown',async()=>{
 const h=harness(async()=>{throw new Error('network disconnected')});
 await assert.rejects(h.window.fetch('/api/skynet-chat'),/network disconnected/);
 assert.equal(h.window.SQUID_DIAGNOSTICS.list()[0].type,'api_network_error');
});
test('client diagnostics redact credentials and support clearing',()=>{
 const h=harness(async()=>({ok:true,status:200}));
 h.window.SQUID_DIAGNOSTICS.capture('test',new Error('Bearer secretvalue test@example.com'));
 const serialized=h.window.SQUID_DIAGNOSTICS.export();
 assert.doesNotMatch(serialized,/secretvalue|test@example.com/);
 assert.match(serialized,/redacted/i);
 h.window.SQUID_DIAGNOSTICS.clear();
 assert.equal(h.window.SQUID_DIAGNOSTICS.list().length,0);
});
