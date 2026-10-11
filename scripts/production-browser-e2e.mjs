import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 for(const viewport of [{width:1365,height:768},{width:390,height:844}]){
  const context=await browser.newContext({viewport});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e.message).slice(0,160)));
  await page.goto('https://www.squidlaw.co.kr/customer.html',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForURL(/login\.html/,{timeout:20000});
  await page.locator('#registerTab').click();
  const user='ci'+randomBytes(8).toString('hex'),password=randomBytes(24).toString('base64url');
  await page.locator('#uid').fill(user);
  await page.locator('#pw').fill(password);
  await page.locator('#submit').click();
  await page.waitForURL(/customer\.html/,{timeout:25000});
  await page.locator('#createCase').click();
  await page.waitForFunction(()=>document.querySelector('#activeCase')?.value?.startsWith('SL-'),{timeout:20000});
  await page.locator('#caseChatPick').setInputFiles('tests/fixtures/ci-evidence.pdf');
  await page.locator('#caseChatSend').click();
  await page.waitForFunction(()=>document.querySelector('#caseChatStatus')?.textContent?.includes('서버 보관 문서 1개'),{timeout:30000});
  assert.ok((await page.locator('#caseChatLog').innerText()).includes('ci-evidence.pdf'));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#caseChatLog')?.textContent?.includes('ci-evidence.pdf'),{timeout:25000});
  const dims=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  assert.ok(dims.scrollWidth<=dims.width+3,'horizontal overflow '+JSON.stringify(dims));
  assert.deepEqual(errors,[],'browser JavaScript errors');
  console.log('PASS real customer UI',viewport.width,'px: register, case, PDF upload, reload, responsive');
  await context.close();
 }
}finally{await browser.close()}
