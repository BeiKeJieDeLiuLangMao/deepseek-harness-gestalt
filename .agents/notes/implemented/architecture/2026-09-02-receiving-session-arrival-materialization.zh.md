# Agent Note: receiving Session materialization at Member Question arrival

Status: implemented

[English](2026-09-02-receiving-session-arrival-materialization.md) | 中文

## Problem

路由后的成员提问需要在邀请绑定的 Workspace 中成为真实本地对话：成员可以在回答前后与自己的 agent 讨论 Decision Brief，且普通本地回答不得留下永久 answered 条带。T6 把 Host Session 创建推迟到首次显式 human turn，因此到达不花费模型 token。这会让侧边栏行落入未分组、把可重放 brief 推迟到 prompt，并在 `admitHumanTurn` 成功前阻止普通 prompt 路由。

## Decision

认证到达会为 `(originSessionId, receiving Account)` 路线键物化恰好一个 Host Session。Host receiver 仍拥有 opaque `ReceivingSessionId`。提交 question 行后，`ingest` 用邀请时 Workspace binding 与该线程上全部保留提问调用一次注入的 Session materializer。`SessionController` 把该唯一 materializer 与终态 Session 同步登记为同一个 Cordis effect：把 receiver id 复用为 Host `SessionId`，关联绑定 Workspace，用第一条 brief 的 origin 行给 Session 命名，追加可忽略的 `member-question/received` 与任何已 canonical 的 `member-question/settled` 记录，以稳定 plugin message id 注入每条有界 brief，并 flush persistence。到达 flush 失败会保持 receiver `materialized` 为 false，重放按同一身份重试。后续持久终态会恢复该已物化 Session，并恰好追加一次可忽略的 `member-question/settled`；flush 失败后按 `receivingTerminalRetryMs` 重试。卸载 controller 会取消定时器、拒绝过期写入、等待进行中的同步，并撤回登记。Injection 会暂存面向模型的上下文但不唤醒 driver，因此到达时 request count 仍为 0。人工轮次准入登记在同一个 Session Controller effect：恢复已物化 Session，以保留的 rpcId 标记 `source.kind=user`，并 steer 或 followup。未物化身份会被拒绝，而不是再创建第二个 Session。浏览器图片提升后交给 `receiver.admitHumanTurn` 的入口仍留在剩余 Host 组合（当前为 ApiProxy）。

幂等重放与 Host 重启通过 `resumeReservedSessionMaterializations()` 恢复未物化行，不会创建第二个 Session。human turn 仍走独立的 reserved `admitHumanTurn` 路径。一旦存在 `hostSessionId`，receiving face 绑定普通 Host Session，并把后续 prompt 路由到 `session.prompt`；本地回答仍经 `memberQuestion.settle` 结算。Client 会把本地 `answered` 终态从对话页脚投影掉，并保留 exceptional 或跨安装终态作为 record band。侧边栏把 Host 已关联的 Session 列在绑定 Workspace 下；浏览器在新 pending 身份到达时展开该 Workspace 一次，且不更改当前 Session。

[Host receiver ledger](2026-08-31-host-owned-member-question-receiver-ledger.zh.md) 仍拥有 persistence、first claim、expiry 与 human-turn reservation。[identity-stable receiving face](../feature/2026-08-30-web-receiving-experience-assembly-fixes.zh.md) 仍拥有 pending wait 与 Host snapshot 投影。[Files 侧栏打开记录](2026-09-03-member-question-files-sidebar.zh.md) 拥有传输文档 cache path 与 Better Sidebar Files 打开。

## Supersession check

本记录取代 T6 中“拒绝在到达时创建 Host Session”的替代方案。到达对模型花费仍是 collaboration notification：Session 存在是为了让成员能对话，但本地 agent 仍只在显式 human prompt 后运行。

## Alternatives considered

**继续把 Host Session 创建推迟到首次 human turn。** 拒绝，因为成员无法在回答前讨论 brief，行会留在未分组，可重放上下文也要等到 prompt。

**在到达时唤醒本地 agent。** 拒绝，因为到达不得花费模型 token。`agent.inject()` 会把 brief 暂存到下一次 human turn，而不打开 turn。

**向 Client 暴露 `session.create` 再 `prompt`。** 拒绝，因为两次调用之间的 crash 会复制 Session 或丢失第一条 human message。到达使用一个 materializer；human turn 保留一个 reserved `rpcId`。

**把本地回答留作永久对话页脚 band。** 拒绝，因为普通本地回答是成员已完成的决策，不是 exceptional terminal。expired、withdrawn、superseded 与 answered-elsewhere 结果仍需要 durable record。

## Consequences

Host 接受路由提问后，该提问立即作为普通 Host Session 出现在邀请绑定的 Workspace 下。Decision Brief 会在任何 human prompt 之前被记录并注入。成员可以在回答前发送普通 prompt，并在本地回答后再发送。到达本身不启动模型 turn。本地回答会离开对话页脚；exceptional 或跨安装终态仍作为 record band 保留。

## Testing

Focused receiver tests 固定到达物化、幂等重放、中断 materializer 恢复，以及不变的 human-turn reservation。Session Controller Host tests 固定已认证 ingest 落到真实 AgentLoop Agent：按同一 id 重开 JSONL、一条可忽略 `member-question/received`、一条 Decision Brief `agent/inbox/spliced` 注入、idle 且零模型请求、传输文档 cache 隔离、receiver 终态提交后恰好一条可忽略 settled 事件、flush 失败重试且不重复 settled 事件、Host 重启回放持久终态、到达 flush 失败保持 `materialized` 为 false 直至重试、拒绝为未物化身份创建 Session，以及 materializer disposer 回滚。Loader 组合从 `cordis.yml` 把 AgentLoop 作为 factory 启动（`receivingTerminalRetryMs: 20`），并固定同一 brief 注入、idle 不唤醒、JSONL 身份、终态 settle、生产 timer 的 flush 重试、一次真实 `receiver.admitHumanTurn` AgentLoop 轮次及幂等 rpcId 重放，以及拒绝未知 receiving Session。Client Runtime tests 固定 Host-id 投影、本地回答页脚省略与 answered-elsewhere band。Keyless Web assembled coverage 与归属 snapshot 仍要求 Workspace 分组、brief 先于 human 的注入上下文、回答前对话与回答后对话，且到达不产生模型请求；这些套件目前仍调用 ApiProxy 的 `sessions.create`/`prompt`/`admitHumanTurn`，尚未改写到 Session Controller 与生成的 receiver Remote。
