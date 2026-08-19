# Agent Note: Content-free Companion push and foreground deep links

Status: implemented

[English](2026-08-19-content-free-companion-push.md) | 中文

## Problem

进入后台的 Mobile Companion 如果没有唤醒信号，就无法察觉待处理批准、人工提问、回合完成或失败。若推送提供方收到 Session 文本、交互参数或设备身份，它就会成为另一个特权读取者。若通知操作凭过期界面直接结算交互，就可能在用户尚未看到当前状态时改写 Desktop。

## Decision

无内容推送属于远程访问，而不是独立的 Platform 通知总线。`@deepseek-ai/dsh-remote-protocol` 拥有提示记录、类别词汇、线解析器以及 APNs/FCM 投影。提示只携带 `approval` | `question` | `turn-complete` | `failure`、带品牌的 `routeId` 与可选的不透明 `sessionRef`。`companionPushHintForEvent` 对流式分片返回 `undefined`，因此流式分片不能扇出。解析器拒绝额外字段。

`@deepseek-ai/dsh-remote-access` 在 `PersonalPairingProvider` 内拥有 token 持久化与扇出。Mobile 安装只有在已拥有该 route 后才能登记 token。Desktop 发布仅限该安装当前 route。单独撤销删除该安装的 token；关闭手机访问删除被撤销 route 上的全部 token。APNs 与 FCM 适配器通过注入的 transport 投影协议载荷，不会追加内容。开发组合使用 `MemoryPushTokenStore` 与 `KeylessCompanionPushDelivery`。

`apps/mobile` 的 `companion-push.ts` 拥有进程可见性。进入后台会关闭 WSS 标志并清除同步状态。点击通知按 `foreground` → `reconnect` → `synchronize` → `present` 前进，且永不把 `settle` 设为 `true`，因此通知界面不能以已接受状态调用 `settleCompanionInteraction`。

每天 500 条提示的配额仍留在开放注册准入计数器上。配对 HTTP 路由、原生 APNs/FCM 凭据以及真机 TestFlight/APK 证明不在本决策范围内。

本决策落实[Mobile Companion 提案](../../proposed/feature/2026-08-17-mobile-companion.md)的推送切片，但不把配对、Relay、附件与推送拆成浅服务。

## Alternatives considered

**把 `@deepseek-ai/dsh-remote-push` 做成 `ctx.remotePush`。** 被放弃的 WIP 已开始这个包。它会让 Push Hint 变成通用 Platform 总线，并拆开同一条远程访问生命周期。协议 codec 留在 `remote-protocol`；token 扇出留在 `remote-access` 内部。

**只在 `apps/mobile` 里做厂商载荷构造。** Platform 必须在不含 Session 内容的前提下发出 APNs/FCM 正文。协议投影是适配器与测试共用的边界。

**从通知操作直接结算批准。** 过期界面可能指向已经变化的工作。前台重连与 Desktop 权威同步必须先于每一次变更。

**保持后台 WSS 或静默同步。** 受约束的移动后台执行不可靠，且 Expo Push Service 不在范围内。无内容唤醒加上前台重新同步是已接受路径。

## Consequences

无密钥测试钉住载荷边界、流式不分发、按账号隔离的 token 删除、针对 transport 替身的 APNs/FCM 适配器，以及 Mobile 先同步再展示的规则。原生厂商凭据、HTTP token 路由、持久 PostgreSQL token 存储以及设备级 APNs/FCM 仍是具名覆盖缺口。
