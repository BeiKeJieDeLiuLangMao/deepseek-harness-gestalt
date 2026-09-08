# Agent Note: UI 还原度闸门与专用验收路线

Status: implemented

[English](2026-09-03-ui-fidelity-and-acceptance-route.md) | 中文

## 问题

GUI 规格可以链上冻结的 prototype 稿，实现仍然可以长成人类认不出来的样子。票 writer 证明一条 smoke 路径。代码评审把规格当散文读。两个会话都不把正在跑的产品对照稿看，于是布局、chrome 和主操作会漂到 headed 评审才被发现。

同一协调会话随后给用户开 headed 实例。所需数据、Platform 配置和残留进程仍是 writer 的遗留物。人类在被要求整段验收的功能上，卡在第一步。

## 决策

GUI 规格在派发实现前要有两件规划物：[冻结高保真稿](2026-09-02-fused-ui-prototype-variants.zh.md)（[`to-spec`](../../../skills/to-spec/SKILL.md) 已要求），以及一条**体验路线**。路线是范围内每条用户故事的有序走法。每一步写明起始状态、动作、必须与稿对应的屏幕，以及可观察结果。范围外的故事不进路线。

全部 GUI 票落到规格分支之后，[交付编排](../../../skills/orchestrate-dsh-delivery/SKILL.md)派发**带 computer use 的 Codex 还原度会话**，而不是根会话。该会话通过 [`dsh-desktop-test-instance`](../../../skills/dsh-desktop-test-instance/SKILL.md) 启动一个隔离 Desktop，依次优先采用后台控制、已证明的无头路线和前台有窗口控制，并通过用户级输入打开路线上的每一屏。它把实际 Electron 路线对照冻结稿（`gif-assets` 上的 PNG/GIF 和 throwaway prototype 分支）。独立 Web 页面、DOM 脚本或直接 Electron IPC 不能作为原生还原度证据。标准是同一套 chrome、组件库、信息层级和主操作。不要求像素级同一。不匹配是给所属票 writer 的发现。人工评审等到这些发现清掉。

然后派发**带 computer use 的专用 Codex 验收环境会话**。该会话不是根会话，也不是票 writer。它停掉该目标的残留实例，启动一个全新的隔离 Desktop，按场景选择 fixture 或 live Platform，种好路线需要的数据，并通过用户级输入走完实际 Electron 路线。它采用同样的最少打扰模式顺序，记录已证明的控制路径与 fallback 原因，并在重建、诊断、重新走查和清理期间保持为唯一桌面输入 owner。卡住的步骤是 writer 修复或报告的人工阻塞。只有智能体完整走通才开始用户交接。该会话随后把路线、应用或窗口、以及起始状态交给用户。

[根会话只做编排](2026-09-03-root-session-orchestrates-only.zh.md)仍然禁止协调会话实现、启动验收实例或走路线。

## 曾考虑的替代方案

**把代码评审的 Spec 轴当作视觉还原度。** Spec 评审读 issue。它不会把产品和稿并排打开，因此 chrome 和层级可以通过，看起来却像另一页。

**让每张票的 writer 只证明自己的切片。** 切片 smoke 看不到人类被要求走完的整段。验收会话拥有整条路线。

**让根会话准备验收实例。** 那就是残留进程失败。专用会话通过运行时备忘拥有该目标的 Desktop 清单和 computer-use 输入。

**把 Electron 脚本或 Web 检查当作验收走法。** 这些检查保留确定性证据，但在绕过用户级输入或 Electron 专属行为时，不能证明实际原生路线。

**要求像素级截图 diff。** 宿主 chrome、字体栅格和窗口大小会动。对齐产品语言和主操作能抓住用户报告的漂移；像素同一抓不住。

## 后果

没有稿指针和体验路线的 GUI 规格不能交付。实现不能带着未对照的 UI 或卡住的走法进入人工评审。用户拿到的是 Codex 会话已经通过实际产品路线完成的状态。

还原度对照和验收走法各自增加一项专用 Codex 验证职责，但稳定的 owner 会话可以承接多轮修复，不必持续增加会话。后台控制在得到证明时减少打扰；无头和前台 fallback 各自需要证据。缺少稿、路线、computer-use 路径或已完成步骤会停止交付，而不是让用户去调试环境。
