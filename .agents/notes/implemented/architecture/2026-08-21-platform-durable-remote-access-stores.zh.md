# Agent Note: Durable Platform Remote Access stores

Status: implemented

[English](2026-08-21-platform-durable-remote-access-stores.md) | 中文

## Problem

两台生产 Platform Instance 位于同一个非粘性 TLS 均衡器后面，并共享 PostgreSQL。配对 challenge、已确认的 Mobile 权威和 Relay credential digest 不能只放在进程内存里，否则一台主机上的 Desktop 启用对另一台主机上的 Mobile 完成不可见。这些适配器供之后的 Snow 配对与 Relay 挂载共享。

## Decision

[`apps/platform`](../../../../apps/platform/src/boot.ts) 在监听时迁移两个 PostgreSQL 适配器：[`PostgresPersonalPairingAuthorityStore`](../../../../apps/platform/src/postgres-pairing-store.ts) 拥有 Desktop route、已确认 Mobile pairing 结果和独占 pairing-transaction 文档，[`PostgresRelayRouteStore`](../../../../apps/platform/src/postgres-route-store.ts) 拥有哈希后的 Relay credential 与单调 revision。[`pairing-state-codec.ts`](../../../../apps/platform/src/pairing-state-codec.ts) 把独占的 `PersonalPairingTransactionState` Map（含 orphan cleanup 同一性）编码为 jsonb。`runPairingTransaction` 对按 database identity 键控的一行做 `SELECT … FOR UPDATE`，让两个实例串行化同一租约。生产 listen 用 [`SnowPairingHandshakeProvider`](2026-08-21-snow-product-handshake.md) 挂载配对 HTTP 与 Relay WSS。该监听进程永不选择 `DevelopmentKeylessPairingHandshakeProvider`。

## Alternatives considered

**用开发用 keyless handshake 挂载配对 HTTP 和 Relay WSS。** 否决：生产 listen 挂载 Snow。keyless 适配器仍只用于开发。

**现在继续用内存 store，等挂载 Relay 再加 PostgreSQL。** 否决：表必须在第一次 enable 或 confirm 跨实例之前就存在，而且监听进程已经拥有 Account 的 PostgreSQL 连接池。

**给每个实例私有的配对数据库。** 否决：非粘性均衡器会把一次 Personal Pairing 生命周期拆到两个权威上。

## Consequences

同一组适配器和 Redis coordinator 服务于 Snow 配对与 Relay 挂载。keyless 适配器仍只用于开发。

## Testing

[`apps/platform/tests/pairing-state-codec.spec.ts`](../../../../apps/platform/tests/pairing-state-codec.spec.ts) 与 [`apps/platform/tests/postgres-remote-access-stores.spec.ts`](../../../../apps/platform/tests/postgres-remote-access-stores.spec.ts) 钉住 codec 拒绝、orphan 同一性、Desktop route 保留或替换、Mobile 碰撞、独占事务回滚，以及 route 的 rotate/issue/authorize/revoke。[`production-env.spec.ts`](../../../../apps/platform/tests/production-env.spec.ts) 钉住监听进程迁移这两个 store，并导入 Snow 而非 keyless handshake。
