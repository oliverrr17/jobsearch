// Explicit live check: run manually, never as part of npm test.
// Uses a separate temporary profile and does not change the user's task data.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {playwright} from '../browser.mjs';
import {NavigationController} from '../navigation.mjs';
import {extractCards,searchUrl} from '../core.mjs';

const artifacts=new URL('../artifacts/',import.meta.url);
await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(path.join(os.tmpdir(),'job-scout-live-'));
const context=await playwright().chromium.launchPersistentContext(profile,{channel:'chrome',headless:false,viewport:null,args:['--start-maximized']});
const results=[];
try{
 for(const site of ['boss','liepin']){
  const page=await context.newPage();
  const navigation=new NavigationController({getPage:async()=>page});
  await navigation.open(site);
  await page.waitForTimeout(15000);
  const before=navigation.snapshot(site);
  assert.ok(!['blank','held','closed'].includes(before.phase),site+' became blank or blocked');
  await navigation.open(site);
  await page.waitForTimeout(3000);
  const after=navigation.snapshot(site);
  assert.equal(after.toolNavigations,1,site+' reloaded on focus');
  assert.ok(!['blank','held','closed'].includes(after.phase),site+' failed after focus');
  const text=await page.locator('body').innerText();
  assert.ok(text.length>100,site+' did not render page content');
  const row={site,entry:after.url,stableSeconds:18,toolNavigations:after.toolNavigations,visibleTextLength:text.length};
  if(site==='boss')assert.match(text,/登录/);
  if(site==='liepin'){
   await navigation.search(page,site,searchUrl(site,'行业研究员'));
   await page.waitForTimeout(10000);
   const cards=await page.evaluate(extractCards,site);
   assert.ok(cards.length>0,'Liepin returned no readable search cards');
   assert.ok(cards.some(card=>/研究|分析师/.test(card.title)),'Search did not return research roles');
   row.searchCards=cards.length;
   row.searchPage=navigation.snapshot(site).url;
  }
  await page.screenshot({path:new URL('live-v1.2-'+site+'.png',artifacts).pathname});
  results.push(row);console.log(JSON.stringify(row));
 }
 await writeFile(new URL('live-v1.2.json',artifacts),JSON.stringify({time:new Date().toISOString(),driver:'patchright-core@1.64.3',results},null,2));
}finally{await context.close();}
