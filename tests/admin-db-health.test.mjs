import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/admin-db-health.js';
const response=()=>({statusCode:200,headers:{},status(n){this.statusCode=n;return this},setHeader(k,v){this.headers[k]=v;return this},json(data){this.body=data;return this}});
test('diagnostic denies requests without admin authentication',async()=>{const r=response();await handler({method:'GET',headers:{}},r);assert.equal(r.statusCode,401);assert.equal(r.headers['Cache-Control'],'no-store')});
test('diagnostic denies invalid admin authentication',async()=>{const prior=process.env.ADMIN_PASSWORD;process.env.ADMIN_PASSWORD='local-test-secret';try{const r=response();await handler({method:'GET',headers:{authorization:'Basic '+Buffer.from('admin:incorrect').toString('base64')}},r);assert.equal(r.statusCode,401)}finally{if(prior===undefined)delete process.env.ADMIN_PASSWORD;else process.env.ADMIN_PASSWORD=prior}});
test('diagnostic refuses unsupported methods even for authenticated admin',async()=>{const prior=process.env.ADMIN_PASSWORD;process.env.ADMIN_PASSWORD='local-test-secret';try{const r=response();await handler({method:'POST',headers:{authorization:'Basic '+Buffer.from('admin:local-test-secret').toString('base64')}},r);assert.equal(r.statusCode,405)}finally{if(prior===undefined)delete process.env.ADMIN_PASSWORD;else process.env.ADMIN_PASSWORD=prior}});
