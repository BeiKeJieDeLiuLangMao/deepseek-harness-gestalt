# Agent Note: 在官方工作台统一 Sidebar 能力

Status: proposed

[English](2026-09-09-official-sidebar-capability-fusion.md) | 中文

## 问题

Web 组合目前挂载了两个右侧工作台。`ui-sidebar-right` 持有框架的 `rightbar` slot、一份 DockKit 表面、`ctx.sidebarRight`、`ctx.sidebarRightTabs`，以及引导、文件和文本预览类型。`ui-better-sidebar` 另行把 React 根追加到 `document.body`，并持有另一块右面板、底面板、浮窗、注册表、布局 store 和 `dsh-sidebar:v1:*` 状态。两块重复面板暴露不同能力，并把文件、Browser、Phone、Side Chat、Terminal、Changes、Tasks、Member Question 与模型发起的打开操作送进不同状态 owner。

官方 workbench 提供更可靠的组合模型：tab 定义、keyed 正文/标题/菜单slot、类型化资源地址、逐 record occurrence、纯 DockKit 操作、两份持久表面、稳定多实例身份、事务式关闭、未激活 Session 打开与读取投影。它还不能表达另一块 workbench 承载的全部行为。若在补齐缺口之前移除第二套 UI，就会丢失 descriptor metadata、跨 Session Terminal pin、富查看器、运行时 tab、设置与第三方扩展。

## 提案

让 `@deepseek-ai/dsh-client-ui-sidebar-right` 成为唯一可见工作台和布局状态 owner。先扩展它的公开定义、导航、occurrence 与持久化约定，再通过它的slot注册现有能力。`@deepseek-ai/dsh-client-ui-dockkit` 继续作为唯一布局引擎。每个消费者改用官方接口后，删除 Better 的直接根、布局 store、全局布局 CSS 推动和 `ctx.betterSidebar`。

Host route 可在其能力迁入正式 provider/consumer 归属时保留。本提案不要求仅为改名而替换正常工作的 Host 文件、Git、PTY、jobs、Side Chat、Phone 或 Browser transport。每条保留 route 继续遵守 Session owner、浏览器信任、工作区 fence、有界 I/O 和 teardown 规则，而且每项能力只有一个 provider owner。

## 所有权与生命周期

官方 Session 工作台持有右侧与底部 DockKit 布局、浮动 pane、放置、焦点、tab record、occurrence 状态、持久化和关闭准入。tab 类型通过 keyed slot注册持有自己的正文 store、数据加载和运行时 manager。一个 occurrence 存续期间，tab 正文可以多次挂载与卸载。

tab record 消失或 `ui-sidebar-right` 卸载时，occurrence signal 才结束。隐藏 tab、切换 Session、分栏、拖动、浮动、全屏变化与 renderer 重挂载都不会结束它。tab 类型的 HMR 卸载也不会结束 occurrence：record 与持久 payload 保留，官方 unavailable 正文出现，相同 definition 重新注册后正文恢复。类型注册 disposer 会释放或暂停类型 runtime manager，但不会运行用户关闭行为。只有真正由用户或 owner 发起的关闭才能 archive Side Chat、kill PTY、关闭 Browser Workspace page 或停止 Phone task，而且该关闭必须在布局提交前完成异步准入。外部 owner 的 open 或 close 会建立 history checkpoint，不能 undo 或 redo；普通 resource layout history 继续可逆。

## 必需的官方接口

