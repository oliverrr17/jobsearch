import test from 'node:test';
import assert from 'node:assert/strict';
import {playwright} from '../browser.mjs';
import {JobPages,jobUrl} from '../job-pages.mjs';

test('job details share the search login and preserve the search page, with duplicate clicks coalesced',async()=>{
 const browser=await playwright().chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext();
  await context.addCookies([{name:'fixture_session',value:'test-login',domain:'www.zhipin.com',path:'/',httpOnly:true,secure:true}]);
  const detailRequests=[];
  await context.route('https://www.zhipin.com/**',async route=>{
   if(route.request().url().includes('/job_detail/'))detailRequests.push({url:route.request().url(),cookie:await route.request().headerValue('cookie')});
   await route.fulfill({contentType:'text/html',body:'<main>Offline job fixture</main>'});
  });
  const search=await context.newPage();await search.goto('https://www.zhipin.com/web/geek/jobs');
  let contexts=0;const jobs=new JobPages(async()=>{contexts++;return context;});
  const job={id:'boss:fixture',site:'boss',url:'https://www.zhipin.com/job_detail/fixture.html?securityId=fixture-only'};
  await Promise.all([jobs.open(job),jobs.open(job),jobs.open(job)]);
  assert.equal(contexts,1);assert.equal(context.pages().length,2);assert.equal(detailRequests.length,1);
  assert.match(detailRequests[0].cookie,/fixture_session=test-login/);
  assert.match(detailRequests[0].url,/securityId=fixture-only/);
  assert.equal(search.url(),'https://www.zhipin.com/web/geek/jobs');
  await jobs.open(job);assert.equal(detailRequests.length,1);
  await context.pages()[1].close();await jobs.open(job);
  assert.equal(detailRequests.length,2);assert.match(detailRequests[1].cookie,/fixture_session=test-login/);
 }finally{await browser.close();}
});

test('detail opener rejects unrelated sites, homepage links, and unknown jobs',()=>{
 assert.throws(()=>jobUrl({site:'boss',url:'https://www.zhipin.com.evil.invalid/job_detail/a.html'}));
 assert.throws(()=>jobUrl({site:'boss',url:'https://www.zhipin.com/'}));
 assert.throws(()=>jobUrl({site:'boss',url:'javascript:alert(1)'}));
 assert.throws(()=>jobUrl({site:'boss',url:'https://user:password@www.zhipin.com/job_detail/a.html'}));
 assert.throws(()=>jobUrl(undefined));
 assert.equal(jobUrl({site:'liepin',url:'https://www.liepin.com/job/123.shtml'}),'https://www.liepin.com/job/123.shtml');
});
