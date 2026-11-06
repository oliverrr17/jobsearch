# Agent-Reach 与 Scrapling 的适用性评估

核查日期：2026-11-06。目标是改善上海金融研究岗位浏览工具的登录稳定性、可诊断性和持续采集能力。

结论：Agent-Reach 更适合参考招聘站点接入和登录会话管理；Scrapling 更适合参考采集调度、复用会话、限速和恢复。当前版本采用 Node.js 和 Patchright 兼容驱动（1.64.3），与 Scrapling 的浏览器技术选择一致；没有整套接入 Agent-Reach 或 Scrapling，搜索仍由本工具实现。

## 源码核查

| 项目 | 核查发现 | 对本工具的价值 |
| --- | --- | --- |
| Agent-Reach | BOSS channel 提供 search/read，配置 OpenCLI 与 boss-agent-cli 后端；区分 NEED_LOGIN、PLATFORM_BLOCKED、RATE_LIMITED；原生后端要求已选择的 CDP 浏览器 | 将登录与搜索分开；复用会话；阻断原因可见；避免并发操作同一标签页 |
| Scrapling | Spider 按会话分派任务，限制并发和下载间隔，并保存待执行请求与去重状态；AutoThrottle 参考响应延迟、阻断情况和 Retry-After 调整等待 | 持久队列、站点隔离、保守节奏、失败后暂停、用本地样本回归测试 |

Agent-Reach 的 BOSS 能力依赖额外适配器和浏览器接入，并非装上主项目即可保证登录成功。其原生后端还固定依赖版本、保留短期职位引用，并通过既有浏览器读取数据。源码支持这些设计，但此次没有执行它的 BOSS 后端实测。[BOSS channel](https://github.com/Panniantong/Agent-Reach/blob/47898829204ad27521d8a1719e3aeca3b8a3e0ca/agent_reach/channels/boss.py)、[原生后端](https://github.com/Panniantong/Agent-Reach/blob/47898829204ad27521d8a1719e3aeca3b8a3e0ca/agent_reach/backends/boss_native.py)

Scrapling 是 Python 框架，适合扩展采集系统；自适应解析与浏览器抓取也不能保证解决 BOSS 的账号、网络或浏览器验证。本次读取了其会话、架构及限速实现，没有运行其抓取引擎。[会话设计](https://github.com/D4Vinci/Scrapling/blob/bc602488b44e978da3266841e913af17577ec0fd/docs/spiders/sessions.md)、[调度与恢复](https://github.com/D4Vinci/Scrapling/blob/bc602488b44e978da3266841e913af17577ec0fd/docs/spiders/architecture.md)、[限速实现](https://github.com/D4Vinci/Scrapling/blob/bc602488b44e978da3266841e913af17577ec0fd/scrapling/spiders/throttle.py)

## 当前已落实

1. 打开登录入口、切回已有窗口、主动重置登录，成为三个明确动作；普通重复点击不再导航；已访问过的标签页即使变为空白，也不自动重载。
2. 前后端对重复打开请求去重，启动任务时检查登录操作是否尚在进行。
3. 登录、验证、访问频繁、环境限制与连续跳转有不同状态；无法继续时暂停任务。
4. 30 秒内同一路径第 4 次主页面请求触发停止；验证链接的随机参数不影响检测。历史只记录域名与路径，不显示验证查询参数。
5. 批量浏览等待时间下限提高到 10 秒。现有专用浏览器资料、持久队列、去重、收藏和导出继续复用。
6. 增加真实 Chrome 的离线跳转复现和工作台交互回归，避免调试时频繁请求招聘网站。
7. v1.2 使用 Patchright 兼容驱动解决已复现的空白页问题。对照测试中普通 Playwright 的新旧版本均复现，Patchright 下两个入口稳定，猎聘实际搜索识别 40 张卡片。[驱动原项目](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-nodejs)

v1.2 已将空白页问题定位到原浏览器驱动与网站脚本的交互：猎聘主页面出现 scriptInitiated 的 about:blank 跳转，更换驱动后未再复现；没有进一步断言网站采用了哪项具体检测条件。登录或验证仍按网站正常流程完成。

## 尚未实现及后续判断依据

- **已有浏览器接入**：Agent-Reach 的连接方案值得后续评估，可减少用户重复登录。需要明确选择连接的浏览器和账号，再做端到端测试；当前“手动打开”链接仅供浏览，没有接管当前浏览器。
- **HTTP 限流与动态退避**：现版本从可见页面识别频繁访问提示并暂停，未实现 Scrapling 的完整 AutoThrottle、HTTP 429/Retry-After 处理或自动重试。
- **自适应选择器**：等获得真实登录后页面样本，再评估替换规则。目前使用明确的卡片选择器与链接回退；识别不到时提示问题，避免把页面变化误报成没有岗位。
- **详情采集**：现版本采集列表可见信息。Agent-Reach 的 read 能力可作详情模块的参考，但未接入。

建议先验证登录后的一次搜索、一次翻页、一次导出，再扩大关键词数量。只有列表模式暴露出明确缺陷时，再引入额外后端；不因项目宣传中的反爬能力直接替换整个工具。

核查版本：Agent-Reach `47898829204ad27521d8a1719e3aeca3b8a3e0ca`；Scrapling `bc602488b44e978da3266841e913af17577ec0fd`。以上链接固定到核查版本，便于后续比较。