| 约定 | 必需行为 |
|---|---|
| 持久工作台状态 | 版本化 codec 与 adapter 加载、保存右侧表面、底部表面、浮窗、历史策略、身份、payload、pin、Side Chat tombstone、宽度与底部高度。adapter 属于 `ui-sidebar-right`；不得保留 mirror store。 |
| 底部表面 | `ui-layout` 提供 bottom slot与中心列 track。`ui-sidebar-right` 在同一 Session 工作台状态中持有第二份 DockKit 表面，并让右侧、底部和浮窗共享同一个 id/occurrence domain。 |
| Page 身份与 payload | Page 打开接受调用方给出的稳定身份。逐 occurrence 的 declaration-merged、JSON-compatible payload 会持久化，并可与标题一同更新。未知 kind 与 payload 保持可恢复。 |
| 定向导航 | 公开的 Session-bound navigator 可以在未激活或尚未渲染的 Session 中打开资源和 page。它会物化官方状态，而不依赖已挂载 seat 或 concrete 内部方法。 |
| 关闭准入 | 每个可能移除 record 的操作都进入同一个 close coordinator，包括 replace、settle、reset、undo 与 redo。批量操作在任何状态变更前完成全部可取消 admission。随后逐 record 结算 runtime release：成功 record 关闭，失败 record 保留并显示失败，已提交外部工作绝不伪装为已回滚。HMR disposal 不调用关闭 hook。 |
| 只读投影 | 稳定的官方 projection 与 subscription 只暴露可见文件折叠、Browser 对账、pin inventory、设置与迁移所需的产品事实。DockKit node 与 operation 保持内部实现。 |
| 扩展定义 | 官方定义表达 order、hidden、availability、icon/title/badge、单例或 keyed 实例、URL claim、enabled 状态、settings 声明、lifecycle callback，以及由一个 effect 持有的 keyed 正文/标题/菜单注册。 |
| 查看器注册表 | 官方文件查看器 inventory 保留 priority 与注册顺序、扩展名匹配、头字节检测、catch-all fallback、可中止 custom load、enablement、settings 与 HMR disposal。异步 sniff 留在一个官方 file occurrence 后面。 |
| 链接路由 | Chat 与 Markdown 的链接 action 查询官方 URL claim 注册表。一个 handler 应用总开关与协议设置，并保留带修饰键点击的放行；不再有 Better document-capture owner。 |

## 能力基线

