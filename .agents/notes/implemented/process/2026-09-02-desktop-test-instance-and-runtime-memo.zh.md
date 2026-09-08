# Agent Note: Desktop 测试实例与运行时备忘

Status: implemented

[English](2026-09-02-desktop-test-instance-and-runtime-memo.md) | 中文

## Problem

由智能体启动的 Desktop Electron 实例和 ego-lite Task Space 没有持久的本机清单。用户要求启动测试程序时，往往会再开一个可见窗口，而同一目标留下的 Host、PostgreSQL、sidecar、临时 home 和 SysV 共享内存仍在。浏览器工作在后续轮次里也可能新建 DSH Task Space，即使第一个 Space 还在。原生 GUI 检查还会在没有证明当前 computer-use 集成能捕获和操控隐藏窗口时，直接假定无头 Electron 可观察。这些实例发起模型调用时，也没有规则要求继承正式程序已存储的 provider 目录。`pnpm gestalt:dev` 还要求一份 operated Platform 配置且不会默认提供，智能体因此会停下来等人类登录，而不是按场景选择 fixture 或生成的生产身份。

## Decision

[`dsh-desktop-test-instance`](../../../skills/dsh-desktop-test-instance/SKILL.md) 负责由智能体启动的 Desktop 测试 Electron 生命周期。一个用户目标只对应一套实例和一个活跃桌面输入 owner。原生产品 GUI 检查由 Codex computer-use 会话在实际隔离 Electron 路线上执行，依次优先使用 [macOS 后台 computer use](https://learn.chatgpt.com/docs/computer-use#when-to-use-computer-use)、已有的无头或虚拟显示路线、以及前台有窗口控制；[Windows computer use 仍在前台运行](https://learn.chatgpt.com/docs/computer-use#windows-foreground-use)。每种模式都必须先证明能截取精确应用、发送用户级输入并观察结果 UI；后台模式还必须保持用户的前台应用不变。无头渲染、进程存在、直接 DOM 或 Electron IPC 脚本以及独立 Web 界面都不能证明原生路线。缺少 bridge 只表示该模式不适用于当前场景；新建 bridge 需要已接受的基础设施范围。智能体完整走通路线后才开始人工评审。智能体先停止备忘中的实例，再停止该目标下其他仍存活的测试进程，然后才启动替换实例，并按场景选择 operated Platform 配置：除非本轮必须连接真实 Platform，或 diff 改了 Platform 身份、callback、Relay 或 companion-attachment 字段，否则使用 `apps/desktop/tests/fixtures/operated-platform.json`。无密钥探测不复制模型配置；经用户明确授权、需要调用模型的实例只从正式 DSH Home 盲拷 `settings.yaml` 和 `.credentials.yaml`，并且不得编造 provider 模型。

`.agents/local/runtime-memo.json` 是该 checkout 的 gitignore 本机清单。Desktop 在其中记录精确应用路径、revision、模式、输入 owner、PID、端口和临时路径；[`ego-browser`](../../../skills/ego-browser/SKILL.md) 在同一文件中记录当前 DSH Task Space id，并一直复用该 id，直到用户要求新 Space、目标改变，或已记录的 Space 不存在。第一个 Space 仍在时再创建第二个 DSH Space，本轮失败。

[`orchestrate-dsh-delivery`](../../../skills/orchestrate-dsh-delivery/SKILL.md) 在 GUI smoke、还原度对照、专用验收走法和浏览器工作上指向这两个技能。单元、协议、snapshot 和 `pnpm --dir apps/desktop test:e2e-sub2api` 之类 Electron 自动化通道保留各自的驱动与 teardown。它们补充 Codex computer-use 路线，不能替代原生 GUI 证据。[还原度与验收路线决策](2026-09-03-ui-fidelity-and-acceptance-route.zh.md)拥有专用验证会话和人工交接。

## Alternatives considered

**把启动和清理步骤写进根 `AGENTS.md`。** 这些步骤只在 Desktop 或浏览器工作中触发。作为常驻指令会在每一轮消耗上下文。

**只把进程 id 记在对话里。** 会话会压缩、分叉和重启。gitignore 备忘才是后续轮次无需从聊天重建 PID 的清单。

**用命令行子串匹配杀掉残留进程。** 匹配清理脚本自身或其他项目 PostgreSQL 的模式不是精确归属。已记录的 PID 和路径才是停止列表。

**让有窗口和无头实例共用用户的正式 `DSH_HOME`。** 这会把测试状态混进已安装产品 home，并可能弄脏用户的 provider 目录。临时拷贝才是隔离。

**不证明 computer-use 能访问就强制无头模式。** Electron 可以在离屏或虚拟显示环境渲染，但不一定向当前 Codex 集成提供截图、输入和结果闭环。模式选择依据已证明的控制能力，不依据启动参数。

**把 DOM 或 Electron IPC 脚本检查当作原生产品验收。** 这些检查保留确定性 CI 价值，但绕过了本次验收要证明的用户级路线。

**每次智能体检查都在前台启动。** 前台控制能覆盖原生 UI，但在后台或已证明的无头控制可以走同一路线时，会无谓打扰用户。

**每次启动 Desktop 都等用户要求真实 Platform 登录。** `gestalt:dev` 需要的是配置，不是人类决策。场景已经能判断本轮是否涉及真实 Platform。

**把 `gestalt:dev` 写死成测试 fixture。** 发布打包和真实 Platform 运行需要生成的生产身份。只有场景不触及 Platform 时，fixture 才是默认值。

**每次 heredoc 开始都新建 ego Task Space。** Ego 运行时会在 heredoc 之间丢失进程内绑定，但 Task Space 本身可以持久存在。备忘加上 `listTaskSpaces()` 才是复用检查。

## Consequences

智能体可以替换测试 Electron，而不在机器上留下第二套窗口、Host 或数据库；浏览器工作会停在该目标的一个 DSH Space 里。原生验收优先后台控制，只有留下能力证据和 fallback 原因后才采用无头或前台有窗口执行。这些实例的模型调用使用已安装的 provider 目录，而不是夹具默认值。

备忘是本机的，也可能过期；缺失的进程会删除对应记录，而不是阻止下一次启动。人工评审要等待智能体通过所选 computer-use 模式走完整条路线。Electron 自动化通道仍负责自己的残留进程，也是必要的 CI 证据。真实 Platform 运行仍需要 Environment 字段才能调用 `write-operated-platform-config.mjs`；fixture 不能代替该身份。
