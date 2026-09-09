---
description: "面向用户与维护者的保留 Schedule 提醒 Web 目录与人工控制说明，用于选择该界面并理解其 projection、时间、mutation 与无障碍行为。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-schedule

[English](README.md) | 中文

## 概述

本包在 Web 会话头部渲染当前 Session 保留的 Schedule 提醒，并提供人工暂停、恢复与删除控制。它读取完整的 `schedule` projection，通过 Host 拥有的 `schedules` Remote namespace 发送 mutation；持久状态经 projection 返回。浏览器派生状态、本地时间、相对时间与排序，不把这些呈现值加入持久状态。DeepSeek Gestalt Desktop 会随 Host Schedule 插件一起启用此 row；浏览器 Web bundle 仍保持禁用，直到显式 Schedule overlay 同时启用两项 entry。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在需要显示提醒的 Web Session 启动前启用 Schedule overlay：

```sh
dsh web --patch apps/cli/config/examples/schedule/cordis.yml
```

随附 Web graph 已通过 disabled 的 `ui-schedule` row 解析 `@deepseek-ai/dsh-client-ui-schedule`；overlay 会把该 row 与 `@deepseek-ai/dsh-schedule` 一起启用。Desktop overlay 会启用同一个既有 row，不会插入第二个客户端插件。只有 Session 已成功打开且 projection 至少包含一条保留记录时，触发器才会出现。计数包含等待中与已逾期记录，排除已暂停记录。打开目录后，逾期行在前，未来行与暂停行再按目标时间排序；完全并列时保留 projection 顺序。

### 管理和关闭目录

每一行显示可完整换行的 prompt、独立的「等待中」「已逾期」或「已暂停」状态、本地化的「单次」或重复间隔可整除的最大完整单位、浏览器本地目标时间，以及按浏览器时钟派生的相对时间。间隔绝不舍入，三项元数据会按行换行，不会裁剪合法的大数值。暂停与恢复通过行内控制立即执行；删除需要行内确认。mutation 失败会作为 alert 留在对应行，未变化的持久 projection 继续可见。通过 portal 挂到 body 的弹层目标宽度为 336px；空间足够时与触发按钮左边缘对齐，靠近视口右侧时向左避让并保留 16px 视口边距。弹层会在需要时纵向滚动，且不显示 Schedule id 或原始 UTC 值。

只有原生触发按钮进入 Tab 顺序。Enter 与 Space 使用按钮的正常激活行为；焦点仍在触发器或目录内时，Escape 会关闭弹层并把焦点交还触发器；在外部按下指针也会关闭。若 live 更新移除最后一条记录，组件会关闭并卸载，但不会把焦点移到另一个会话头部动作。Session 打开失败时，即使存在暂定的缓存 projection，也会隐藏触发器。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

浏览器插件以顺序 10 向 `conversation.session.header.actions` 贡献 `schedule-catalog`，位于静态 Agent 与 Subagent 上下文之后、后台 Jobs 之前。它通过标准 Session hook 读取 `openState`，通过 `useProjection('schedule')` 读取完整值。其注入面把 pause、resume 与 delete 绑定到 entry 的 Session id，并通过 `ctx.remote.schedules` 解析每次调用；pending、确认、错误与 popover 状态留在本地呈现状态中。组件把目录 portal 到 `document.body`，并将触发器与面板 ref 交给 `useAnchoredPosition`；该 hook 在测量已渲染面板后发布 fixed 坐标，使面板位于触发器下方 5px、钳制在 16px 视口边距内，并在 resize、捕获阶段 scroll 与面板 resize 时重新测量。浏览器格式化使用查看方的 locale、时区与时钟，持久 Schedule 记录保持不变。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 浏览器入口：注册 locale 并贡献 Session 头部 slot |
| [`src/client/ScheduleCatalogAction.tsx`](src/client/ScheduleCatalogAction.tsx) | 可见性、排序、格式化、弹层与键盘行为 |
| [`src/client/slots.ts`](src/client/slots.ts) | Session 范围内的人工 mutation 接口 |
| [`src/client/locales.ts`](src/client/locales.ts) | 中英文目录文案 |
| [`src/index.ts`](src/index.ts) | 空的 Host apply，使 Loader 可以寻址该可选浏览器功能 |
| — | 不发布运行时不变量伴生入口；持久 mutation 状态归 Schedule 所有，并经标准 projection 返回。 |

[Session Schedule 任务板 Agent Note](../../../.agents/notes/implemented/feature/2026-08-17-session-schedule-board.zh.md)拥有人工作业与呈现边界；本包拥有目录的时间与无障碍行为。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当目录本身不够用时阅读以下页面。它们从浏览器呈现逐步进入持久 Schedule 状态与共享 projection 传输。

- [Schedule 包](../../schedule/schedule/README.zh.md)——创建、列出、取消并交付这里显示的提醒。
- [Schedule 子系统](../../../docs/subsystems/schedule.zh.md)——持久记录、转换与交付语义。
- [会话投影子系统](../../../docs/subsystems/session-projection.zh.md)——本包读取的完整值传输。
- [客户端包映射](../README.zh.md)——相邻的浏览器 UI 包。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包只为人类渲染已经完成的客户端 projection，从不改变 prompt、消息、schema、流或工具结果。

#### KV Cache 影响

无；本包从不组装或发送 provider 请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定当前 Schedule 目录。它们是当前包约束，不是提醒服务对比或任务积压。

- **仅含保留记录**——终结性的 delete 与 dispatch 转换会移除对应行；普通 transcript 仍是唯一的提醒交付历史。
- **浏览器派生时间**——本地时间与相对时间标签使用查看方浏览器当前的 locale、时区与时钟。它们是呈现值，不是持久 Schedule 事实。
- **没有浏览器创建或编辑表单**——创建与 prompt 变更仍由模型完成。人工暂停、恢复与删除控制不会增加 acknowledgement、Toast 或交付回执语义。
- **要求 Session 打开成功**——打开失败时，即使存在暂定缓存值也会隐藏，因为严格 Session 回放仍是权威。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