| 能力 | 必须保留的行为 | 当前证据与迁移风险 |
|---|---|---|
| 官方右侧呈现 | 折叠 rail、push 模式、保留 track 的宽屏全屏、自动窄屏全屏、框架持有的 resize、至多两个横向 pane、引导重播种、undo/redo 和官方 float。 | `apps/web/tests/sidebar-right.e2e.ts` 与 `ui-sidebar-right` specs 覆盖这些路径。第二个根或残留全局 margin 会产生重复 UI 或双重布局挤压。 |
| 底部工作台 | 独立 tab 与 split tree、可调高度、逐 Session 打开状态、首次打开 Terminal 选项，以及落入最后触达 bottom pane 的纯类型打开；内容打开落入可见的右侧工作台。 | 当前保留的 Better 测试只覆盖聚焦的 landing 与布局计算，没有完整组装路径。移除 Better 根之前必须实现 bottom slot。 |
| 持久化与恢复 | Session 隔离 topology、全局拖动宽度、bottom 状态、float geometry/z order、tab payload、pin、tombstone、窄屏加载折叠、畸形状态 fallback 和 `?dsh-sidebar-reset`。 | 迁移先原子写入新的官方 key，并保留每个 `dsh-sidebar:v1:*` key 原样用于回滚。重复 id、部分写入或静默 fallback 会破坏布局。 |
| 第三方 tab | 稳定 definition id/kind、有序添加入口、availability、icon、badge、create/dedupe、URL target、持久 JSON payload、settings、open/activate/async-close hook、unavailable fallback 与 HMR 恢复。 | 当前 Better 测试覆盖部分 lifecycle 与 Phone 注册路径；官方注册表测试覆盖 takeover 与 unavailable fallback。未知合成 kind 和 payload 必须往返保留。 |
| 文件与打开路径 | 保留官方引导、Files tree、`dsh-resource://file` Session/absolute owner、有界分页、1-based 行号导航、resource dedupe/revision，以及 Better path 输入/tree/search/reveal、write/rename/delete/upload/open-with 与合并/独立 editor 模式。 | `ui-chat` 已直接调用 `ctx.sidebarRight.openResource(fileAddress, { params: { line } })`。成员引用、文件夹 reveal、模型打开与任何旧 OS-open funnel 必须汇合且不能绕过 owner 或 fence 检查。 |
| 文件查看器 | Image、PDF、Markdown、沙箱 HTML、code 与 binary-download 查看器保留匹配与安全行为。Markdown 保留 CodeMirror 编辑、Mod-S、history、滚动交接、frontmatter 隐藏、本地图片、净化 raw HTML、Mermaid、ToC 和 selection-to-composer。 | 当前保留树缺少六类查看器的完整组装覆盖。Binary head sniff 必须先于 code catch-all；HTML 默认保持沙箱。 |
| 未保存编辑状态 | 保留 dirty 标记、保存状态、Mod-S，以及刷新磁盘已变文件前的确认。dirty draft 跨纯布局正文重挂载存续，并能在 candidate 切换前观测。 | 当前源码没有 tab-close 或 page-reload guard。本轮新增 close guard 属于新行为，必须按新行为说明和测试。 |
| Changes | 同一个 `git` page 保留两个 lens：Git repository truth 与 Session read/write/edit/error/running history。保留 worktree 选择、stage/unstage、commit、branch、history、破坏性确认、polling、badge、redaction、内联预览、fold 加载和 float/docked 扩展 diff。 | `git-selection` 与 persistence-read 测试只覆盖部分行为。用任一 lens 取代另一项都会静默丢功能；临时 diff 不得在恢复时复活过期内容。 |
| Tasks | 保留 subagent lineage 与 live line、打开 child 后 Tasks 不关闭，以及 main/descendant jobs、模型已读 output replay、可见性限定 polling 与双击 kill。 | `sidebar-subagent-activity.e2e.ts` 覆盖运行中 descendant owner。Side Chat 必须排除在 topology 外，重挂载必须释放 observation 而不停止 job。 |
| Side Chat | 保留 provisional 身份、首 prompt 发布、父上下文继承、独立模型选择、prompt/cancel/queue/permission、冷恢复、后代导航、关闭归档与本地关闭 tombstone。 | Side Chat 单元套件与 `sidechat-round.e2e.ts` 覆盖完整 Host 路径。官方 undo 不得复活已归档 owner，异步关闭必须在 Session 切换后仍指向原 Session。 |
| UI Terminal | 保留多实例上限、有效 shell 标题、xterm replay/input/resize、实时 theme/font、URL 激活、重连、依赖诊断、Session 切换 park，以及 close frame + HTTP fallback。 | 正文重挂载只会触发裸重连，绝不能解释为关闭；quota 统计右侧、底部、float 与 pin projection 中的全部 tab。 |
| 模型 Terminal 与 pin | 保留 opt-in create/list/send/read/wait-for/resize/signal/close 工具、live tab feed、workspace/global pin scope 和 home Session close/unpin 行为。 | 工具 owner 与 UI occurrence 生命周期不同。pinned tab 是对一个 home owner 的引用，绝不是复制 PTY owner。 |
| Browser | 多实例 Browser Workspace page 保留 Profile/target 身份、URL seed、1:1 对账、Session 重启恢复、过期 close retry、reveal 与链接/模型打开创建。没有 Browser Workspace 的组合保留 iframe browser、back/forward/reload、probe/external fallback、安全默认 sandbox、临时 unlock 与 loopback allowlist。 | `ui-workbench` specs 与 `browser-dock.e2e.ts` 覆盖产品 adapter。payload 丢失会丢 target；两个 close owner 会复制或重开 page。不能用删除 fallback 来替代保留它的三个安全设置。 |
| Phone | 单例 Phone page 保留 picker/device 原地切换、持久 device id/name、fleet badge、隐藏时暂停 playback、reconnect/remint 规则、控制输入和独立 Phone settings gate。 | Phone 有大量单元与 Desktop/device 验收。payload 丢失会让已占用 tab 返回 picker；renderer 重挂载不得停止 Host task。 |
| Member Question | Material chip 打开 receiver-owned 缓存副本，仅在该文件可见时折叠卡片，并从参与者 strip 恢复卡片，不读取同名 Workspace 文件。 | `member-question-receiving.e2e.ts` 覆盖组装路径。官方投影必须区分 active docked、已打开 bottom 与可见 float occurrence。 |
| 模型 `sidebar_open` | 工具默认不存在。启用后，file、folder 与 HTTP(S) target 在调用 Session 中打开；未激活 Session 排队，并且每个已接收请求仅消费一次。 | `agent-opens.client.spec.ts` 与 headless snapshot 覆盖队列/工具行为。delivery 必须使用官方 targeted navigator，并在确认前遵守 disabled type。 |
| 设置与 shell | 一个 settings document 驱动全部 tab/viewer enablement、plugin blob、打开默认、布局默认、auto-open、工具 gate、editor/Changes 选项、文件系统 fence、Terminal、HTML/Browser 安全、链接路由和 shell/titlebar compatibility。 | 保留 revision-guarded 写入与 legacy titlebar 转换。每一条可见 row 都必须改变官方行为；不保留假开关或第二份 settings state。 |
| Host provider | 文件/Git/media/HTML/upload、PTY、jobs、subagent、Side Chat、settings、Browser probe、external-open 与 agent-open transport 在官方 consumer 取代 Better UI consumer 时保留信任与所有权规则。 | UI owner 迁移不构成 transport 重写理由。保留的 private route 必须有一个正式 capability owner，并且在最后一个迁移 consumer 有等价能力前不能删除。 |

