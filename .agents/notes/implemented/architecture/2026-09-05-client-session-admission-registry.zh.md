# Agent Note: Client Session 准入 registry

Status: implemented

[English](2026-09-05-client-session-admission-registry.md) | 中文

## Problem

标准 Session 对话 UI 必须服务 Side Chat 这类功能自有身份，且不能调用库存 Host Session Remote。这些身份可以在 Host 发布前以仅供 renderer 使用的临时身份存在，普通 Session RPC 会拒绝或错误归属它们。Client Session 对象层没有精确身份 registry，后续产品 adapter 无法在已经物化的 `Session` 上拦截 prompt、cancel、queue 变更或 command。

## Decision

`ClientSessions` 在 `api/session-controller` 的 Client face 上拥有实时准入 registry。`registerAdmission(sessionId, route)` 绑定一个精确 Session 身份；`registerAdmissionAdapter(adapter)` 绑定带唯一 adapter id 的 `handles(sessionId)` 匹配器。精确身份优先于 adapter。默认冲突策略替换先前精确归属方；`conflict: 'reject'` 抛错。每次注册返回带 token 校验的 disposer：过期 disposer 不会撤销更新的归属方，`ClientSessions` 销毁后的 disposer 为 no-op。

`SessionManager` 把实时解析器传入每个 `Session`。prompt、cancel、queue 变更与 command 在调用时咨询该解析器，因此延迟注册、替换与撤销作用于已有 binding。命中后返回失败或抛错绝不会回退到库存 Host Remote。命中后省略 `updateQueue` 或 `command` 会失败并报错。command 绝不会转成 prompt。未命中的普通 Session 仍走库存 Remote。注册不授予 Host 权限；标题与 catalog subagent 地址都不是凭证。

`modelRoute`、`commandCatalogSessionId` 与 `skillCatalogSessionId` 咨询当前归属方。功能自有 Session 省略 catalog helper 会隐藏对应 catalog。没有功能路由、仅被 catalog 定址的 subagent 也会隐藏 command 与 skill。本切片不为普通 Session 安装库存模型 catalog，不接线 skill 或 command catalog 消费方，不按 `historyScope: 'owned-suffix'` 裁剪历史，也不注册 Side Chat 产品 adapter。

## Alternatives considered

**只把准入留在保留的 `client/runtime` barrel。** 未采用，因为 Client Session 对象层现已位于 `api/session-controller/client`；第二套 registry 会复制身份，并错过已有 binding。

**用标题或 catalog subagent 地址授权。** 未采用，因为这些事实是展示与导航数据，绝不能为功能身份放行 Host 自有操作。

**功能失败后回退到库存 Remote。** 未采用，因为命中已经选定归属方；再试 Host Session RPC 会双重分派，并可能对错误 Agent 成功。

**把未匹配 command 转成 prompt。** 未采用，因为 slash command 有独立 Host 准入，归属方省略 `command` 时必须失败并报错。

## Consequences

标准 `Session` 的 prompt、cancel、queue 与 command 可以由 Client plugin 拥有，且无需 Host 权限。Side Chat 与其他功能 Session 在对话 UI 完整之前，仍需要产品 adapter、库存模型 catalog、catalog 消费方与 history suffix 裁剪。`ui-model-selection` 已经读取 `modelRoute`；普通 Session 在该后续切片落地前没有库存路由。

## Testing

`packages/api/session-controller/tests/session-admission.client.spec.ts` 固定临时身份首次 prompt、普通 Remote 保留、延迟注册、替换 disposer、reject 冲突、无回退失败、command 隔离、adapter 分派、标题/地址非授权以及销毁。`queue-store.client.spec.ts` 固定经注入准入解析器的 queue 变更。
