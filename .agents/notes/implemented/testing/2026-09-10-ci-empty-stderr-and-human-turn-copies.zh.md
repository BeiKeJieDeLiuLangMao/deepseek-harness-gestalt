# Agent Note: 空 stderr 尾与唯一 human-turn 副本

Status: implemented

[English](2026-09-10-ci-empty-stderr-and-human-turn-copies.md) | 中文

## Problem

覆盖率清单要求 `mobilecli-phone-runtime.ts` 的每个分支都有行为用例，包括 `tailOf` 在子进程 stderr 为空时的路径。fakemobilecli 的 listen banner 总会写入 stderr，因此 readiness 超时与就绪前退出从未观察到 `(empty)`。

组装后的成员提问 admission 会把一次 human turn 同时记为 `agent/inbox/spliced`，并在领取后记为 `user/message`。把这两类事件按并集计数时，即使 Host 重试并未复制 Session 或 turn，同一 `rpcId` 也会被报告为两份。

## Decision

fake 二进制接受 `quiet` 旋钮，抑制 listen banner 与 exit-fast 的 stderr 行。phone-runtime 服务套件让安静的挂起 server 超时，并断言 readiness 失败消息以 `(empty)` 结尾。

成员提问接收 e2e 把同一 human-turn id 的副本数计为 `user/message` 次数与匹配的 `agent/inbox/spliced` 插入次数中的较大值。各出现一次仍是同一 turn；同一类型出现两次才是重复。

## Alternatives considered

**忽略空 `tailOf` 分支。** 否决：手机覆盖率清单禁止逐文件排除或降低阈值。

**继续按事件类型并集计数。** 否决：成功的 `followup` 加领取就是生产日志，不是第二次 prompt。

**加长等待并保留原来的 length 断言。** 否决：失败来自两类事件的身份，不是额外轮询可以折叠的竞态。

## Consequences

安静的 fakemobilecli 启动仅用于测试。产品 readiness 诊断仍追加最多 2000 字符的 stderr 尾，或 `(empty)`。admission 重试仍拒绝第二个 Session、`turn/start`，以及任一人 turn 事件类型的第二份副本。

## Testing

安静挂起用例位于 `packages/phone/phone-runtime/tests/service.spec.ts`。唯一副本计数位于 `apps/web/tests/member-question-receiving.e2e.ts`，覆盖 post-create、post-record、post-prompt 以及保留的 Host 重启 admission。
