let state;
let lastRows='';
const pendingSites=new Set();
const $=selector=>document.querySelector(selector);
const names={boss:'BOSS直聘',liepin:'猎聘',maimai:'脉脉'};
const homes={boss:'https://www.zhipin.com/',liepin:'https://www.liepin.com/',maimai:'https://maimai.cn/jobs'};
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const shortDate=value=>new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
let toastTimer;
function toast(message){
  clearTimeout(toastTimer);
  $('#toast').textContent=message;
  $('#toast').style.display='block';
  toastTimer=setTimeout(()=>$('#toast').style.display='none',6000);
}
async function post(action,body={}){
  const response=await fetch('/api/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok)throw Error(result.error);
  return result;
}
async function act(action,body={}){
  const site=body.site;
  if(site&&pendingSites.has(site))return;
  if(site)pendingSites.add(site);
  if(state)drawSiteStatus();
  try{
    await post(action,body);
    await refresh(action==='config');
    if(action==='config'){
      $('#configFeedback').textContent='配置已保存';
      $('#configFeedback').classList.remove('unsaved');
    }
  }catch(error){toast(error.message);}
  finally{
    if(site)pendingSites.delete(site);
    if(state)drawSiteStatus();
  }
}

$('#sites').innerHTML=Object.entries(names).map(([site,name])=>`
  <div class="site" data-site="${site}">
    <div class="site-heading"><span class="status-dot" aria-hidden="true"></span><strong>${name}</strong></div>
    <p class="site-state">尚未打开</p>
    <div class="site-actions">
      <button class="secondary" data-open="${site}">打开并登录</button>
      <button class="quiet" data-capture="${site}">采集当前页</button>
      <details class="site-more">
        <summary aria-label="${name}更多操作">更多</summary>
        <div class="site-menu">
          <button data-reset="${site}">重新进入登录页</button>
          <a href="${homes[site]}" target="_blank" rel="noopener noreferrer">在当前浏览器打开 ↗</a>
          <p>普通浏览入口，登录状态独立。</p>
        </div>
      </details>
    </div>
  </div>`).join('');
$('#sites').onclick=event=>{
  const button=event.target.closest('button');
  if(!button)return;
  if(button.dataset.open)act('open',{site:button.dataset.open});
  if(button.dataset.capture)act('capture',{site:button.dataset.capture});
  if(button.dataset.reset)act('reset-login',{site:button.dataset.reset});
};
document.addEventListener('click',event=>{
  for(const menu of document.querySelectorAll('.site-more[open]'))if(!menu.contains(event.target))menu.open=false;
});
for(const action of ['start','resume','stop','skip'])$('#'+action).onclick=()=>act(action);
$('#config').onsubmit=async event=>{
  event.preventDefault();
  await act('config',{
    ...state.config,
    keywords:$('#keywords').value.split(/[\n,，]+/),
    pages:Number($('#pages').value),
    sites:[...document.querySelectorAll('[name=site]:checked')].map(input=>input.value),
    financeOnly:$('#finance').checked,
    excludeIntern:$('#intern').checked,
    maimaiUrl:$('#maimaiUrl').value
  });
};
$('#config').oninput=()=>{
  $('#configFeedback').textContent='配置未保存';
  $('#configFeedback').classList.add('unsaved');
};
if(matchMedia('(max-width:620px)').matches)$('#configPanel').open=false;

function drawSiteStatus(){
  for(const site of Object.keys(names)){
    const box=$(`[data-site="${site}"]`);
    const page=state.browserSites?.[site];
    const message=pendingSites.has(site)?'正在处理，请稍候…':page?.message||'尚未打开';
    box.querySelector('.site-state').textContent=message;
    box.querySelector('.site-state').title=message;
    box.querySelector('[data-open]').textContent=page&&page.phase!=='closed'?'切回工具窗口':'打开并登录';
    for(const button of box.querySelectorAll('button'))button.disabled=pendingSites.has(site)||state.busy;
    box.classList.toggle('is-open',!!page&&page.phase!=='closed');
    box.classList.toggle('needs-action',['held','verification','login','rate_limited','blocked','blank'].includes(page?.phase));
  }
}
function jobRow(job){
  const tags=(job.reasons||[]).filter(reason=>!['研究岗位','金融语境',job.city].includes(reason));
  return `<article class="job">
    <div class="job-row">
      <div class="job-main">
        <h3><button type="button" class="job-link" data-open-job="${esc(job.id)}" title="在已登录的工具浏览器中查看职位">${esc(job.title)}</button></h3>
        <p class="company">${esc(job.company||'公司待确认')}</p>
      </div>
      <span class="salary ${job.salary?'':'unknown'}">${esc(job.salary||'薪酬待确认')}</span>
      <div class="job-source"><span>${names[job.site]||esc(job.site)}<span class="city">${esc(job.city)}</span></span><time datetime="${esc(job.lastSeen)}" title="最近采集：${esc(new Date(job.lastSeen).toLocaleString())}">${shortDate(job.lastSeen)}</time></div>
      <button class="quiet save-job ${job.saved?'is-saved':''}" data-id="${esc(job.id)}" aria-pressed="${!!job.saved}" aria-label="${job.saved?'取消收藏':'收藏'}：${esc(job.title)}">${job.saved?'★ 已收藏':'☆ 收藏'}</button>
    </div>
    <div class="job-footer">
      ${tags.length?`<div class="tags">${tags.slice(0,3).map(tag=>`<span class="tag">${esc(tag)}</span>`).join('')}${tags.length>3?`<span class="tag" title="${esc(tags.slice(3).join('、'))}">+${tags.length-3}</span>`:''}</div>`:''}
      <details><summary>原文与筛选依据</summary><p>${esc(job.text)}</p><p>检索词：${esc((job.queries||[]).join(' / '))}\n筛选依据：${esc((job.reasons||[]).join(' / '))}</p></details>
    </div>
  </article>`;
}
function draw(){
  const kind=$('#filter').value;
  const needle=$('#search').value.toLowerCase();
  const rows=state.jobs.filter(job=>(kind==='all'||kind==='saved'&&job.saved||kind==='match'&&job.match)&&[job.title,job.company,job.text].join(' ').toLowerCase().includes(needle));
  $('#counts').innerHTML=`<span><strong>${state.jobs.filter(job=>job.match).length}</strong>匹配</span><span><strong>${state.jobs.length}</strong>已采集</span><span><strong>${state.jobs.filter(job=>job.saved).length}</strong>收藏</span>`;
  $('#keywordCount').textContent=state.config.keywords.length+' 个关键词';
  $('#status').textContent={idle:'准备就绪',running:'浏览中',paused:'等待处理',done:'已完成'}[state.run.status]||state.run.status;
  const currentSite=state.run.current?.site;
  const currentPage=state.browserSites?.[currentSite];
  const recoveredBlank=state.run.status==='paused'&&state.run.message?.includes('网页变为空白')&&currentPage&&!['blank','closed','held'].includes(currentPage.phase);
  $('#message').textContent=recoveredBlank?names[currentSite]+'：'+currentPage.message+'；处理后点击“继续”':state.run.message||'打开网站并登录后开始浏览。';
  const total=state.run.queue.length;
  $('#progress').textContent=`${state.run.index} / ${total}`;
  $('#taskProgress').max=Math.max(total,1);
  $('#taskProgress').value=Math.min(state.run.index,total);
  $('#log').textContent=state.run.log.map(log=>new Date(log.time).toLocaleTimeString()+'  '+log.message).join('\n')||'暂无浏览记录';
  $('#start').disabled=state.busy;
  $('#resume').disabled=state.busy||!total||state.run.index>=total;
  $('#stop').disabled=!state.busy;
  $('#skip').disabled=state.busy||!total||state.run.index>=total;
  $('#config button[type=submit]').disabled=state.busy;
  drawSiteStatus();
  const params=new URLSearchParams({q:needle});
  if(kind==='all')params.set('all','1');
  if(kind==='saved')params.set('saved','1');
  $('#csv').href='/api/export?'+params;
  params.set('format','json');
  $('#json').href='/api/export?'+params;
  $('#resultCount').textContent=rows.length+' 条结果';
  const rowsKey=JSON.stringify({kind,rows});
  if(rowsKey===lastRows)return;
  lastRows=rowsKey;
  const empty=kind==='saved'&&!needle
    ?'<strong>暂无收藏</strong><p>点击岗位右侧的“收藏”后，可在此查看。</p>'
    :needle?'<strong>没有匹配结果</strong><p>尝试其他关键词，或切换结果范围。</p>'
    :'<strong>暂无岗位</strong><p>登录网站后开始浏览，或采集当前搜索结果页。</p>';
  $('#results').innerHTML=rows.length?rows.map(jobRow).join(''):`<div class="empty">${empty}</div>`;
}
$('#results').onclick=async event=>{
  const open=event.target.closest('[data-open-job]');
  if(open){
    const job=state.jobs.find(job=>job.id===open.dataset.openJob);
    if(job){open.disabled=true;try{await act('open-job',{id:job.id,site:job.site});}finally{open.disabled=false;}}
    return;
  }
  const save=event.target.closest('[data-id]');
  if(save){const job=state.jobs.find(job=>job.id===save.dataset.id);if(job)act('save-job',{id:job.id,saved:!job.saved});}
};
$('#filter').onchange=draw;
$('#search').oninput=draw;
async function refresh(first=false){
  try{
    const response=await fetch('/api/state');
    if(!response.ok)throw Error('服务不可用');
    state=await response.json();
    if(first){
      $('#keywords').value=state.config.keywords.join('\n');
      $('#pages').value=state.config.pages;
      $('#finance').checked=state.config.financeOnly;
      $('#intern').checked=state.config.excludeIntern;
      $('#maimaiUrl').value=state.config.maimaiUrl;
      document.querySelectorAll('[name=site]').forEach(input=>input.checked=state.config.sites.includes(input.value));
    }
    $('#connection').classList.add('connected');
    $('#connection').classList.remove('disconnected');
    $('#connectionText').textContent='已连接';
    draw();
  }catch(error){
    $('#connection').classList.remove('connected');
    $('#connection').classList.add('disconnected');
    $('#connectionText').textContent='未连接';
    $('#status').textContent='服务未连接';
    $('#message').textContent='请启动本机服务后刷新页面。';
  }
}
await refresh(true);
setInterval(()=>refresh(),2000);
