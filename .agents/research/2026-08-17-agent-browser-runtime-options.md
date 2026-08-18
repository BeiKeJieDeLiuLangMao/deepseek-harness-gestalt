# DSH 跨平台 Agent 浏览器运行时调研

日期：2026-08-17

## 结论

没有一个现成项目同时完整满足“ego 的任务级隔离 Space、BrowserOS 的真实登录态与日常浏览器、Codex 式外部 Agent 驱动、跨 macOS/Windows/Linux、适合直接嵌入 DSH”。最接近目标的开源组合是：以 [Tandem Browser](https://github.com/hydro13/tandem-browser) 作为可贡献的浏览器产品与人工接管层，以 Playwright `BrowserContext` 或 [@ulpi/browse](https://github.com/ulpi-io/browse) 的多 Context 模型作为隔离语义参考，在 DSH 中新增一个小而稳定的 Browser Space capability seam。短期验证则直接通过 DSH 已有 MCP client 接入 [agent-browser](https://github.com/vercel-labs/agent-browser) 或 [Playwright MCP](https://github.com/microsoft/playwright-mcp)，不要先 fork Chromium。

一句话选择：

- 最适合贡献并逐步做成“ego × BrowserOS”的项目：**Tandem Browser**。它是 MIT、Electron、真实可见浏览器、MCP/HTTP、人工接管，并且源码里已经用 Electron partition 做了独立 Cookie/Storage Session；但 Linux、隔离 Session 的安全栈/扩展、生命周期清理仍不够成熟。
- 最接近 ego 隔离运行时语义的轻量实现：**@ulpi/browse**。一个 Chromium 进程里为每个 Agent 建独立 Playwright `BrowserContext`，同时提供 MCP、refs、状态保存和 handoff；但项目非常年轻，适合验证或上游共建，不宜未经审计就成为 DSH 的唯一生产依赖。
- 最稳妥的近期 DSH 插件底座：**agent-browser 或 Playwright MCP**。跨平台、Apache-2.0、AI snapshot/ref 友好、接入成本最低，但它们本身不是“人和 Agent 共用的浏览器产品”。
- 最适合复用日常登录态的外部浏览器：**BrowserOS/BrowserOS neo**。它跨三平台、可由外部 Agent 通过 MCP 驱动，但公开材料只承诺任务分 Tab 并行，没有承诺 ego 式每任务 Cookie/Storage 隔离；AGPL-3.0 也使直接内嵌或复制代码需要单独做许可证评估。

## 用户目标拆解

这里的“像 ego 和 BrowserOS 的混合体”不是一个普通浏览器扩展，而是四项相互独立的能力：

1. **任务隔离**：每个 Agent/DSH Session 拥有自己的 Cookie、localStorage、sessionStorage、IndexedDB、Cache、权限和 Tab 集合。
2. **真实登录态**：可以显式复用或播种用户已有的账号状态，而不是每个任务都从空白登录。
3. **人机共驾**：Agent 后台运行，人能看到、暂停、接管 CAPTCHA/MFA/OAuth，再交回 Agent。
4. **Agent 原生接口**：语义 snapshot、稳定 ref、低 token 工具集、可批量执行，并能与 Codex、Claude Code、DSH 等外部 Harness 连接。

必须把两类状态区分开：

- `isolated-*` Space 拥有独立存储，可以给出强隔离承诺。
- `attached-user-browser` Space 接入 BrowserOS、Tandem 默认 Session 或现有 Chrome 登录态，只能承诺 Tab/控制权隔离，不能把共享 Cookie/Storage 宣称为任务隔离。

自动复制整个 Chrome Profile 也不是无损的“登录态继承”：Cookie/localStorage 之外还有 IndexedDB、Service Worker、设备绑定、操作系统密钥链和站点风控。状态导入应当是显式的人类授权动作，而不是模型可任意读取或导出的工具。

## DSH 现在已经有什么

### 已有：外部浏览器工具的 MCP 接入通道

[`@deepseek-ai/dsh-mcp-client`](../../packages/mcp/mcp-client/README.md) 已支持 stdio 与 Streamable HTTP MCP，并把外部工具注册成 `mcp__<server>__<tool>`。因此 DSH 今天就可以连接 Playwright MCP、agent-browser MCP、Tandem MCP 或 BrowserOS MCP，不需要先修改 agent-loop。

这条通道的局限也很明确：它只桥接工具，不拥有浏览器 Session、Cookie/Storage 策略、DSH Session 到 Browser Space 的绑定、人工接管状态或浏览器任务 UI。直接接 Tandem 还会把 257 个工具 schema 全部放进模型请求；MCP client 自己的文档也说明，工具 schema 会在每次请求支付 token 成本。

### 没有：交互式浏览器运行时

当前 [`ctx.web`](../../docs/subsystems/web.md) 只定义 `search` 与 `fetch` 两个操作；[`packages/web`](../../packages/web/README.md) 没有 BrowserContext、Tab、Cookie、Storage、snapshot 或 human handoff 概念。

当前 [`apps/desktop`](../../apps/desktop/SPEC.md) 是包裹 `dsh web` 的 Electron Desktop Host，不是日常浏览器。源码中也没有 `session.fromPartition()`、BrowserView/WebContentsView 或任务级 browser partition。仓库里的 Playwright 目前用于 Web UI E2E 测试，不是产品运行时。

所以准确答案是：**DSH 已有可快速接 MCP 浏览器的运输层，但还没有你描述的 Browser Space 功能。**

## 候选对比

| 候选 | 跨平台状态 | 存储隔离 | 真实登录态/人机共驾 | AI 接口 | 许可证与复用判断 | 结论 |
|---|---|---|---|---|---|---|
| [Tandem Browser](https://github.com/hydro13/tandem-browser) | macOS、Windows；Linux best-effort | Electron `persist:session-*` partition，Cookie/Storage 原生隔离 | 默认真实 Session、可见浏览器、handoff、工作区 | MCP + HTTP + accessibility refs | MIT；适合贡献 | **产品形态最接近，首选共建对象** |
| [@ulpi/browse](https://github.com/ulpi-io/browse) | 浏览器自动化基于 Playwright，Node 18+ | 每个 Session 一个 BrowserContext，共享 Chromium 进程 | Profile、Cookie 导入、handoff/resume | MCP + CLI + refs | Apache-2.0；社区很小 | **隔离语义最佳，成熟度风险最高** |
| [agent-browser](https://github.com/vercel-labs/agent-browser) | macOS/Windows/Linux | 每个 Session 一个浏览器实例；共享 CDP 时只隔离 Tab | Chrome Profile 只读复制、持久 Profile | MCP + CLI + refs + tool profiles | Apache-2.0；Node 24+ | **近期 DSH 集成首选之一** |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | Chromium/Firefox/WebKit；三平台 | `--isolated` BrowserContext；可用 storage state 播种 | Extension 可接现有 Chrome Tab/Profile | MCP + accessibility snapshot | Apache-2.0；维护成熟 | **最稳的基础设施底座** |
| [BrowserOS](https://github.com/browseros-ai/BrowserOS) | 官方提供 macOS/Windows/Linux | 未发现每任务 Cookie/Storage 隔离承诺；官方描述为各自 Tab | Chrome 数据导入、可见任务、外部 Agent MCP | 内建 Agent + MCP | AGPL-3.0；外部进程接入更稳妥 | **真实浏览器层，不单独承担隔离层** |
| [ego lite](https://github.com/CitroLabs/ego-lite) | 当前只有 macOS；Windows/Linux 在 roadmap | 官方 Space 是任务级隔离 | Chrome 数据迁移、可见 Space、人工接管 | JS helper + snapshot/ref | 仓库 MIT，但浏览器 App 是单独下载 | **目标标杆，不满足当前跨平台/完整开源复用要求** |
| [BrowserMCP](https://github.com/BrowserMCP/mcp) | Chrome 扩展路径可跨桌面平台 | 复用现有 Profile，无多 Space 隔离 | 直接用用户当前浏览器 | MCP | Apache-2.0，但仓库 README 说明缺少单仓库构建依赖 | 不作为核心底座 |

## 关键候选核验

### Tandem Browser：最值得上游贡献

Tandem 当前 README 把它定义为 local-first Electron browser，Agent 与人共享真实 Tab、Cookie 和登录 Session，可通过 MCP/HTTP 接入，并明确列出 isolated sessions、显式 handoff、macOS/Windows 支持与 Linux best-effort。[官方 README](https://github.com/hydro13/tandem-browser/blob/3b613cfd4c299609ca7ca415d638c1b71c6ba5de/README.md)

隔离不是只有文案。当前 `SessionManager` 为命名 Session 创建 `persist:session-${name}`，再通过 Electron `session.fromPartition()` 初始化；Tab 创建时携带该 partition。因此不同命名 Session 的 Cookie/Storage 确实落在不同 Electron Session 中。[SessionManager 源码](https://github.com/hydro13/tandem-browser/blob/3b613cfd4c299609ca7ca415d638c1b71c6ba5de/src/sessions/manager.ts) [Tab manager 源码](https://github.com/hydro13/tandem-browser/blob/3b613cfd4c299609ca7ca415d638c1b71c6ba5de/src/tabs/manager.ts)

但当前实现还有几项会阻止我们直接把它当成熟基础设施：

- 隔离 Session 是持久 partition，但 Session registry 只在内存注册；`destroy()` 关闭 Tab 和删除 registry 项，没有清除 partition 的磁盘 Storage。产品需要明确区分 `close`、`forget` 与安全擦除。
- 显式 state save/load 只导出和恢复 Cookie，不包括 localStorage/IndexedDB；partition 本身会持久保存这些数据，但它还不是可移植的完整 Space snapshot。[StateManager 源码](https://github.com/hydro13/tandem-browser/blob/3b613cfd4c299609ca7ca415d638c1b71c6ba5de/src/sessions/state.ts)
- 当前 `createWindow()` 只在默认 `persist:tandem` Session 上创建 RequestDispatcher/Stealth；`SessionManager` 创建隔离 partition 时只调用 `session.fromPartition()`，没有为它挂同等网络安全栈。扩展管理器虽然已有 `loadInSession()`，当前 Session 创建路径没有调用它。因此隔离 Agent Session 尚未获得默认 Session 的同等安全/扩展能力。[main.ts](https://github.com/hydro13/tandem-browser/blob/3b613cfd4c299609ca7ca415d638c1b71c6ba5de/src/main.ts) [SessionManager](https://github.com/hydro13/tandem-browser/blob/3b613cfd4c299609ca7ca415d638c1b71c6ba5de/src/sessions/manager.ts) [ExtensionManager](https://github.com/hydro13/tandem-browser/blob/3b613cfd4c299609ca7ca415d638c1b71c6ba5de/src/extensions/manager.ts)
- MCP 暴露 257 个工具，功能全面但不适合直接作为每轮模型请求的默认工具面。
- 官方仍称 public developer preview；Linux 是 secondary/best-effort，而不是与 macOS/Windows 同等级发布。

这些缺口反而构成了清晰的上游贡献路线：隔离 Session 的安全栈与选择性扩展加载、可恢复 registry、`close`/`delete-data` 生命周期、精简 MCP tool profile、Linux CI/打包，以及更明确的 Agent/User ownership 事件。相比 fork BrowserOS 的 Chromium 大仓库，这些改动更小、MIT 更易复用，也更贴近 DSH 的插件边界。

### @ulpi/browse：最接近 ego 的运行时内核

`@ulpi/browse` 的 README 明确说明，每个 `--session` 都有独立 BrowserContext、Cookie、Storage、Cache、Tab 和 ref，同时所有 Session 共用一个 Chromium 进程；`--profile` 则启动单独持久浏览器进程。它还提供 Chrome Cookie 导入、state save/load、MCP 和 `handoff`/`resume`。[官方 README](https://github.com/ulpi-io/browse/blob/a793e10cebe7b7a4a5b9f5dbf9c5699f424084b5/README.md)

源码确认 Session factory 在共享 `Browser` 上调用 `browser.newContext()`；默认首个 CDP Context 可以复用真实 Chrome 状态，后续命名 Session 新建 Context。[target factory](https://github.com/ulpi-io/browse/blob/a793e10cebe7b7a4a5b9f5dbf9c5699f424084b5/src/session/target-factory.ts) [browser manager](https://github.com/ulpi-io/browse/blob/a793e10cebe7b7a4a5b9f5dbf9c5699f424084b5/src/browser/manager.ts)

这正是 ego Space 的关键运行时语义，但它仍是 headless-first 工具，不是 BrowserOS/Tandem 那种日常浏览器和多 Space 控制台。调研当天 GitHub 页面显示仅 1 fork、1 个 issue；项目变化快，应先做源码、安全、并发、崩溃恢复和三平台 E2E 审计。适合作为原型或贡献对象，不应把 README 的性能数字直接当成 DSH 的生产事实。

### agent-browser：成熟且 AI 友好，但隔离成本更高

agent-browser 的命名 Session 各自拥有浏览器实例、Cookie/Storage、历史和认证状态；当多个 Session 通过 CDP 共用一个 Chrome 时，官方只提供严格 Tab pinning，并没有 Cookie/Storage 隔离。[Sessions 文档](https://github.com/vercel-labs/agent-browser/blob/548b159b30eef119ccf6846c8bc807d0eaa3f6f8/docs/src/app/sessions/page.mdx)

`--profile Default` 会把 Chrome Profile 复制到临时目录，避免修改原始 Profile；持久路径 Profile 可保存 Cookie、localStorage、IndexedDB、Service Worker 和 Cache。它的语义 snapshot/ref、MCP tool profiles 和批量命令很适合 Agent。代价是强隔离 Session 默认每个一个浏览器进程，不是 ego 那种一个进程多个 Space；当前 package 还要求 Node 24+，而 DSH 仍支持 Node 22.19，因此不能在所有受支持 DSH 运行时里直接作为同进程依赖。[官方 README](https://github.com/vercel-labs/agent-browser/blob/548b159b30eef119ccf6846c8bc807d0eaa3f6f8/README.md) [package.json](https://github.com/vercel-labs/agent-browser/blob/548b159b30eef119ccf6846c8bc807d0eaa3f6f8/package.json)

### Playwright MCP：最稳的基础能力

Playwright 官方定义 BrowserContext 为同一浏览器中的独立 incognito-like Profile，每个 Context 有独立 Cookie、localStorage 和 sessionStorage，创建成本低。[BrowserContext 隔离文档](https://playwright.dev/docs/browser-contexts)

Playwright MCP 默认可以使用持久 Profile，也支持 `--isolated`、`--storage-state`、独立 `--user-data-dir`，并能通过 Chrome Extension 接入现有浏览器 Tab 和登录态。官方同时警告一个持久 Profile 只能由一个浏览器实例写入；并发客户端必须使用隔离模式或不同目录。[Playwright MCP User profile](https://github.com/microsoft/playwright-mcp#user-profile)

它适合作为 DSH Browser provider 的底层引擎，但没有完整的 Browser Space 产品状态、任务控制台和人工 ownership 交接。

### BrowserOS：应作为“已登录浏览器”外部 provider

BrowserOS 是 AGPL-3.0 Chromium fork，官方提供 macOS、Windows 与 Linux 构建，可导入 Chrome 的登录、书签、密码与扩展，并可作为 MCP 被 Codex/Claude Code 等外部 Agent 驱动。[官方 README](https://github.com/browseros-ai/BrowserOS)

当前 BrowserOS neo 的公开描述是每个 Agent 在自己的 Tab 并行工作并持久复用导入登录态；公开 README 未说明每个任务拥有独立 BrowserContext/partition。因此它非常适合 `attached-user-browser`，但在没有源码级证明前不应承担 `isolated-*` 的隔离承诺。直接复制或链接 AGPL 代码进入 DSH 发行物需要许可证评估；保持独立进程，通过 MCP/HTTP/CDP 连接更容易维持清楚的产品和许可证边界。

### 为什么普通 Chrome 扩展不够

Chrome 扩展的 incognito 模型只有 regular 与 incognito 两类。`split` 模式给 incognito 一个独立、内存型 Cookie Store，但 `chrome.storage.local`/`sync` 仍与 regular 共享。[Chrome incognito manifest](https://developer.chrome.com/docs/extensions/reference/manifest/incognito)

因此，从公开扩展 API 推断，普通跨浏览器扩展无法创建任意数量、每任务一个的 ego 式 Cookie/Storage Context。要得到 N 个强隔离 Space，必须使用 Playwright/CDP 创建 BrowserContext、用 Electron partition、运行多个 Profile，或者修改 Chromium。扩展仍可作为“连接用户现有浏览器”的附着层，但不能独自成为隔离层。

Electron 的官方 `session.fromPartition()` 正好提供另一条跨平台路径：相同 partition 复用 Session，`persist:` 前缀持久保存，不带前缀则是内存 Session。[Electron session 文档](https://www.electronjs.org/docs/latest/api/session#frompartitionpartition-options)

## 推荐的 DSH 形态

不要把 BrowserOS/Tandem 的全部浏览器能力直接塞进 `ctx.web`，也不要让 Desktop Host 自己成为浏览器生命周期的权威。新增独立的 Browser Space capability seam：

```text
DSH Session / Agent
        │
        ▼
Browser Space Consumer
  snapshot / navigate / act / tabs / handoff
        │
        ▼
ctx.browserSpaces ── durable lifecycle + policy
        │
        ├── Tandem provider       real visible browser + Electron partitions
        ├── Playwright provider   isolated BrowserContexts
        ├── agent-browser provider mature CLI/MCP baseline
        └── BrowserOS provider    attached logged-in user browser
```

建议的 Space 模式：

| 模式 | 存储 | 典型用途 | 可承诺隔离 |
|---|---|---|---|
| `isolated-ephemeral` | 新建内存 BrowserContext/partition，关闭即清除 | 一次性研究、测试、敏感任务 | 是 |
| `isolated-persistent` | 每个 DSH Session/Task 一个专用 profile/partition | 长任务、重复登录 | 是 |
| `isolated-seeded` | 新 Context，显式导入受控 storage state | 需要登录但不想共用日常 Profile | 导入后彼此隔离 |
| `attached-user-browser` | BrowserOS/Tandem/Chrome 的现有 Profile | 真实日常账号、人机共驾 | 只隔离 Tab/控制权，不隔离 Cookie |

服务层至少应拥有：

- branded `BrowserSpaceId` 与 `BrowserProfileId`，模型不能自己选择或伪造底层 Session 名。
- DSH Session/Agent 到 Browser Space 的绑定、并发 owner、暂停、人工接管、交回、关闭与清理。
- provider-neutral 的 snapshot/ref/action 结果，而不是把 257 个底层工具全部暴露给模型。
- 一开始就决定工具 UI：浏览器调用需要 screenshot/location/ownership 信息，不能只渲染成泛化文本。
- model-visible snapshot/action 继续由 `tool/call`/`tool/result` 记录；Space 创建、绑定、handoff、owner 变化等需要新的 durable Session event 才能重放。
- Cookie、token、密码和原始 storage state 永不进入模型上下文或 Session log；导入、导出和人工登录走权限/credential reference。
- 对提交表单、发帖、支付、删除、发布等外部副作用保留明确审批，不因浏览器已有登录态而扩大 Agent 权限。

## 分阶段建议

### Phase 0：两天内验证，不承诺产品化

用现有 DSH MCP client 分别做两个 Spike：

1. `agent-browser mcp` 或 Playwright MCP `--isolated`：验证 snapshot/ref、点击、下载、截图、一个空白隔离 Session、storage-state 播种。
2. Tandem MCP/HTTP：验证默认登录态、创建 `persist:session-*`、两个 Session Cookie 不互见、后台 Tab 不抢焦点、人工接管与交回。

三平台至少验证 macOS、Windows、Linux 各一次。Tandem 在 Linux 上只能先记为实验通过或失败，不能因源码可启动就写成受支持产品。

### Phase 1：DSH 原生 Browser Space seam

先做 Service Definition、一个 provider、一个精简 Consumer，模型面控制在约 8–12 个稳定工具：`open`、`snapshot`、`act`、`tabs`、`wait`、`screenshot`、`handoff`、`close`。DSH Session ID 在 provider 内部绑定，不能要求模型每次传 `session` 字符串。

首个 provider 有两种合理选择：

- 追求快速稳定：包一层 agent-browser/Playwright。
- 追求目标产品形态：通过 Tandem HTTP API 做 provider，同时向 Tandem 上游补齐隔离 Session 生命周期与安全栈。

### Phase 2：上游贡献 Tandem，而不是在 DSH 重造浏览器

优先贡献：

1. 隔离 Session 也安装 NetworkShield/Guardian/权限策略，并允许选择性加载扩展。
2. 将 Session registry、partition、owner、打开 Tab 和清理策略持久化；区分 close、forget 和 wipe。
3. 增加 MCP tool profiles 或 server-side allowlist，允许 DSH 只发现核心工具。
4. 增加 ownership/handoff 事件流，让 DSH UI 不依赖轮询和推测。
5. 把 Linux 从 best-effort 推进到有 CI、安装包和浏览器 E2E 的受支持平台。

### Phase 3：双平面融合

同时提供 Playwright/Tandem isolated provider 与 BrowserOS/Tandem-default attached provider。用户在 UI 中明确选择“隔离 Space”或“使用我的已登录浏览器”，通过受控的人类流程把必要认证状态播种到隔离 Space；不要静默复制所有 Cookie。

## Go / No-Go

**Go：** 先做 MCP Spike；如果跨平台和登录/隔离验证通过，再设计 DSH Browser Space seam。Tandem 值得作为主要上游贡献对象，Playwright/agent-browser 值得作为保底 provider。

**No-Go：** 目前不要 fork Chromium，不要把 BrowserOS 代码直接并入 DSH，不要把普通 Chrome 扩展当成多租户隔离方案，也不要把 257 个 Tandem 工具直接长期挂到每个 DSH Agent 的默认工具集。

## 主要来源

- [ego lite README](https://github.com/CitroLabs/ego-lite) 与 [Space 文档](https://lite.ego.app/document/en/docs/space)
- [Tandem Browser README](https://github.com/hydro13/tandem-browser) 与固定版本 [SessionManager](https://github.com/hydro13/tandem-browser/blob/3b613cfd4c299609ca7ca415d638c1b71c6ba5de/src/sessions/manager.ts)
- [@ulpi/browse README](https://github.com/ulpi-io/browse) 与固定版本 [BrowserManager](https://github.com/ulpi-io/browse/blob/a793e10cebe7b7a4a5b9f5dbf9c5699f424084b5/src/browser/manager.ts)
- [agent-browser README](https://github.com/vercel-labs/agent-browser) 与 [Sessions 文档](https://github.com/vercel-labs/agent-browser/blob/548b159b30eef119ccf6846c8bc807d0eaa3f6f8/docs/src/app/sessions/page.mdx)
- [Playwright MCP README](https://github.com/microsoft/playwright-mcp) 与 [BrowserContext isolation](https://playwright.dev/docs/browser-contexts)
- [BrowserOS README](https://github.com/browseros-ai/BrowserOS)
- [Chrome Extension incognito model](https://developer.chrome.com/docs/extensions/reference/manifest/incognito)
- [Electron session partitions](https://www.electronjs.org/docs/latest/api/session)
- DSH 当前 [`mcp-client`](../../packages/mcp/mcp-client/README.md)、[`web` subsystem](../../docs/subsystems/web.md) 与 [`Desktop Host`](../../apps/desktop/SPEC.md)