## 生命周期验收场景

| 场景 | 必需观测 |
|---|---|
| 跨表面 runtime | Terminal 经 right → bottom → float → right 移动、隐藏、跨 Session 切换和重挂载后仍保留一个 runtime 与 transcript；显式关闭只释放一次。 |
| 延迟关闭 | Session A 的 Side Chat close pending 时，切到 B 后不能误作用于 B。重复关闭 join 同一操作；veto 不改布局；retry 只 archive A 一次，然后移除其 record。 |
| 全部移除路径 | Close、replace、pane settle、reset、undo 与 redo 共用 coordinator。dirty cancel 保留内容与 topology。批量 admission 全部通过前不改状态；后续 release 失败只保留并报告失败 record。 |
| Runtime history | 关闭已发布 Side Chat 后，undo 不能重开已归档 child，redo 不能再次 archive。checkpoint 之后普通 file layout undo 仍可用。 |
| HMR 与未知 payload | 撤销第三方 definition 后显示 unavailable，但不关闭也不丢 nested JSON；相同 id 重注册后恢复且不重复创建 owner。 |
| 跨 Session pin | Workspace/global virtual view 只引用一个 home Terminal。Unpin 不关 PTY；从其他 Session close 只作用 home 一次；home 缺失时显示可恢复状态。 |
| 重复内容 | `revealIfOpened: false` 可以创建两个 file occurrence。Runtime identity 必须 dedupe 或显式共享 owner，关闭一个 view 绝不能释放仍被其他 view 使用的 owner。 |
| 从未渲染的 Session | 两个 `sidebar_open` 请求在 Session 首次渲染前定向，attach 后各到达一次，保留 line/target，并且切换 Session 时不改道。 |
| Legacy 转换 | 带 right/bottom split、float、未知 metadata、pin、tombstone 与重复 id 的 fixture 转为唯一官方 occurrence，并且不会重复转换。 |
| 存储失败 | 官方写入失败时不选择部分状态，也不改任何 legacy byte。retry 可成功；畸形新状态保持可恢复；reset 与 rollback 各有独立 scope。 |
| Diff 与 Browser 恢复 | 临时 diff 遵守选定 restore policy；Browser target/Profile 无重复地重绑，target close 失败时 record 保持可重试。 |
| Member 缓存资源 | Card folding 在 right、bottom、float、hide、tab change 与 line navigation 中跟随可见 receiver-owned cached resource，绝不跟随 Workspace twin。 |

## 设置迁移

当前 settings document 是 `dsh-better-sidebar`。实现可以保留这个 durable 名称，也可以一次迁到官方 namespace，但必须只暴露一份 live document 并保留每个显式已存值。Browser Workspace 产品 patch 继续强制它已记录的 Browser 设置。

