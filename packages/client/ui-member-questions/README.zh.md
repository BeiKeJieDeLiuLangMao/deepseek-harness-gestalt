---
description: "成员提问 composer 接管层，在共享问题呈现上显示远端 Decision Brief 横幅。"
kind: "package-reference"
---

# ui-member-questions — 成员提问 composer dock

[English](README.md) | 中文

## 概述

本包把成员导向的 `ask_user_question` 请求呈现为一张组合卡片：远端决策简报横幅（远端标记、提问人身份与角色、项目、来源会话、到期倒计时、截断的背景、材料芯片）叠加在共享问题呈现之上，后者原生支持分页、多选、推荐徽标、自定义回答与结算行为。

本包在产品 composer 上方注册一个叠加式 `conversation.input.dock` 入口。Host pending 成员提问行在此渲染 Decision Brief；`plan-review` 与普通 composer 接管仍走共享问题链。观察到共享呈现自身的最小化开关时，整卡折叠为一条「远端 · 发起人」窄条并标记为已收起；呈现保持挂载，因此其草稿得以保留。

材料芯片只通过 Better Sidebar Files 打开 receiver 所有的缓存副本。Host 把传输 bytes 写到 `.dsh/member-questions/<questionId>/`，因此同名 Workspace 文件不会被覆盖或误打开。点击芯片会用 receiving Session id 与缓存 path 调用 `ctx.betterSidebar.openFile`；缺少 `cachedPath` 时芯片是 no-op。markdown、沙箱 HTML 与不受支持的类型复用普通 Files viewer。Files editor 标签未注册时，芯片调用 `ctx.remote.session.openWorkspacePath({ path: absolute })` 与 Host 系统打开器。不存在成员提问专用文档 dock。

`ReceivingQuestionBook` 是唯一 Host snapshot owner。它保存生成 `memberQuestion.snapshot` 的 Host pending 视图，仅在 Remote 写入成功后经 `memberQuestion.settle` 刷新，并在 `member-question-receiver/changed` 时刷新。dock 把 Host questions 映射为 JSON，并声明 `question.presentation`，传入 Host answer/cancel callback。`PendingQuestion` 与草稿仍由 ui-user-questions 拥有。Host settle 失败时 Host pending 视图与 QuestionComposer 草稿都保留。

pending 卡片消失后，answered、declined、expired、withdrawn 与 superseded 记录仍以被动条带显示。另一个 Installation 赢得的回答会显示为 elsewhere answered，并带获胜设备名与 settlement time。未被替换的产品 composer 经 receiving face 的单次 admission RPC 提交；卡片不会再挂载第二个 textarea，renderer 也不会分别发起 Session creation 与 prompt。

## 目录

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

通过它结算到共享 `ask_user_question` 工具结果中的答案间接影响模型。

#### KV Cache effect

它不增加稳定请求前缀；每次提交的答案都会经共享呈现加入保留的工具结果 token。

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- **Dock 路由以整批为单位** —— 仅当待处理请求中的每个问题都声明 `member-question` 意图时本卡才渲染；只要混入一个普通或 `plan-review` 问题，整批就交给共享问题 composer，不存在按问题拆分。
- **材料芯片需要 Files viewer 或 Host 系统打开器** —— 已注册的 Files editor 标签会在 receiving Session 中打开 receiver 所有的缓存 path；缺少 `cachedPath` 时芯片是 no-op，同名 Workspace 文件不会被打开；否则使用 Host 系统打开器。不存在第二个产品内文档 dock。
- **Admission 失败会保留在 receiving card** —— 共享 input state 保留 draft 并暴露 Host diagnostic。只有 Host materialization 成功后，普通 model、command 与 skill route 才会开放。
- **Receiving Session face 仍由 session-controller 拥有** —— `ReceivingQuestionBook` 把 Host snapshot 行投影为 JSON。本包不再保留第二条 Remote ledger。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

暂无。

</details>
