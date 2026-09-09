# Agent Note: 围绕内置 CLIProxyAPI 核心构建 Desktop 账号池

Status: proposed

[English](2026-09-09-built-in-cliproxyapi-account-pool.md) | 中文

## Problem

DeepSeek Gestalt 当前提供仅限 Desktop 的 Sub2API 组件，用户需要在安装应用后另行下载并启用。Desktop Host 会安装一个树外 Harness 插件和运行时包、重启 Web Host，并在 Settings 中渲染 sidecar 的管理工作区。用户添加账号前，这一设计已经引入独立插件发布、PostgreSQL 与 Redis、安装状态机和外部 UI 嵌入。

替代方案需要让账号池成为 Desktop Bundle 的组成部分。它必须监督一个本机 CLIProxyAPI 核心，提供 Gestalt 自有的账号与额度体验，并发布一个可用的模型提供方，同时不向 renderer 暴露管理凭据。产品还需要与上游核心保持可追溯的源码关系，并承载一项 Gestalt GLM 订阅扩展；该扩展的来源与许可仍在调查。

## Proposal

DeepSeek Gestalt 将 CLIProxyAPI 作为内置 Desktop 组件交付。Desktop Bundle 将包含基于 [`gestaltrun/CLIProxyAPI`](https://github.com/gestaltrun/CLIProxyAPI) 精确提交构建的平台二进制；该 GitHub fork 的 parent 与 source 保持为 [`router-for-me/CLIProxyAPI`](https://github.com/router-for-me/CLIProxyAPI)。Harness 仓库将用 Git submodule 记录核心钉住点。应用启动时不会下载、安装或启用核心，Settings 也不会保留 Offer 卡。

官方 manager UI 将迁入本仓库的第一方 client 包，之后作为 Gestalt 源码独立演化。它将使用现有 Desktop Settings 外壳、slot、组件、locale 与主题。它不会成为 UI submodule、运行时下载、iframe 或远程管理页面。原型结论与体验路线将另行确定最终展示；本提案固定所有权和信任边界，而不固定视觉布局。

替代方案从空白 CLIProxyAPI home 开始。它不会读取、转换、导入或兼容 Sub2API 账号、凭据、统计、额度历史、Composite 分组、路由或数据格式。删除旧用户数据是独立的破坏性操作，本提案不隐含该操作。

## Package and source topology

CLIProxyAPI 源码钉住点将作为 `pnpm-workspace.yaml` 与 TypeScript 工程引用之外的目录子项。构建或检查核心的 CI 任务将递归初始化 submodule，并验证 gitlink 指向 `gestaltrun/CLIProxyAPI` 中存在的提交。不需要核心源码的任务可以保留未初始化子项。

Gestalt 自有 TypeScript 代码将留在 Harness 仓库中，包括 Desktop 进程监督器、窄管理网关、LLM 适配器集成、renderer 投影与原生 Settings UI。Go fork 将包含上游 CLIProxyAPI 与已接受的 GLM 订阅实现。Host 或 renderer 包都不会通过 workspace 路径导入 Go 源码。

fork 更新将使用 `gestaltrun/CLIProxyAPI` 中可评审的分支与 PR。更新会标明上游基线，保留或明确修订 Gestalt GLM delta，并在 Harness gitlink 移动前通过 fork 门禁。移动 Harness 钉住点将是独立评审变更，并附带 Desktop 打包与运行时证据。两个仓库都不会浮动跟随上游 `main` 或 latest Release tag。

现有树外插件目录提案对独立发布的 Harness 插件仍有价值，但本提案会取代其中针对该账号池的 Sub2API 拓扑。已实现的 [Sub2API Offer 卡决策](../../implemented/architecture/2026-08-28-sub2api-offer-card-installer.zh.md)在替代方案交付前仍描述当前产品；实现阶段将更新或合并该记录，而不是提前把它改写成未交付事实。

## Runtime ownership and lifecycle

Desktop Host 将为每个隔离 Desktop 实例拥有一个 CLIProxyAPI 进程。一个接口较小的监督器将隐藏二进制选择、配置生成、loopback 寻址、进程 spawn、ready 状态、崩溃恢复、关闭与诊断身份。Renderer 与 Web Host 不会各自 spawn 或发现该进程。

该进程将只绑定 loopback 上的实例级动态端口。具体分配机制取决于对核心命令行能力的验证：监督器可以要求核心使用端口零，也可以在 spawn 前安全预留 loopback 端口且不提前发布。最终机制必须避免产品固定端口，并在无法建立所有权时明确失败。

Desktop 只会在核心以预期二进制和配置身份报告 ready 后开放账号池。启动失败时，Desktop 其余部分仍可用，账号池展示可操作的失败状态。异常退出将由同一监督器执行有界崩溃恢复；重复失败后停止 respawn，保留诊断信息，且不声称提供方可用。Desktop 关闭会取消恢复，仅终止该实例拥有的进程树，并等待端口与进程身份消失。

Desktop Bundle 将携带每个受支持打包目标的二进制。首批要求为 macOS arm64、macOS x64 与 Windows x64；增加其他目标需要明确产品决定和对应构建车道。打包会拒绝缺失二进制、架构不匹配，或记录的源码身份与 submodule 钉住点不一致的二进制。首次启动不需要 Go 工具链、PostgreSQL、Redis 或核心下载。

## Management authority and renderer projection

Desktop Host 将为 management 与 inference 创建并保留相互独立的 CLIProxyAPI authority。Management secret 只供 Host 管理网关使用。Inference API key 只供需要调用 OpenAI-compatible 推理端点的本机 LLM 集成使用。两者都不会进入 renderer props、浏览器存储、Session 日志、截图、诊断或保留产物。

管理网关只暴露产品操作：读取已脱敏账号目录、开始受支持的登录、观察登录状态、取消 OAuth session、执行受支持的 auth-file 变更，以及在存在已验证 provider 探测时请求刷新额度。它不会向 renderer 暴露 CLIProxyAPI 的通用管理请求能力。登录 URL 与设备授权数据只会以 Desktop Host 或 UI 完成该 provider 已验证流程所需的最小形式返回。

一份由 Host 拥有的不可变 snapshot 将投影组件健康状态、已脱敏账号身份、登录操作、额度观测、新鲜度与可操作失败。外部变化只在操作提交后发布。组件通过 client slot 注入机制消费 snapshot，并通过窄回调发送意图；组件不会轮询 CLIProxyAPI、镜像 secret 或成为第二个账号 authority。

账号卡将支持已接受的交互规则：页面级控件统一切换所有卡片的管理面与额度面，同时每张卡保留独立翻面动作。全局切换会清除单卡例外，并为整个网格建立可预测的统一面；之后的单卡翻面会产生可见的局部例外，直到下次全局切换。原型可以改变控件位置、密度和动效，但不能删除任一操作。

## Provider registration

集成将为 CLIProxyAPI 发布一个稳定的 DSH provider route，而不是按账号来源创建多个 route 或保留替代性的 Composite 概念。Kimi、Codex、Anthropic、Antigravity、xAI 与拟议 GLM 订阅都是该 route 背后的账号池来源。CLIProxyAPI 负责为模型请求选择符合条件的账号。

适配器将从本机核心的 `/v1/models` 响应取得模型目录，并通过 `ctx.llm` 原子注册、替换或撤回这一条 route。提供方拓扑通知将让 Models 与 Composer 消费方重新读取现有提供方和模型目录。空账号池、核心不可用，或无法证明存在可用模型的目录，都不会发布虚假的可用 route。最终 route id 与冲突策略必须在实现前固定；当前推荐稳定 id `cliproxyapi`，且不得接管无关的用户自有 route。

Management 与 inference 即使指向同一个本机进程，也保持独立 authority。适配器取得有效端点和 key 后，普通 inference 不应依赖 UI 账号变更操作；inference 消费方也不能因拥有请求配置而获得管理操作。

## Quota observations

CLIProxyAPI 当前没有统一的主动额度端点。部分账号类型暴露被动 rate-limit header，而 provider 专用主动检查可能需要 management API 的请求能力。Host 只会归一化已验证观测，并保留来源与采集时间。

额度值将区分 known、partial、probing、stale、unknown、unsupported 与 failed 状态。Unknown 或 unsupported 数据绝不会渲染为零、满额或虚构余额。只有来源提供所需分子与分母时，额度线才可以展示剩余容量。只有来源提供足够信息确定窗口时长和重置位置时，才可以计算叠加的时间窗口百分比；只有 reset timestamp 而没有时长时，不生成时间百分比。

对于 GLM Coding Plan，inference 与 `/models` 使用 `Authorization: Bearer <key>`，额度请求则在 `Authorization` 中使用裸 key。个人额度读取 `{open.bigmodel.cn|api.z.ai}/api/monitor/usage/quota/limit`。团队额度增加 `?type=2` 与 `bigmodel-organization` header；账号填写项目时再增加 `bigmodel-project`。401 或 403 会报告凭据失败，但不会覆盖最后一份有效额度 snapshot。

GLM 额度优先采用 `TOKENS_LIMIT`，只有完全没有 token limit 时才使用 `CREDIT_LIMIT`。Unit `3` 表示五小时窗口，unit `6` 表示每周窗口。投影保留 `used_percent`、`reset_at` 与 `updated_at`；它依据已验证的使用百分比推导剩余额度，并且仅在窗口时长与重置位置成立时绘制时间对比。订阅 base 的 `/models` 响应是 GLM 模型可用性的权威来源，因此集成不会虚构静态 GLM 目录。

其余 provider 探测矩阵、刷新节奏、缓存寿命、rate limit 与副作用必须在提案冻结前记录。UI 原型可以为各状态使用明确标注的 fixture，但不能暗示上游存在某个 fixture 字段。

## GLM subscription status

候选 GLM Coding Plan 行为来自官方 `Wei-Shaw/sub2api` 源码的提交 `98d86915becae9fe9491a91ffc6defd5235c8d2b`。它使用用户提供的订阅数据面 API key，并通过 `account_mode=coding` 选择 Coding Plan 专用端点与额度语义。它没有 OAuth token provider、浏览器登录或 refresh-token 流程。

因此 Gestalt UI 将提供专用 GLM Coding Plan key 入口，而不会把 GLM 加入五个 OAuth 登录动作。该入口会明确选择区域（中国或国际）与账号范围（个人或团队），不会从 key 猜测，也不会静默降级成按量付费。团队账号还必须填写组织 id，并可选填写项目 id。Host 将通过拥有凭据的路径存储这些值，只把产生的 authority 交给核心。除非经过验证的协议约束要求独立 route，GLM 将保持为单一 CLIProxyAPI provider 背后的账号来源。其 OpenAI-compatible effort 归一化把普通 `low`、`medium`、`high` 请求映射到 GLM `high`，把 `xhigh` 或 `max` 映射到 GLM `max`；精确模型 `glm-5.3` 会保留显式 `low`。Anthropic-compatible GLM 5.3 请求同样保留对应的 `low`、`high` 与 `max` 档位，而不会透传上游不支持的拼写。

产品推荐支持四种官方 Coding Plan 组合：中国个人、中国团队、国际个人与国际团队。已验证的中国 Chat Completions base 是 `https://open.bigmodel.cn/api/coding/paas/v4`；普通 `https://open.bigmodel.cn/api/paas/v4` 是不同的按量付费产品，不能替代。已验证的中国 Anthropic-compatible base 是 `https://open.bigmodel.cn/api/anthropic`。国际额度使用 `api.z.ai` origin，但准确的国际 inference 与 Anthropic-compatible base 仍是启用该区域前必须记录的协议事实。缺少区域端点会阻止该组合，而不是把它重定向到中国或按量付费。

来源当前识别为 LGPL-3.0，目标核心使用 MIT。推荐实现把官方 Sub2API 行为作为协议事实，并基于 CLIProxyAPI 现有 MIT executor、translator、auth 与 model 扩展点独立实现 Coding Plan；不复制 Sub2API 源代码、注释、测试或表达结构。在该路径下，GLM 仍是必需产品范围。

静态移植 Go 实现仍是获许可的备选，而不是放弃该功能。它会要求分发满足适用的 Combined Work 重新组合与伴随材料义务，并给核心 fork 增加混合许可维护负担。完整字段与许可报告必须在任一路径冻结前核实准确许可声明及义务；本提案不推断来源授权是 LGPL-3.0-only 还是 LGPL-3.0-or-later。仓库 README 与 LICENSE 文本只能陈述已核实的授权和所选实现承担的义务。

## Alternatives considered

**保留可下载 Offer 卡与树外 sidecar 插件。** 未采用，因为用户选择了内置 Desktop 能力。单 Go 核心不再值得保留独立启用下载、Web profile 修改，或携带 PostgreSQL 与 Redis 的插件发布列车。

**通过 iframe 嵌入官方 manager UI，或把它保留为 UI submodule。** 未采用，因为账号池体验必须使用 Gestalt 组件，并与核心更新独立演化。嵌入 manager 还会把宽泛管理客户端放进 renderer，破坏 Host authority。

**把 CLIProxyAPI 源码直接 vendor 进 Harness 仓库。** 未采用，因为 submodule 在保留 fork 评审与上游关系的同时记录精确外部源码提交。复制 Go 源码树会模糊上游同步，并把它的构建图混入 TypeScript workspace。

**把核心集成保留在另一个 Gestalt sidecar 仓库。** 当前设计未采用，因为进程生命周期、管理投影、提供方注册与原生 UI 共同组成一个 Desktop 能力，而外部可执行文件已经拥有自己的 fork。第二个 Gestalt 仓库会增加协议与发布边界，却没有独立演化的消费方。

**按账号厂商注册多个 DSH provider，或保留 Composite。** 未采用，因为 CLIProxyAPI 暴露一个推理网关和一个模型目录。账号来源是核心内部的路由输入，不是 Harness 中独立的适配器 authority。

**向 browser client 暴露通用管理 API。** 未采用，因为这会把 renderer 从产品 UI 扩大成任意核心操作的管理员，并让 management 凭据进入浏览器代码可达范围。

**把 LGPL Go 实现静态移植进 MIT fork。** 保留为成本更高的备选。该路径可以满足 GLM 需求，但发布必须承担适用的 Combined Work 重新组合与伴随材料义务，每次上游同步也要维护混合许可边界。若完整字段报告证明可行，则优先依据协议事实独立实现。

**为每个 provider 合成一个统一额度百分比。** 未采用，因为上游证据并不一致。统一数字会抹掉缺失字段，并误报未知容量或时间窗口。

## Acceptance criteria

- 全新递归 checkout 会把 Harness gitlink 解析为 `gestaltrun/CLIProxyAPI` 中存在的提交，且该 fork 的 GitHub parent 与 source 是 `router-for-me/CLIProxyAPI`；普通 TypeScript workspace 发现不会包含 Go 子项。
- 每个受支持 Desktop 包含从记录钉住点构建的二进制，能从全新隔离 home 启动且不需要 Go 工具链、数据库服务或核心下载，并拒绝缺失、不匹配或无法识别的二进制。
- 一个 Desktop 实例拥有一个 loopback CLIProxyAPI 进程和动态端口；ready 状态、有界崩溃恢复、关闭与清理均可观察，且一个实例绝不终止另一实例的进程。
- Renderer 不会收到 management secret、inference API key、auth-file secret 或原始管理逃生口；凭据类值不会进入日志、Session 数据、截图与保留产物。
- 第一方 Settings UI 会渲染已接受的全局管理/额度切换与单卡翻面、五个已验证 OAuth 登录入口，以及带明确中国/国际和个人/团队选择的独立 GLM Coding Plan key 入口。它会渲染真实授权状态与额度 unknown、partial、stale 和 failure 状态，且不使用 iframe 或运行时 UI 下载。
- LLM 集成会根据实时本机模型目录发布一条 provider route，在核心无法服务模型时撤回或标为不可用，不接管用户自有冲突 route，并能完成一项单独授权的真实模型请求。
- 替代路径不会读取或转换 Sub2API 数据。若之后授权删除旧文件，该行为会作为独立操作验证。
- fork 同步会保留可审计的上游基线与已接受 Gestalt delta；Harness 钉住点仅在 fork、打包、确定性 UI 和必需原生证据通过后移动。
- 冻结 UI 稿与体验路线覆盖空状态、登录取消/成功/失败、全局切换、单卡翻面、额度新鲜度差异、provider 目录变化、核心故障与重启恢复。

## Risks

内置二进制会增大 Desktop Bundle，并让每个受支持平台成为核心构建矩阵的一部分。任一目标无法从钉住点复现时，打包车道必须在发布前失败。

上游 management 端点和 auth-file 字段可能比 Gestalt UI 变化更快。窄 Host 网关会限制受影响代码，但每次 fork 更新仍需要协议与脱敏评审。

Fork 承载的 GLM 实现会增加上游同步冲突。独立实现会减少混合许可负担，但仍要求准确协议事实和洁净实现纪律；静态移植仍可选，只是需要承担核实后的 LGPL 分发义务。最终字段与许可报告是冻结输入，不是把 GLM 移出范围的理由。

Provider 专用额度探测可能消耗上游请求、触发 rate limit，或只提供近似数据。在调查固定矩阵与节奏前，产品必须优先展示明确 unknown，而不是激进刷新。

原生原型与最终验收会先尽力使用合法可调用的 Codex computer-use 会话。已经观察到 DSH 注册，但 delegated native 调用当前被固定 sandbox 拒绝，且没有可调用的 Codex task connector。若连接 owner 最终确认不存在合法 Codex 路径，用户授权把真实隔离 Electron 自动化作为后备证据车道；owner 必须记录该路线变更及其限制，原型 writer 不得自行切换 driver。该可用性判断阻塞原生走查，不阻塞本提案评审或 fixture 原型工作。
