---
description: "schedule 组地图：基于会话日志的会话本地持久提醒，供浏览本组的用户与维护者阅读。"
kind: "package-group"
---

# schedule/ — 仅限会话内的提醒

[English](README.md) | 中文

## 概述

使用 schedule 包族创建持久的会话本地提醒，并在同一会话中将提醒作为普通消息交付。Host 包负责创建、列出和删除工具以及可选的保留状态投影；独立浏览器包可以显示缓存标记。提醒可跨重启，但绝不发送电子邮件、短信或推送通知。

## 目录

- [包组约定](#package-contract)
- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="package-contract"></a>
## 包组约定

schedule 组为运行中的会话提供会话本地提醒：让 agent 在稍后、绝对时间或固定间隔提醒你，每条提醒到期时都会作为同一会话中的普通消息到达。Host 包拥有三个模型管理工具、供人工使用的 `schedules` Remote namespace，以及可选的保留记录 projection。DeepSeek Gestalt Desktop 默认启用独立的 [`ui-schedule`](../client/ui-schedule/README.zh.md) 任务板；浏览器 Web 保持可选。[`ui-workspace`](../client/ui-workspace/README.zh.md) 仍可能为尽力而为的列表值明确非空的普通行与搜索结果显示闹钟。该标识只报告缓存所知的保留状态，不保证 live runtime 存在。提醒在重启后依然存在，但只留在会话内部：没有电子邮件、短信或推送通知。本页是组地图；各包 README 拥有自己的约定。

<a id="packages"></a>
## 包

| 包 | 职责 | ctx key |
|---|---|---|
| [`schedule/`](schedule/README.zh.md) | 会话本地提醒：安排、列出并取消保留记录；公开人工暂停／恢复／删除；发布可选保留 projection；把到期提醒作为会话消息交付 | `schedules`，以及精确 agent scope 中的工具 |

-----

<a id="related-documentation"></a>
## 相关文档

- [仅限会话内的 Schedule 子系统](../../docs/subsystems/schedule.zh.md)——持久记录、转换、视图与交付约定。
- [生成的工具目录](../../docs/tool-catalog.zh.md#deepseek-aidsh-schedule)——模型接收的 `schedule_create`／`schedule_list`／`schedule_delete` schema。
- [Schedule 用户指南](../../docs/user/guide/schedule.zh.md)——挂载本包的官方配置路径。
- [Web Schedule 任务板](../client/ui-schedule/README.zh.md)——保留记录目录与人工暂停、恢复和删除控制。

-----

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
