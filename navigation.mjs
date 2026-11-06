import {sites, safeUrl, extractCards, blockage} from './core.mjs';

export const loginUrl = site => site === 'boss'
  ? 'https://www.zhipin.com/web/user/' : sites[site].home;

export function safePath(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return u.protocol==='about:' ? u.protocol+u.pathname : u.protocol;
    return u.origin + u.pathname;
  }
  catch { return ''; }
}
export function authRoute(url, site) {
  if (!safeUrl(url, site)) return null;
  const p = new URL(url).pathname;
  if (/(?:^|\/)(?:security|captcha|verify)(?:[/.]|$)/i.test(p)) return 'verification';
  if (site === 'boss' && /^\/web\/user(?:\/|$)/.test(p)) return 'login';
  if (/(?:^|\/)(?:login|signin|passport)(?:[/.]|$)/i.test(p)) return 'login';
  return null;
}

export class NavigationController {
  constructor({getPage, onBlocked = () => {}, onAction = () => {}, now = Date.now}) {
    this.getPage = getPage;
    this.onBlocked = onBlocked;
    this.onAction = onAction;
    this.now = now;
    this.pages = new WeakMap();
    this.sites = {};
    this.openTasks = new Map();
  }
  async attach(page, site) {
    if (this.pages.has(page)) return;
    const initial=authRoute(page.url(),site);
    const state = {phase:initial||'opened', message:initial==='login'?'等待你在浏览器完成登录':initial==='verification'?'网站要求访问验证':'页面已打开', url:safePath(page.url()), held:false, history:[], attempts:[], toolNavigations:0};
    this.pages.set(page, state);
    this.sites[site] = state;
    const history = (kind, url) => {
      state.url = safePath(url);
      state.history.push({time:new Date(this.now()).toISOString(), kind, url:state.url});
      state.history = state.history.slice(-20);
    };
    // Only hold repeated top-level navigations. Page resources and other sites
    // remain untouched; this does not modify or bypass the site's verification.
    await page.route('**/*', async route => {
      const req = route.request();
      let main = false;
      try { main = req.isNavigationRequest() && req.frame() === page.mainFrame(); } catch {}
      if (!main) return route.fallback();
      if (state.held) return route.abort('aborted');
      const url = req.url();
      if (safeUrl(url,site)) {
        const now = this.now();
        const u=new URL(url);const meaningful=new URLSearchParams();
        if(!authRoute(url,site)) for(const k of ['query','key','keyword','page','curPage','pageNum','city']) if(u.searchParams.has(k)) meaningful.set(k,u.searchParams.get(k));
        const key=safePath(url)+(meaningful.size?'?'+meaningful:'');
        state.attempts = state.attempts.filter(x => now - x.time < 30000);
        state.attempts.push({time:now,key});
        history('document-request',url);
        if (state.attempts.filter(x => x.key === key).length >= 4) {
          state.held = true;
          state.phase = 'held';
          state.message = '网站发生连续重复跳转，已停止继续导航。可点“重新进入登录页”手动重试，或在当前浏览器手动打开网站。';
          await route.abort('aborted');
          await this.onBlocked(site,state.message);
          return;
        }
      }
      return route.fallback();
    });
    page.on('framenavigated', frame => {
      if (frame !== page.mainFrame()) return;
      history('committed',page.url());
      if (state.held) return;
      if (page.url()==='about:blank' && state.toolNavigations>0) {
        state.phase='blank';
        state.message='网页变为空白，自动浏览已暂停。可点“重新进入登录页”手动重试';
        return;
      }
      const phase = authRoute(page.url(),site);
      state.phase = phase || 'opened';
      state.message = phase === 'verification' ? '网站要求访问验证，请先在浏览器处理'
        : phase === 'login' ? '等待你在浏览器完成登录' : '页面已打开';
    });
    page.on('close', () => { state.phase='closed'; state.message='浏览器标签页已关闭'; });
  }
  snapshot(site) {
    const s = this.sites[site];
    if (!s) return {phase:'closed',message:'尚未打开',history:[],toolNavigations:0};
    const {attempts,...publicState} = s;
    return publicState;
  }
  async open(site,{reset=false}={}) {
    if (this.openTasks.has(site)) return this.openTasks.get(site);
    const task = (async () => {
      const page = await this.getPage(site);
      await this.attach(page,site);
      const s = this.pages.get(page);
      if (reset) { s.held=false; s.attempts=[]; }
      // An existing login/verification page is only focused. Never restart it
      // because the user clicked the button twice.
      if (reset || (page.url()==='about:blank' && s.toolNavigations===0)) {
        s.phase='opening'; s.message='正在打开登录入口'; s.toolNavigations++;
        this.onAction(`${sites[site].name}：打开登录入口（一次导航）`);
        try { await page.goto(loginUrl(site),{waitUntil:'domcontentloaded',timeout:30000}); }
        catch (e) { if (!s.held) {s.phase=authRoute(page.url(),site)||'opened';s.message='网页打开超时或被中断，请在浏览器检查登录/验证页面';throw new Error(s.message);} }
      }
      await page.bringToFront();
      return this.snapshot(site);
    })();
    this.openTasks.set(site,task);
    try { return await task; } finally { this.openTasks.delete(site); }
  }
  async search(page,site,url) {
    await this.assertReady(page,site);
    const s=this.pages.get(page);s.attempts=[];s.toolNavigations++;
    s.history.push({time:new Date(this.now()).toISOString(),kind:'tool-search',url:safePath(url)});
    this.onAction(`${sites[site].name}：打开搜索结果（一次导航）`);
    return page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  }
  async assertReady(page,site) {
    await this.attach(page,site);
    const s = this.pages.get(page);
    if (s.held) throw new Error(s.message);
    if (page.url()==='about:blank' && s.toolNavigations>0) throw new Error(s.message);
    const phase = authRoute(page.url(),site);
    if (phase) {
      s.phase=phase;
      s.message=phase==='login'?'请先在浏览器完成登录；“继续”不会重新加载登录页':'请先在浏览器处理网站验证；自动浏览已暂停';
      throw new Error(s.message);
    }
    if (!safeUrl(page.url(),site)) return;
    // Read current visible content once at the user's action boundary, never
    // on the workbench's periodic status polling.
    try {
      const cards=await page.evaluate(extractCards,site);
      if (cards.length) return;
      const text=(await page.title())+' '+(await page.locator('body').innerText({timeout:3000})).slice(0,16000);
      const message=blockage(text,0,page.url());
      if (message && /请在浏览器登录|页面要求验证|网站提示访问频繁|网站限制了当前访问/.test(message)) {
        s.phase=message.includes('频繁')?'rate_limited':message.includes('限制')?'blocked':message.includes('验证')?'verification':'login';
        s.message=message;
        throw new UserActionRequired(message);
      }
    } catch(e) { if(e instanceof UserActionRequired) throw e; }
  }
}
class UserActionRequired extends Error {}
