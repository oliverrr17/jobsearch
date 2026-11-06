import test from 'node:test';
import assert from 'node:assert/strict';
import {repairStoredJob,mergeJobs} from '../core.mjs';
import {extractCards} from '../core.mjs';
import {playwright} from '../browser.mjs';

const original={id:'boss:https://www.zhipin.com/job_detail/fixture.html',site:'boss',url:'https://www.zhipin.com/job_detail/fixture.html',title:'行业研究员',company:'',location:'',text:'行业研究员\n\ue033\ue036-\ue035\ue031K·\ue032\ue037薪\n1-3年\n本科\n示例投资管理\n上海·浦东新区·张江',saved:true,firstSeen:'2026-11-01',lastSeen:'2026-11-06',queries:['机械行业研究员','行业研究员']};
test('recover company from the observed compact-card layout without inventing salary or changing user metadata',()=>{
 const repaired=repairStoredJob(original);
 assert.equal(repaired.company,'示例投资管理');assert.equal(repaired.location,'上海·浦东新区·张江');
 for(const k of ['id','saved','firstSeen','lastSeen','queries','text'])assert.deepEqual(repaired[k],original[k]);
 assert.equal(repaired.salary,undefined);assert.equal(original.company,'');
 const intern=repairStoredJob({...original,title:'买方分析师',text:'买方分析师\n150-180元/天\n4天/周\n3个月\n本科\n示例资产管理\n上海·嘉定区·新成路'});
 assert.equal(intern.company,'示例资产管理');
 const anonymous=repairStoredJob({...original,text:original.text.replace('示例投资管理','上海某证券公司').replace('上海·浦东新区·张江','上海')});
 assert.equal(anonymous.company,'上海某证券公司');assert.equal(anonymous.location,'上海');
});
test('ambiguous archived text stays unchanged, and known company survives partial recapture',()=>{
 const ambiguous={...original,text:'行业研究员\n30-50K\n上海某投资管理'};
 assert.equal(repairStoredJob(ambiguous),ambiguous);
 const changedLayout={...original,text:original.text.replace('本科','金融研究')};
 assert.equal(repairStoredJob(changedLayout),changedLayout);
 const existing=repairStoredJob(original);
 const recaptured=mergeJobs([existing],[{...ambiguous,company:'',location:'',query:'机器人'}])[0];
 assert.equal(recaptured.company,existing.company);assert.equal(recaptured.location,existing.location);
 assert.equal(recaptured.saved,true);assert.equal(recaptured.firstSeen,original.firstSeen);
});

test('current BOSS card footer supplies company and city directly, including anonymous listings',async()=>{
 const browser=await playwright().chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();
  await page.setContent(`<ul class="job-list-box"><li class="job-card-box"><div class="job-info"><div class="job-title clearfix"><a class="job-name" href="https://www.zhipin.com/job_detail/fixture.html">行业研究员</a><span class="job-salary">30-50K</span></div><ul class="tag-list"><li>3-5年</li><li>本科</li></ul></div><div class="job-card-footer"><a class="boss-info is-anonymous"><span class="boss-name">上海某证券公司</span></a><span class="company-location">上海</span></div></li></ul><div class="boss-info"><span class="boss-name">示例招聘联系人</span></div>`);
  const rows=await page.evaluate(extractCards,'boss');
  assert.equal(rows.length,1);assert.equal(rows[0].company,'上海某证券公司');assert.equal(rows[0].location,'上海');
  assert.equal(rows[0].fieldSources.company,'page-element');
 }finally{await browser.close();}
});
