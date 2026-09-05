# Agent Note：在剩余测试载体迁走后删除 `dsh-host-apiproxy`

Status: proposed

[English](2026-09-06-retire-host-apiproxy.md) | 中文

## 问题

已发布的 Host 与 Desktop 生产路径不再加载 `@deepseek-ai/dsh-host-apiproxy`。Session、Workspace、Settings、Goal、Git、附件、export、Browser、Ask User、Approval 以及 Companion unary/follow 已使用生成 Remote 与 Connection。该包仍占据 Host 编译聚合，仍导出没有 `src/invariant.ts` 的 `./invariant`（Cordis catalog `--check` 最先在此失败），并仍向测试提供 `createApiProxy` / `toFetchHandler` / `ctx.apiProxy`。从 typecheck 排除该目录只会藏起那 80 条 Host 错误，并不是退役。

## 提案

在每一个剩余消费者都有所属包替换之前，把该包留在磁盘上；然后与 workspace、tsconfig、catalog、脚本引用一并删除 `packages/host/apiproxy`。不新增 Facade，不编造空 invariant。

本候选已迁、但还不是完整删除：

- `session.toolEligibility` 在 Session Controller（`@Remote('toolEligibility')`）。直接 Host 测试覆盖省略 `allow`、空 `allow`、非空并集。生成 Host/Client codec 测试覆盖相同 D1 用例，以及冷 resume 的 Agent-context allow 并集、缺 Tools、subagent 归属、以及 Client 对缺失 `sessionId` 的 codec 拒绝。
- Runtime `transportError` 来自 `@deepseek-ai/dsh-client-connection/client`。
- Runtime `searchResultLimit` 测试断言 Session search 上限 `20`，不再导入 apiproxy。
- 删除 apiproxy 承载的 `api-proxy-tool-eligibility.spec.ts`，因为行为已由 Session Controller 拥有。

## 删除前剩余阻断

1. `apps/web/tests/member-question-receiving.e2e.ts` 与 `member-question-receiving.snapshot.ts` 调用 `scaffold.ctx.apiProxy.sessions.{create,prompt,history}` 以及 `scaffold.ctx.apiProxy.memberQuestions.admitHumanTurn`。Web scaffold 已不再提供 `apiProxy`。替换面是 late-inject MQ（421/73de）落地后的 Host Session Controller + member-question receiver；在此之前这些套件不能对着已删包运行。
2. `apps/desktop/tests/companion-host-assembled.spec.ts` 仍用 `createApiProxy` + `toFetchHandler` 作为七条 Snow assembled 用例的 HTTP/WebSocket 载体。Companion search hit/no-hit、归档排除、以及 `openAt: never` / 索引打开失败现已在 `companion-host-search.assembled.spec.ts` 上对着 shipped `dsh web` 跑（cookie + 生成 `session/search`）。其余 Snow create/history/live/mutation/fence 仍须改到该 Desktop Host RPC，Desktop 才能去掉 workspace 依赖。HTTP 400 codec probe 已用真实 loopback 400，不经 apiproxy。

## 测试迁移计划

| 旧 apiproxy 面 | 当前所有者 | 状态 |
|---|---|---|
| `session.toolEligibility` | `session-controller` Host Remote + 生成 codec | 已迁 |
| `transportError` | `dsh-client-connection/client` | 已迁 |
| `SESSION_SEARCH_RESULT_LIMIT` | `session-controller` `types.ts`（`20`） | 测试断言上限，不引用旧导出 |
| Goal fork seed | `session.fork` + `clearGoalFromForkSeed` | 已在 Session Controller |
| 附件 admit/read | `session.admitAttachment` / `session.attachment` | 已在 Session Controller |
| Session search | `session.search` | 已在 Session Controller |
| Session log export | Connection `GET /api/session.export` | 已离开 apiproxy |
| Web e2e 的 MQ admit/prompt/history | receiver + Session Controller | **阻断** |
| Desktop Snow assembled HTTP | `createDesktopHostRpc` | search hit/no-hit、归档排除、provider-failure 已上 shipped Host；其余 Snow create/history/live/mutation/fence **阻断** |

## 考虑过的替代

**现在就删包并跳过或排除剩余测试。** 拒绝：那是靠省略换 typecheck 绿，不是退役。

**把 apiproxy 留作仅测试用的 HTTP Facade。** 拒绝：缺 invariant、Host 聚合错误、以及第二套 Session API 都会留下。

## 验收标准

- git、`tsconfig.host.json`、`tsconfig.base.json` paths、`scripts/project-reference-faces.ts` 以及官方 config/cordis catalog 中不再有 `packages/host/apiproxy`。
- 精确符号搜索若还能找到 `createApiProxy`、`toFetchHandler`、`ctx.apiProxy`，只应出现在本笔记。
- Web MQ receiving e2e/snapshot 与 Desktop Snow assembled 测试仍在 Session Controller / Connection / `dsh web` 上证明相同的用户可见路径。
- `gen-cordis-catalog --check` 不再因 apiproxy `./invariant` 失败。

## 风险

在两项阻断落地前删除，会丢掉 MQ receiving 与 Snow Companion assembled 覆盖。删除后的 catalog 重生必须从源码官方生成，不能手改英文表。
