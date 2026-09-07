# Agent Note: Desktop 关键路径 Electron 验收

Status: implemented

[English](2026-09-08-desktop-critical-path-electron-acceptance.md) | 中文

## 问题

聚焦包测试与浏览器场景分别确认了 Session、模型选择、Side Chat 与归档行为。它们不能证明已交付的 Electron main 进程、Web Host、preload 与 IPC 路径、生产 Client 组合、Session 持久层和可见 renderer 能在完整进程重启后保留同一个 Side Chat 已选择的路由与权限。

## 决策

`pnpm --dir apps/desktop test:e2e-critical-path-electron` 是 Member Questions 之外普通 Desktop 路径的源码验收。runner 要求工作树干净，再从当前提交只构建一次 Host library、Client library、Web 与 Desktop main。它创建一个私有 `DSH_HOME`、Electron `userData` 和 git Workspace，然后依次以 create、restore 与 archive 三个 WebdriverIO 阶段启动同一份已构建 Desktop。只有三个阶段结束后的 HEAD 仍等于已记录提交且工作树保持干净，最终 manifest 才能通过。

create 阶段通过已交付的浏览目录 provider 连接 Workspace，经 renderer 提示主 Session，打开一个尚未发布的 Side Chat，并在一个有界稳定窗口内持续确认首次 Side Chat 提示前主 Session 列表和 Tasks tree 都没有新增行且不存在 child JSONL。保持该 tab 打开时，Models 页面声明一个 `openai-completions` provider 与 model。Side Chat 选择该模型、发送第一条提示、切换到 Read Only，并核对可见回答与生成的原始 JSONL。

restore 阶段复用完全相同的 home、Workspace 和 `userData`。它要求只恢复一个具有相同模型与权限的 Side Chat tab，发送另一条提示，确认现有 child JSONL 增加了第二次请求，证明主 Session 标题栏显示这个确切的持久 child，再经界面关闭该 tab。归档投影完成后，该阶段会等待 tab 与主标题栏 child row 一起消失。archive 阶段再次启动同一状态，确认 tab 保持关闭、child id 位于 Workspace domain 的持久归档集合中，并确认 child JSONL 仍携带两轮自有 turn、两条模型 B request header 与 Read Only event。

环回 OpenAI-compatible HTTP listener 是唯一的外部服务替代。它按请求模型返回回答，只保留阶段、URL 路径与 model id。测试 profile 把自动标题生成路由到另一个已交付的 DeepSeek 模型，使 audit 无需保留提示正文也能区分该请求。runner 不读取用户正常的 `DSH_HOME`；其测试 profile 只被仅限源码的 Desktop E2E gate 接受。WDIO 会记录每个实际观察到的测试结果，不会用计划阶段数替代执行。进程证据会在测试正文前记录 Electron，并在 Web Host 启动记录出现时立即补充其 PID；每个阶段结束时两个 PID 都必须退出，失败路径会在清理 scratch 前终止并等待所有已记录属主。

## 考虑过的替代方案

**扩展三安装 Project Members runner。** 否决：本路径只有一个安装，不包含 Account、Project Membership、Relay 或 Companion 行为。合并两者会让路由回归依赖无关的多账号基础设施。

**从测试调用 Host controller 或安装进程内 Agent fixture。** 否决：这样会绕过本通道要证明的 Desktop main 入口、Web Host 进程、Remote transport、Session controller、preload 与 IPC 组合及可见用户交互。

**只 reload 一次 renderer 而不重启 Electron。** 否决：页面 reload 无法证明所选路由、权限、Session log 与 Side Chat 恢复能跨越 Electron 和 Web Host 同时终止。

**使用压缩的生产 JSONL 并经 Host RPC 读取。** 否决：本通道选择生产 JSONL provider 支持的 `compression: none` 与 `packChunks: false` 设置，使证据能直接检查物理 artifact，而无需添加另一条 Host 控制路径。

## 结果

一条命令会在 `.artifacts/critical-path-electron/<timestamp>-<sha>/` 下生成可评审的 screenshot、build log、phase log、PID 证据、无提示正文的 provider audit、脱敏后的主与子 event-ledger JSONL、Session state 与 result manifest。manifest 聚合 WDIO 实际观察到的通过、失败与跳过计数；setup、build、任一阶段或 cleanup 失败时，它仍会保留固定提交与失败摘要。它会在删除 scratch 前先按未完成写入，只有 cleanup 完成后才能报告通过。脱敏 ledger 保留 Session id、lineage、owned event type、request 与 assistant route、permission 和 archive set，同时省略提示正文、system text、tool schema 与 event payload。通过结果证明该提交上的普通单安装 create、restart 与 archive 链路。Member Questions、实际运行 Platform 流量、打包 Desktop 与真实 provider 行为继续由各自验收负责。

## 测试

- `pnpm --dir apps/desktop run typecheck:e2e-critical-path`
- 在具有可见显示器的 host 上运行 `pnpm --dir apps/desktop test:e2e-critical-path-electron`
