---
description: "使用环境命名空间 JSON 持久化、串行原子变更与角色门控操作的 Project Membership Provider。"
kind: "package-reference"
---

# `@deepseek-ai/dsh-project-membership-core`

[English](README.md) | 中文

## 概述

项目成员 Provider。每次变更——创建、邀请、撤回、原子接受并链接、拒绝、升降级、改标签、移除——都在本进程的单一串行写链下运行,在操作内部执行角色门,对输入响亮校验(`INVALID_PROJECT_NAME`、`INVALID_REMOTE_URL`、`INVALID_TAGS`、`INVALID_LINK`),以 `0600` 权限(`0700` 目录)经原子临时文件重命名整体发布环境文档,然后才发出 `project-membership/roster-invalidated`。被拒绝的持久写入在拒绝返回前,把该操作的确切变更批次对称回滚出内存,后续提交因此永远不会把文档拒绝过的行发布上盘。并发调用者因此观察到全有或全无的提交:向同一账户并发发出八次邀请,只会落定一条待决邀请与七次 `DUPLICATE_INVITEE` 拒绝。每次操作重载已提交状态，写入失败不会留下幽灵记录，也不会影响后续读取或重试。暂存文档包含即将发布的 roster 版本。

默认文件适配器通过原子重命名保存 `<storagePath>/<environment>/project-membership.json`，文件权限为 `0600`，目录为 `0700`。它仅接受格式版本 1，拒绝悬空和重复索引记录，保留损坏错误；文件缺失表示首次启动为空。它只有一个写入者。生产多实例使用 [Platform](../../../apps/platform/README.zh.md) 的 `PostgresProjectMembershipPersistence`，在读取、变更和提交全过程持有命名空间事务锁。账号删除在同一事务中转移明确选择的接任所有者并移除个人引用。

消费方基于失效事件流与 `rosterVersion(projectId)` 重建缓存 roster 视图;包内的不变量伴侣约束这条已发布流严格单调——每次提交使所属项目的投影版本恰好前进一,移除也不例外,移除永远不会跟随过时的记账。

## 目录

- [Extension Points](#extension-points)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="extension-points"></a>
## Extension Points

配置字段:`storagePath`(持久语料目录)与 `environment`(`'development' | 'production'`,否则加载即报错)。Loader 直接挂载包默认导出:

```yaml
- name: '@deepseek-ai/dsh-project-membership-core'
  config:
    storagePath: '~/.dsh/projects'
    environment: 'development'
```

其他持久化实现提供 `ProjectMembershipPersistence.transact`，回调必须持有独占权威，直到暂存写入提交。围绕同一路径增加文件提供方并不能提供多实例安全。测试只受外部不确定性(uuid、墙钟)影响;组装场景基于真实本地存储 keyless 运行。

<a id="model-experience"></a>
## Model Experience

通过 `project_members` 与成员提问 Consumer 渲染的权威 roster、角色和职能标签间接影响模型。

#### KV Cache effect

该 Provider 不增加稳定请求前缀；roster 变更会改变后续工具结果与成员路由内容。

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- **单进程写者** —— 一条写链串行化进程内全部变更;指向同一存储根的两个进程没有跨进程锁,可能互相丢更新。扩展靠更换后端,而不是多开实例。
- **评审门下的生产姿态** —— 开发环境经本地存储 keyless 组装;成员提问路由保持 fail-closed,仍受[放置决策 Agent Note](../../../.agents/notes/implemented/feature/2026-08-27-project-membership-core.zh.md) 记录的常设独立加密评审约束。本包不含任何传输、凭据或明文。
- **暂无管理界面** —— 清理已拒绝/已撤回邀请与审计导出推迟到出现消费方之后再做。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

暂无。

</details>
