# Agent Note: Desktop 关键路径 Electron 验收

Status: implemented

[English](2026-09-08-desktop-critical-path-electron-acceptance.md) | 中文

## 问题

聚焦包测试与浏览器场景分别确认了 Session、模型选择、Side Chat 与归档行为。它们不能证明已交付的 Electron main 进程、Web Host、preload 与 IPC 路径、生产 Client 组合、Session 持久化和可见 renderer 能在完整进程重启后保留同一个 Side Chat 已选择的路由与权限。

## 决策

`pnpm --dir apps/desktop test:e2e-critical-path-electron` 是 Member Questions 之外普通 Desktop 路径的源码验收。runner 要求 worktree 干净，再从当前提交只构建一次 Host library、Client library、Web 与 Desktop main。它创建一个私有 `DSH_HOME`、Electron `userData` 和 git Workspace，然后依次以 create、restore 与 archive 三个 WebdriverIO 阶段启动同一份已构建 Desktop。每次运行都会在配置的产物基目录下原子创建一个独占子目录。只有三个阶段结束后的 HEAD 仍等于已记录提交且 worktree 保持干净，最终 manifest（元数据清单）才能通过。

create 阶段通过已交付的浏览目录提供方连接 Workspace，经 renderer 提示主 Session，打开一个尚未发布的 Side Chat，并在一个有界稳定窗口内持续确认首次 Side Chat 提示词前主 Session 列表和 Tasks tree 都没有新增行且不存在 child JSONL。保持该 tab 打开时，Models 页面声明一个 `openai-completions` 提供方与 model。Side Chat 选择该模型、发送第一条提示词、切换到 Read Only，并核对可见回答与生成的原始 JSONL。

restore 阶段复用完全相同的 home、Workspace 和 `userData`。它要求只恢复一个具有相同模型与权限的 Side Chat tab，记录此前 child-owned event cut 与可见回答数，再发送另一条提示词。该阶段要求新增且仅新增一条可见回答，并要求该 cut 之后按序出现一条 child-owned user message、model request、assistant message 与持久 turn end。它会证明主 Session 标题栏显示这个确切的持久 child，再经界面关闭该 tab。归档投影完成后，该阶段会等待 tab 与主标题栏 child row 一起消失。archive 阶段再次启动同一状态，确认 tab 保持关闭、child id 位于 Workspace domain 的持久归档集合中，并确认 child JSONL 仍携带两轮自有 turn、两条模型 B request header 与 Read Only event。

环回 OpenAI-compatible HTTP listener 是唯一的外部服务替代。它按请求模型返回回答，只保留阶段、URL 路径与 model id。测试 profile 把自动标题生成路由到另一个已交付的 DeepSeek 模型，使 audit 无需保留提示词正文也能区分该请求。runner 不读取用户正常的 `DSH_HOME`；其测试 profile 只被仅限源码的 Desktop E2E gate 接受。WDIO 会记录每个实际观察到的测试结果，不会用计划阶段数替代执行。进程证据会在测试正文前记录 Electron，在首次观察到 Web Host 启动记录的 poll 内记录 Host，并在每个阶段持续采样二者的精确启动身份及其后代。teardown 只向仍匹配的身份发送信号，并把已复用 PID 当作原属主已退出。只有 model listener 与所有已捕获进程身份都停止后，runner 才会删除 scratch；否则会保留失败运行的 scratch，并隐藏产物分享路径。生产 Session JSONL 由 JSONL 持久化实现解码；runner 自有的跨阶段记录只解析已声明字段并重建 branded Session id。专用 build-mode typecheck 继承源码 paths，并引用 runner 使用的三个 Host-face workspace project，因此干净树会先构建并检查这些源码，再检查验收文件。

## 考虑过的替代方案

**扩展三安装 Project Members runner。** 否决：本路径只有一个安装，不包含 Account、Project Membership、Relay 或 Companion 行为。合并两者会让路由回归依赖无关的多账号基础设施。

**从测试调用 Host controller 或安装进程内 Agent fixture（测试前置数据）。** 否决：这样会绕过本通道要证明的 Desktop main 入口、Web Host 进程、Remote transport、Session controller、preload 与 IPC 组合及可见用户交互。

**只 reload 一次 renderer 而不重启 Electron。** 否决：页面 reload 无法证明所选路由、权限、Session log 与 Side Chat 恢复能跨越 Electron 和 Web Host 同时终止。

**使用压缩的生产 JSONL 并经 Host RPC 读取。** 否决：本通道选择生产 JSONL 提供方支持的 `compression: none` 与 `packChunks: false` 设置，使证据能直接检查物理产物，而无需添加另一条 Host 控制路径。

## 结果

一条命令会在 `.artifacts/critical-path-electron/<timestamp>-<sha>-<random>/` 下生成可评审的 screenshot、build log、phase log、进程身份证据、无提示词正文的提供方 audit、脱敏后的主与子 event-ledger JSONL、Session state 与 result manifest。manifest 聚合 WDIO 实际观察到的通过、失败与跳过计数；setup、build、任一阶段或 cleanup 失败时，它仍会保留固定提交与脱敏失败摘要。它会在删除 scratch 前先按失败写入，只有 cleanup 与保留产物 secret scan 完成后才能报告通过。构建与 phase 子进程启动前仍按宽泛的凭据形态环境变量名规则清理环境；会删除文件的产物扫描只选择以凭据字段结尾的变量名，至少 8 个 UTF-8 字节的值可在任意位置命中，短值仅在带边界的原变量名或通用凭据赋值中命中。通用凭据赋值与 PEM 私钥始终命中。匹配凭据材料的普通文件会被删除，manifest 只报告数量，绝不报告命中内容。link-shaped 或不可读条目会使该命名空间不可分享：runner 会保留该命名空间而不递归删除、不输出分享路径，并保留清理前写入的失败 manifest。脱敏 ledger 保留 Session id、lineage、owned event type、request 与 assistant route、permission 和 archive set，同时省略提示词正文、system text、tool schema 与 event payload。通过结果证明该提交上的普通单安装 create、restart 与 archive 链路。Member Questions、实际运行 Platform 流量、打包 Desktop 与真实提供方行为继续由各自验收负责。

## 测试

- `pnpm --dir apps/desktop run typecheck:e2e-critical-path`
- `pnpm exec vitest run apps/desktop/tests/electron-runner-infrastructure.spec.ts apps/desktop/tests/critical-path-e2e/artifact-io.spec.ts`
- 在具有可见显示器的 host 上运行 `pnpm --dir apps/desktop test:e2e-critical-path-electron`
