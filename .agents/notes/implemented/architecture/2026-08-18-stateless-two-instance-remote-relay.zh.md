# Agent Note: 通过无状态 Platform Instance 路由已配对 endpoint

Status: implemented

[English](2026-08-18-stateless-two-instance-remote-relay.md) | 中文

## Problem

Mobile 与已配对 Desktop 可能通过同一个 non-sticky endpoint 到达不同 Platform Instance。route id 不能单独成为 attachment 权限，Platform 也不能接收 DSH Session、prompt、approval、model、Workspace 或其他 Companion business value。滚动替换必须在不迁移在线 socket、不保留离线 mutation 的情况下恢复。Desktop 进程生命周期还必须是远程 endpoint 是否在线的事实来源。

## Decision

Remote Access 拥有 `ctx.remoteRelay` capability，并与 [Relay Transport 和加密 Companion protocol](2026-08-18-versioned-remote-protocol.md)分离。`RemoteRelayProvider` 对部署数据无状态。每个实例接收同一组 `RelayRouteStore` 与 `RelayCoordinator` 接口、一个不透明的带品牌 instance id，以及显式校验的限制。规范 base64url 编码的 32 字节 Relay credential 由密码学熵源生成，只返回给 endpoint authority，在持久化前被哈希，并通过单调 route revision 轮换。Attach 同时要求 route id 与当前 credential。轮换与撤销会扇出不含内容的失效事件，并关闭旧 revision 的本地 attachment。

最小持久 route 记录包含 route identity、credential digest、单调 revision、撤销状态与部署拥有的 pairing 关联。它不包含任何 Companion 或 Harness 明文值。Redis coordinator 只拥有临时且会过期的目录条目、直达 instance Pub/Sub 与失效通知。目录条目包含 route 与 attachment id、endpoint 类型、Platform Instance id、防旧清理的 connection token、revision 与 expiry。条件式 refresh 和 unregister 会比较 connection token。Pub/Sub 事件包含有界 Relay 密文 frame、目标 connection token 与 revision。不使用 Redis Stream、List 或其他离线 queue。

一个精确 WSS Consumer 要求 ciphertext 或 heartbeat 前先收到 attach frame，关闭压缩，执行协议 frame 上限与已校验的 attach timeout，串行处理 frame，并随 socket teardown 排空 attachment 清理。目标缺失或过期、instance 没有订阅者、endpoint 已断开或离线发送都返回 `REMOTE_OFFLINE`；不会保留任何内容等待重放。每实例容量只拒绝新 attachment 并返回重试延迟。每目标待写密文字节有上限；超过上限会断开慢消费者。心跳重新校验 credential digest 与 revision、条件式刷新目录，并让停止证明存活的 attachment 过期。实例关闭通过 all-settled 聚合观察每条连接、writer、目录与订阅清理。

Mobile 与 Desktop 通过部署的单个 non-sticky TLS endpoint 获取出站连接。物理 socket 丢失后，会在已校验的延迟后重新获取连接。Desktop 必须提供权威加密 resync callback，并在每次成功 attachment 后执行，因此滚动替换通过重建状态恢复，而不迁移在线 socket。endpoint controller 从不保留离线 mutation。Desktop 设置只在手机访问开启时启动 Relay；关闭窗口会退出 Desktop 进程，sleep、quit、退出账号或关闭手机访问都会停止并排空连接。不存在 daemon、后台 Host 或 remote wake 路径。

assembled keyless 场景运行两个真实 WSS Platform backend 与 Redis-compatible 共享 coordinator。Mobile 与 Desktop 被刻意分配到不同实例，完成一次加密 Companion round trip，替换 Desktop 所在实例后重新连接并 resync，随后证明离线目标返回 `REMOTE_OFFLINE` 且排队事件为零。场景专用 AES-GCM channel 不进入生产。独立 Noise 安全 gate 继续让产品配对与 Relay 激活保持 fail-closed。

## Alternatives considered

**使用负载均衡 stickiness。** sticky routing 将 instance ownership 隐藏在边缘状态中，也无法在滚动替换后继续成立。共享的会过期目录让每条连接和每个实例都可丢弃。

**使用持久 broker queue。** 排队密文会引入 Remote Companion 不需要的离线投递、保留、重放、删除与产品策略。直达 Pub/Sub 会立即报告在线目标缺失。

**在 Platform 存储 Companion 对象。** 解析或持久化应用值会打破协议分离，并向中心服务暴露 DSH 权限。Platform 只转发已经有界的密文 envelope。

**运行后台 Desktop Host。** daemon 或 remote wake 会让窗口状态产生误导，并增加新的 installation lifecycle。关闭唯一 Desktop 窗口会直接退出进程并让 route 离线。

**集成 proof-local Snow 代码。** transport delivery 不会批准产品密码能力。经评审 provider 仍是独立 gate，可执行验收场景继续明确保持 keyless。

## Consequences

两个 Platform Instance 可以在没有连接亲和性的情况下共享一个 endpoint，滚动替换只会丢失临时 socket。route id 仍是非 secret locator，credential 轮换与撤销具有跨实例效果，coordinator 无法检查 Companion business value。代价是每次实例丢失后 endpoint 都必须重连且 Desktop 必须 resync；离线 Mobile 工作会立即失败，只能由未来显式产品动作重试，而不能依赖基础设施重放。云供应、TLS、持久 route-store 实现、Redis 可用性与经评审产品密码 provider 仍是部署工作，不是本仓库声称已交付的能力。
