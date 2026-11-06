let state;
let lastRows='';
const pendingSites=new Set();
const $=s=>document.querySelector(s);
const names={boss:'BOSS直聘',liepin:'猎聘',maimai:'脉脉'};
const homes={boss:'https://www.zhipin.com/',liepin:'https://www.liepin.com/',maimai:'https://maimai.cn/jobs'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',6000)}
async function post(action,body={}){const r=await fetch('/api/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
async function act(action,b={}){
 const site=b.site;
 if(site&&pendingSites.has(site))return;
 if(site)pendingSites.add(site);
 if(state)drawSiteStatus();
 try{await post(action,b);await refresh();}catch(e){toast(e.message)}
 finally{if(site)pendingSites.delete(site);if(state)drawSiteStatus();}
}
$('#sites').innerHTML=Object.entries(names).map(([id,n])=>`<div class="site" data-site="${id}"><strong>${n}</strong><div class="site-actions"><button data-open="${id}">打开并登录</button><button class="secondary" data-capture="${id}">采集当前页</button><button class="quiet" data-reset="${id}">重新进入登录页</button></div><p class="site-state">尚未打开</p><a href="${homes[id]}" target="_blank" rel="noopener noreferrer">在当前浏览器手动打开 ↗</a><p>手动入口供浏览；采集只读取工具创建的窗口。</p></div>`).join('');
$('#sites').onclick=e=>{if(e.target.dataset.open)act('open',{site:e.target.dataset.open});if(e.target.dataset.capture)act('capture',{site:e.target.dataset.capture});if(e.target.dataset.reset)act('reset-login',{site:e.target.dataset.reset});};
for(const a of ['start','resume','stop','skip'])$('#'+a).onclick=()=>act(a);
$('#config').onsubmit=async e=>{e.preventDefault();await act('config',{...state.config,keywords:$('#keywords').value.split(/[\n,，]+/),pages:Number($('#pages').value),sites:[...document.querySelectorAll('[name=site]:checked')].map(x=>x.value),financeOnly:$('#finance').checked,excludeIntern:$('#intern').checked,maimaiUrl:$('#maimaiUrl').value})};
function drawSiteStatus(){
 for(const site of Object.keys(names)){
  const box=$(`[data-site="${site}"]`),s=state.browserSites?.[site];
  box.querySelector('.site-state').textContent=pendingSites.has(site)?'正在处理，请稍候…':s?.message||'尚未打开';
  box.querySelector('[data-open]').textContent=s&&s.phase!=='closed'?'切回工具窗口':'打开并登录';
  for(const button of box.querySelectorAll('button'))button.disabled=pendingSites.has(site)||state.busy;
  box.classList.toggle('needs-action',['held','verification','login','rate_limited','blocked','blank'].includes(s?.phase));
 }
}
function draw(){
 const kind=$('#filter').value,needle=$('#search').value.toLowerCase();
 const rows=state.jobs.filter(j=>(kind==='all'||kind==='saved'&&j.saved||kind==='match'&&j.match)&&[j.title,j.company,j.text].join(' ').toLowerCase().includes(needle));
 $('#counts').innerHTML=state.jobs.filter(j=>j.match).length+'<span>匹配 / 共 '+state.jobs.length+' 条</span>';
 $('#status').textContent={idle:'准备就绪',running:'浏览进行中',paused:'等待处理',done:'浏览完成'}[state.run.status]||state.run.status;
 const currentSite=state.run.current?.site,currentPage=state.browserSites?.[currentSite];
 const recoveredBlank=state.run.status==='paused'&&state.run.message?.includes('网页变为空白')&&currentPage&&!['blank','closed','held'].includes(currentPage.phase);
 $('#message').textContent=recoveredBlank?names[currentSite]+'：'+currentPage.message+'；处理后点击“继续”':state.run.message||'先打开网站，在工具浏览器中完成登录。';
 $('#progress').textContent=`${state.run.index} / ${state.run.queue.length}`;
 $('#log').textContent=state.run.log.map(l=>new Date(l.time).toLocaleTimeString()+' '+l.message).join('\n');
 $('#start').disabled=state.busy;$('#resume').disabled=state.busy;$('#skip').disabled=state.busy;
 drawSiteStatus();
 const params=new URLSearchParams({q:needle});if(kind==='all')params.set('all','1');if(kind==='saved')params.set('saved','1');$('#csv').href='/api/export?'+params;params.set('format','json');$('#json').href='/api/export?'+params;
 const rowsKey=JSON.stringify(rows);
 if(rowsKey===lastRows)return;
 lastRows=rowsKey;
 $('#results').innerHTML=rows.length?rows.map(j=>`<article class="job"><div class="job-head"><h3><button type="button" class="job-link" data-open-job="${esc(j.id)}" title="在已登录的工具浏览器中查看职位">${esc(j.title)}</button></h3><span class="salary">${esc(j.salary||'薪酬未显示')}</span><button class="quiet" data-id="${esc(j.id)}">${j.saved?'★ 已收藏':'☆ 收藏'}</button></div><p class="meta">${names[j.site]} · ${esc(j.company||'公司未识别')} · ${j.city} · 最近采集 ${new Date(j.lastSeen).toLocaleString()}</p><div class="tags">${j.reasons.map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div><details><summary>查看原始列表信息与命中关键词</summary><p>${esc(j.text)}</p><p>检索词：${esc(j.queries.join(' / '))}</p></details></article>`).join(''):'<div class="empty">暂无符合条件的岗位<span><br>首次使用请打开网站登录；也可切换“全部采集”检查筛选原因。</span></div>';
}
$('#results').onclick=async e=>{
 const open=e.target.closest('[data-open-job]');
 if(open){const j=state.jobs.find(j=>j.id===open.dataset.openJob);if(j){open.disabled=true;try{await act('open-job',{id:j.id,site:j.site});}finally{open.disabled=false;}}return;}
 const id=e.target.dataset.id;if(id){const j=state.jobs.find(j=>j.id===id);act('save-job',{id,saved:!j.saved})}
};
$('#filter').onchange=draw;$('#search').oninput=draw;
async function refresh(first=false){try{const r=await fetch('/api/state');if(!r.ok)throw Error('服务不可用');state=await r.json();if(first){$('#keywords').value=state.config.keywords.join('\n');$('#pages').value=state.config.pages;$('#finance').checked=state.config.financeOnly;$('#intern').checked=state.config.excludeIntern;$('#maimaiUrl').value=state.config.maimaiUrl;document.querySelectorAll('[name=site]').forEach(x=>x.checked=state.config.sites.includes(x.value))}draw()}catch(e){$('#status').textContent='本地服务未连接';$('#message').textContent='请重新运行启动脚本。'}}
await refresh(true);setInterval(()=>refresh(),2000);