| 现有字段与默认值 | 官方行为 |
|---|---|
| `openByDefault=false` | 新宽屏 Session 按值播种展开；新窄屏 Session 仍折叠；已迁 Session 可见性优先。 |
| `defaultWidthPercent=35` | 官方 frame 首次打开前按值播种宽度；已迁全局拖动宽度优先。 |
| `autoOpenSubagent=true` | 新 descendant 出现时聚焦 Tasks；宽屏打开，窄屏只准备而不遮住会话。 |
| `autoOpenJobs=true` | 对每个新观测到的 job id 应用同一规则。 |
| `agentTerminalTools=false` | 限定模型 Terminal 工具注册与官方 live-tab feed。 |
| `agentOpenTools=false` | 限定 `sidebar_open`；delivery 指向官方 resource 与 page。 |
| `terminalFontFamily=''`, `terminalFontSize=13` | 实时应用到官方 Terminal 正文而不重启 PTY；字号限制为 9–32。 |
| `bottomPanelAutoTerminal=true` | 每个 Session 首次展开 bottom 时尝试一个 Terminal，并遵守 enablement 与 quota。 |
| `interceptOpenPath=true` | 选择官方产品内文件打开；false 使用 Host OS opener。Turn-tail deliverable 复用同一选择且绝不双开。 |
| `editorExplorer=false` | 默认保持独立 file tab；true 使用合并 path/tree editor header。 |
| `changesDiffFloat=true` | 扩展 Git diff 作为官方 float 打开；false 在 docked pane 中打开。 |
| `workspaceFence=true` | 对文件 mutation、media、HTML 与 upload 保留 symlink-aware confinement；显式 false 保留带警告的全局路径行为。 |
| `terminalShell=''`, `terminalShellArgs=''` | 对设置变更后打开的 Terminal 覆盖 boot-time shell 默认。 |
| `titleBarScheme='auto'`, `titleBarPresetId=''` | 官方 frame 实现 auto、web、preset 与 custom 放置；未知 preset 可见失败或回到显式安全值。 |
| `customCss=''` | 一个官方 root style owner 仅在 custom 模式应用，并在模式变化或 HMR 时移除。 |
| `titleBarCompat=false`, `titleBarStripPx=40` | 没有 scheme 时 legacy true 转为 custom；custom inset 限制为 0–120 且只作用于官方 shell。不显示第二个 legacy switch。 |
| `htmlViewerNoSandbox=false`, `htmlViewerDefaultUnsafe=false` | 保留安全全局默认与逐新 occurrence 的 unsafe seed，并提供警告与逐 occurrence 恢复。 |
| `browserNoSandbox=false` | 控制受支持的 iframe Browser fallback，并保留 unsafe 警告。 |
| `browserInterceptLinks=true`, `browserInterceptHttp=true`, `browserInterceptHttps=false` | 按 master 与协议限定唯一官方 link-routing action；带修饰键点击放行。 |
| `browserAllowedLoopback=''` | iframe fallback 默认阻止 loopback，除非列出 host 或 host:port；GUI origin 单独受控。 |
| `tabsEnabled={}` | 缺失表示启用；false 隐藏新打开与派生 action，而既有 record 保持可渲染。未知 id 保留。 |
| `viewersEnabled={}` | 缺失表示启用；false 跳过该 viewer 并继续匹配。未知 id 保留。 |
| `pluginSettings={}` | JSON blob 继续按稳定官方 definition/viewer id 分桶，并跨 HMR 与迁移保留。 |

Host 配置保留 `readLimit`、`mediaLimit`、`uploadLimit`、`listLimit`、`terminalsPerSession`、`reconnectGraceMs`、`shell` 与 `shellArgs`。实现只选择一个 Terminal 上限来源，不再同时保留已配置 Host 上限和相互矛盾的 client 常量。

## 当前不存在的能力

当前没有通用的布局 import/export 命令。插件 catalog 复制安装命令，它不导入布局。一次性迁移增加版本化备份与转换，不虚构原本不存在的用户功能。

官方 topology 与 occurrence metadata 使用版本化浏览器本地持久化，框架 geometry 和可逆 history 仍只在进程内保留。后续迁移必须保留这一区分，并在 runtime owner 需要更多恢复数据时扩展 codec。

## 交付顺序

1. 以一个 foundation 变更交付官方 state codec、legacy 转换、page identity/payload、targeted Session navigator、close admission、read projection 与 extension lifecycle interface。
2. 增加官方 bottom slot、中心列 track、第二份 DockKit 表面和唯一官方 chrome owner。
3. 迁移 Files、六类 viewer、open-path 设置、Member Question 与 `sidebar_open` file/folder delivery；保留官方 `dsh-resource` 与行号导航。
4. 迁移 Changes 与 Tasks，不合并它们不同的数据含义。
5. 通过 occurrence-owned runtime 生命周期迁移 Side Chat、Terminal/tools/pin、Browser/fallback/link routing 和 Phone。
6. 删除 Better root、store、registry、layout persistence、全局 layout CSS 与每个 `ctx.betterSidebar` consumer。只保留仍经正式 capability 消费的 Host provider。
7. 运行单元约定、无效迁移 fixture、keyless 组装 snapshot、Browser E2E 和 commit-identical Desktop candidate。仅在不会丢失 prompt/draft、dirty editor、active Terminal、active Phone task 或 unresolved Browser work 时切换现有 userData。

## 相关决策

