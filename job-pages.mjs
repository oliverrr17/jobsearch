import {safeUrl} from './core.mjs';
import {NavigationController} from './navigation.mjs';

export function jobUrl(job){
  const value=safeUrl(job?.url,job?.site);
  if(!value)throw Error('职位链接无效');
  const u=new URL(value);
  const paths={boss:/^\/job_detail\/[\w-]+\.html$/,liepin:/^\/(?:job|a)\/\d+(?:\.shtml|\.html)?\/?$/,maimai:/^\/(?:jobs?|recruit)\/.+/};
  if(u.username||u.password||!paths[job.site]?.test(u.pathname))throw Error('链接不是该网站的职位详情页');
  return value;
}

export class JobPages{
  constructor(getContext){this.getContext=getContext;this.tabs=new Map();this.pending=new Map();}
  async open(job){
    const url=jobUrl(job);
    if(this.pending.has(job.id))return this.pending.get(job.id);
    const task=(async()=>{
      let entry=this.tabs.get(job.id);
      if(!entry||entry.page.isClosed()){
        // Use exactly the context that owns the user's logged-in search tabs.
        const context=await this.getContext();
        const page=await context.newPage();
        const navigation=new NavigationController({getPage:async()=>page});
        entry={page,navigation};this.tabs.set(job.id,entry);
        page.on('close',()=>{if(this.tabs.get(job.id)===entry)this.tabs.delete(job.id);});
        try{await navigation.search(page,job.site,url);}
        catch(error){this.tabs.delete(job.id);await page.close().catch(()=>{});throw error;}
      }
      await entry.page.bringToFront();
      return {site:job.site,id:job.id,page:entry.navigation.snapshot(job.site)};
    })();
    this.pending.set(job.id,task);
    try{return await task;}finally{this.pending.delete(job.id);}
  }
}
