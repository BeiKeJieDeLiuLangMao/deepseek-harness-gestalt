# Agent Note: IM config GUI remotes

Status: implemented

[English](2026-09-11-im-config-gui-remotes.md) | 中文

## Problem

官方 Host 现已空闲挂载 IM 服务，但 Web GUI 仍在改内存原型快照。因此账号、接管规则和模拟目标无法跨刷新持久化，Settings / 工作区卡片也无法绑定 `ctx.remote.imConfig`。

## Decision

`ImConfigService` 继承 `TypertRemoteService`，经 `@Remote` 暴露账号、路由与模拟 CRUD。线上选项类型放在 `@deepseek-ai/dsh-im-core/client`。`packages/api/remotes` 挂载生成的 contribution。`ui-im` 注入 `remote` 与 `remote.imConfig`，再从 Host 列表刷新快照。GUI Remote 的 `listRouteRules` 是未过滤适配器，因为可选位置参数不能上线。新建 GUI 路由保持禁用；编辑规则用同一 id 再调 `createRouteRule`，以便改 target 与 trigger。断开把账号标为 `disconnected`，不删除。对话流展示随后改走 `imDelivery` remotes；见 [IM delivery GUI remotes](2026-09-11-im-delivery-gui-remotes.zh.md)。

## Alternatives considered

**继续把原型 store 当产品 GUI。** 否决，因为 Host 已拥有持久账号与路由；再保留一份内存真相会漂移。

**同一变更里加上 `imDelivery` remotes。** 否决，因为对话标签仍没有真实入站/出站 Host 方法；先交付配置 remotes 即可解开 Settings 与工作区卡片，而不声称真实投递。

**GUI 断开时删除账号。** 否决，因为原型断开只切换连接状态；删除会丢掉路由与模拟绑定。

## Consequences

当 Client assembly 已挂载时，Web GUI 的账号、路由与模拟变更经 Host remotes 持久化。密钥仍不进入快照。真实钉钉消费、真实旺旺读取、真实出站、真实模型 round 和原生 Desktop computer-use 仍需另行授权。