已交付的[右侧 Sidebar 停靠基础设施](../../implemented/feature/2026-09-04-right-sidebar-docking-infrastructure.zh.md)仍是 DockKit geometry 与呈现的权威，[Sidebar tab 类型与导航](../../implemented/architecture/2026-09-05-sidebar-tab-types-and-navigation.zh.md)仍是资源路由与 keyed 正文的权威。[Better Sidebar 源码刷新](../../implemented/feature/2026-09-06-better-sidebar-0-18-source-refresh.zh.md)在各项行为完成迁移前仍是能力基线。[Member Question 文件决策](../../implemented/architecture/2026-09-03-member-question-files-sidebar.zh.md)继续保留 receiver-owned 文件 identity。本提案扩展这些决策，不取代其独立依据。

## 考虑过的替代方案

保留 Better 作为 UI owner 并把官方 resource reader 搬进去，初期可以保留更多代码，但会放弃官方 extension model、DockKit history、resource ownership 和已指定的未来基础。用 preference 保留两块面板仍会留下两个 layout 与 state owner，也无法保证某个 consumer 打开哪一块表面。

把官方操作镜像到 Better state 的 compatibility service 可以减少即时 consumer 改动，但会产生两套 registry 与两份 persistence document。HMR、close admission 和 inactive-Session open 仍会跨 owner 竞态。迁移应让每个 consumer 改用官方 interface，并把未知 record 作为 unavailable 官方 tab 保留。

在移动 UI 前重写每个 Better Host transport 会扩大范围，却没有证明用户可见性质。本提案保留正常工作的 transport，直到等价正式 provider 准备好，同时禁止重复 provider，并保留 trust、fence、owner 与 cleanup 规则。

## 验收标准

- 构建后的 Web 与 Desktop graph 只渲染一个官方 right/bottom workbench owner；源码与运行时检查找不到 Better 直接 React root、Better layout store、Better 全局 layout push 或第二套 tab/viewer registry。
- 合成 legacy fixture 可以转换 right、bottom、float、未知 plugin、JSON payload、dirty editor、Browser target/Profile、Phone device、Side Chat、Terminal pin 与 tombstone 状态。官方 document 在选择前写好，而且每个 legacy key 原样保留用于回滚。
- split、drag、float、fullscreen、Session switch、renderer remount 与 tab-type HMR 都不会 archive Side Chat、kill PTY、关闭 Browser Workspace 或停止 Phone ownership。真正关闭仅运行一次已准入 cleanup，而且作用于原 Session。
- 引导、Files tree、有界 text paging、line reveal、六类 preview、富 editor、两个 Changes lens、Tasks/jobs、Side Chat cold/model 路径、Terminal/tool/pin 路径、Browser Workspace 与 iframe fallback、Phone、Member Question、turn-tail、普通文件打开、外链路由和 `sidebar_open` 均通过各自 keyless 产品路径。
- 每个现有 settings field 都具备上表行为，只拥有一个 durable value，而且仅在改变受支持行为时显示可见 row。显式 false 与未知 plugin key 在迁移后保留。
- 最终 candidate 从精确 integration commit 构建。只有当操作 gate 确认没有 running prompt、composer draft、dirty editor、active Terminal、active Phone task 或 unresolved Browser work 后，才在原地备份并转换现有 userData。

## 风险

状态 foundation 横跨 layout、identity、persistence 与 lifecycle。把这些约定拆给独立实现会得到能恢复 record、却缺少恢复 owner 所需数据的布局。因此 foundation 必须先作为一个一致变更交付，feature migration 才能从它分支。

官方 undo 让布局关闭可逆，而 Side Chat archive、PTY kill 与 Browser close 是外部 owner action。释放外部 owner 的 close 不能作为普通可逆 DockKit operation，除非重新打开有显式 recovery action。

Better extension service 在仓库之外存在第三方 consumer。直接移除而没有 source-compatible adapter 会破坏它们，但把它作为第二 registry 保留又违反 owner 决策。官方 extension contract 与迁移指南必须足以迁移这些插件，无法表达的 descriptor 字段必须在过渡期 fail loud。

未沙箱化 HTML 与 iframe Browser fallback 可以访问敏感 GUI 状态。settings migration、默认值和逐 occurrence unsafe state 需要显式 invalid/default fixture；缺失值必须保持安全。

最终原地转换会触及同时承载长寿命 runtime work 的 userData。合成转换成功不构成中断 live work 的授权。即使全部代码测试通过，操作 gate 与 rollback backup 仍然必须执行。
