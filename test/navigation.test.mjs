import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {NavigationController,authRoute,loginUrl} from '../navigation.mjs';
class FakePage extends EventEmitter {
  constructor(url='about:blank'){super();this.href=url;this.navigations=[];this.focusCount=0;this.frame={};}
  url(){return this.href;} mainFrame(){return this.frame;}
  async route(pattern,fn){this.handler=fn;}
  async goto(url){this.navigations.push(url);await new Promise(r=>setTimeout(r,8));this.href=url;this.emit('framenavigated',this.frame);}
  async bringToFront(){this.focusCount++;}
  async evaluate(){return [];}
  async title(){return '主页';}
  locator(){return {innerText:async()=>''};}
  async request(url,main=true){let result;await this.handler({request:()=>({url:()=>url,isNavigationRequest:()=>main,frame:()=>this.frame}),fallback:async()=>{result='continue'},abort:async()=>{result='abort'}});return result;}
}
test('first BOSS open goes to login, and concurrent/repeated clicks never reload it',async()=>{
 const p=new FakePage();let created=0;const n=new NavigationController({getPage:async()=>{created++;return p;}});
 await Promise.all([n.open('boss'),n.open('boss'),n.open('boss')]);
 assert.equal(created,1);assert.deepEqual(p.navigations,[loginUrl('boss')]);
 await n.open('boss');assert.equal(p.navigations.length,1);assert.equal(p.focusCount,2);
});
test('existing verification flow is preserved; only explicit reset navigates',async()=>{
 const p=new FakePage('https://www.zhipin.com/web/passport/zp/security.html?seed=secret');const n=new NavigationController({getPage:async()=>p});
 await n.open('boss');assert.equal(p.navigations.length,0);await assert.rejects(n.assertReady(p,'boss'),/验证/);
 await n.open('boss',{reset:true});assert.deepEqual(p.navigations,[loginUrl('boss')]);
});
test('a page that later becomes blank is never mistaken for a newly created tab',async()=>{
 const p=new FakePage();const n=new NavigationController({getPage:async()=>p});
 await n.open('boss');
 p.href='about:blank';p.emit('framenavigated',p.frame);
 await n.open('boss');await n.open('boss');
 assert.equal(p.navigations.length,1);assert.equal(n.snapshot('boss').phase,'blank');
 assert.equal(n.snapshot('boss').url,'about:blank');
 await assert.rejects(n.assertReady(p,'boss'),/空白/);
 await n.open('boss',{reset:true});assert.equal(p.navigations.length,2);
});
test('four repeated main-document paths hold navigation, allowing assets to finish',async()=>{
 let now=100;let blocked=0;const p=new FakePage();const n=new NavigationController({getPage:async()=>p,now:()=>now,onBlocked:()=>{blocked++;}});await n.attach(p,'boss');
 for(let i=0;i<3;i++){assert.equal(await p.request('https://www.zhipin.com/web/passport/zp/security.html?seed='+i),'continue');now+=500;}
 assert.equal(await p.request('https://www.zhipin.com/web/passport/zp/security.html?seed=4'),'abort');
 assert.equal(n.snapshot('boss').phase,'held');assert.equal(blocked,1);
 assert.equal(await p.request('https://www.zhipin.com/image.png',false),'continue');
 assert.equal(await p.request('https://www.zhipin.com/web/geek/jobs'),'abort');
 assert.ok(!JSON.stringify(n.snapshot('boss')).includes('seed='));
 await n.open('boss',{reset:true});assert.equal(n.snapshot('boss').held,false);
});
test('normal redirects and spaced page visits are not classified as a loop',async()=>{
 let now=0;const p=new FakePage();const n=new NavigationController({getPage:async()=>p,now:()=>now});await n.attach(p,'boss');
 for(const url of ['https://www.zhipin.com/','https://www.zhipin.com/web/user/','https://www.zhipin.com/web/geek/jobs'])assert.equal(await p.request(url),'continue');
 for(let i=0;i<5;i++){now+=16000;assert.equal(await p.request('https://www.zhipin.com/web/geek/jobs'),'continue');}
});
test('resume readiness checks never navigate away from login or validation',async()=>{
 const p=new FakePage(loginUrl('boss'));const n=new NavigationController({getPage:async()=>p});
 await assert.rejects(n.assertReady(p,'boss'),/登录/);assert.equal(p.navigations.length,0);
 assert.equal(authRoute('https://www.zhipin.com/web/passport/zp/security.html','boss'),'verification');
 assert.equal(authRoute('https://www.zhipin.com/web/geek/jobs','boss'),null);
});
test('different result pages do not trip the authentication-loop guard',async()=>{
 let now=0;const p=new FakePage();const n=new NavigationController({getPage:async()=>p,now:()=>now});await n.attach(p,'boss');
 for(let i=1;i<=5;i++){assert.equal(await p.request('https://www.zhipin.com/web/geek/jobs?query=robot&page='+i),'continue');now+=4000;}
 assert.equal(n.snapshot('boss').held,false);
});
test('visible access failures pause without navigation and remain distinct from login',async()=>{
 const p=new FakePage('https://www.zhipin.com/web/geek/job');const n=new NavigationController({getPage:async()=>p});
 p.locator=()=>({innerText:async()=> '您的操作过于频繁，请稍后再试'});
 await assert.rejects(n.assertReady(p,'boss'),/访问频繁/);
 assert.equal(n.snapshot('boss').phase,'rate_limited');
 p.locator=()=>({innerText:async()=> '当前环境存在异常'});
 await assert.rejects(n.assertReady(p,'boss'),/限制/);
 assert.equal(n.snapshot('boss').phase,'blocked');
 assert.equal(p.navigations.length,0);
});
test('real browser self-redirect loop is held without any live website request',async()=>{
 const {playwright}=await import('../browser.mjs');const browser=await playwright().chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();let served=0;
  await page.route('**/*',async route=>{
   if(route.request().isNavigationRequest()){
    served++;const next='https://www.zhipin.com/web/passport/zp/security.html?nonce='+served;
    await route.fulfill({contentType:'text/html',body:`<html><body>fixture verification<script>setTimeout(()=>location.replace(${JSON.stringify(next)}),50)</script></body></html>`});
   }else await route.abort();
  });
  const n=new NavigationController({getPage:async()=>page});await n.attach(page,'boss');
  await page.goto('https://www.zhipin.com/web/passport/zp/security.html?nonce=0',{waitUntil:'domcontentloaded'});
  for(let i=0;i<40&&!n.snapshot('boss').held;i++)await new Promise(r=>setTimeout(r,50));
  assert.equal(n.snapshot('boss').held,true);assert.equal(served,3);
  const before=served;await new Promise(r=>setTimeout(r,300));assert.equal(served,before);
 }finally{await browser.close();}
});
