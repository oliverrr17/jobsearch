import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {playwright} from '../browser.mjs';
import {defaults} from '../core.mjs';

test('login button is protected while pending, polling never reopens the website, and status is visible on mobile',async()=>{
 const fixture={config:defaults,jobs:[{id:'boss:fixture',site:'boss',title:'示例行业研究员',company:'示例公司',city:'上海',match:true,score:80,saved:false,text:'上海 基金',reasons:[],queries:['行业研究员'],lastSeen:'2026-11-06T12:00:00Z'}],busy:false,run:{status:'paused',index:0,queue:[],log:[]},browserSites:{}};
 let opens=0,polls=0,documents=0,releaseOpen;const openedJobs=[];
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/api/open-job'){let body='';for await(const chunk of req)body+=chunk;openedJobs.push(JSON.parse(body).id);res.setHeader('content-type','application/json');return res.end('{"ok":true}');}
  if(req.url==='/api/state'){polls++;res.setHeader('content-type','application/json');return res.end(JSON.stringify(fixture));}
  if(req.url==='/api/open'){
   opens++;await new Promise(resolve=>{releaseOpen=resolve;});
   fixture.browserSites.boss={phase:'held',held:true,message:'网站发生连续重复跳转，已停止继续导航'};
   res.setHeader('content-type','application/json');return res.end('{"ok":true}');
  }
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}[pathname];
  if(!file){res.writeHead(404);return res.end();}
  if(pathname==='/')documents++;
  res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  res.end(await readFile(new URL('../public/'+file,import.meta.url)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await playwright().chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>document.querySelector('#keywords').value.includes('机器人'));
  await page.locator('[data-open="boss"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-open="boss"]').disabled);
  // A second user click on a disabled button must not send a request.
  await page.locator('[data-open="boss"]').evaluate(button=>button.click());
  for(let i=0;i<30&&!releaseOpen;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(opens,1);releaseOpen();
  await page.waitForFunction(()=>document.querySelector('[data-site="boss"] .site-state').textContent.includes('连续重复跳转'));
  assert.equal(await page.locator('[data-open="boss"]').textContent(),'切回工具窗口');
  await page.waitForTimeout(2200);
  assert.ok(polls>=3);assert.equal(opens,1);assert.equal(documents,1);
  await page.getByRole('button',{name:'示例行业研究员',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('[data-open-job]').disabled);
  assert.deepEqual(openedJobs,['boss:fixture']);assert.equal(browser.contexts()[0].pages().length,1);assert.ok(page.url().startsWith('http://127.0.0.1:'));
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);
 }finally{releaseOpen?.();await browser.close();await new Promise(resolve=>server.close(resolve));}
});
