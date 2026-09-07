# Agent Note: Forked child lifecycle is composition-owned

Status: implemented

English | [中文](2026-08-10-fork-children-stay-one-shot.zh.md)

## Problem

Fork's only difference from spawn is that the child Session is seeded with the parent's completed-turn prefix ([subagent-fork-in-process](../../../../packages/subagent/subagent-fork-in-process/README.md)). That seed costs real tokens because every child request resends the inherited history. Its concrete payoff is provider-side prefix reuse: under the same provider and model, a child request whose leading bytes match the parent's does not prefill the shared span again. Anything a child scope adds ahead of the inherited history spends that payoff because reuse stops at the first differing byte.

Direction-specific child messaging once added a child-only tool schema and system-prompt section before the inherited turns. The [adjacent-Agent messaging decision](2026-08-27-adjacent-agent-steer-messaging.md) removed those request-head deltas: parents and continuable children now inherit the same `send_message` definition and order, while the child's parent id and return guidance live in its initial user task after the fork prefix. Prefix reuse and lifecycle selection are therefore independent composition choices.

## Decision

The [base bundle](../../../../packages/bundle/base/cordis.patch.yml) binds the fork delegation tool to `backgroundMode: one-shot`. The standard, PTC, and Cordis agent presets override that row to `continuable`. Both modes preserve the inherited request prefix because their request-head tool definitions and order match the parent.

One-shot children, foreground and background alike, are created through `SubagentRuntime.start()` and return one result before disposal. Continuable children are created through `SubagentRuntime.startContinuable()`; `ForkInProcessProvider.prepareContinuable` captures the prefix once because it becomes the child's durable transcript, and the caller receives a stable child id for later adjacent-Agent messages and interruption.

Spawn remains `continuable` in the base composition. Unlike fork, a spawned child has no inherited transcript to reuse, so its lifecycle choice carries no prefix-reuse condition.

### The selection is composition, not provider code

`ForkInProcessProvider` implements both `start` and `prepareContinuable`, and `tool-subagent` selects one through `backgroundMode`. A continuable selection fails loud only when the chosen provider does not expose `prepareContinuable`; the fork provider does. Bundle and preset rows therefore own whether one call returns a result or a durable id.

A deployment may override either choice with a bundle or profile patch. The provider keeps persona, tool-filter, output, depth, and model-routing capabilities explicit, so a caller-selected delta remains visible as a possible prefix difference.

## Alternatives considered

**Reject `inheritsParentContext` + `continuable` at mount.** Rejected because the unified messaging definition and post-prefix return guidance make this combination valid. The provider would be rejecting a composition it can execute without losing the inherited request prefix.

**Stop mounting the fork provider.** Rejected because both lifecycle modes retain the seeded-context capability, and foreground one-shot fork still returns a direct result.

**Force every shipped fork to one-shot.** Rejected because the standard, PTC, and Cordis presets deliberately expose durable adjacent-Agent collaboration. Their continuable fork preserves the same prefix as the parent.

**Restore a child-only report tool.** Rejected by [adjacent-Agent messaging](2026-08-27-adjacent-agent-steer-messaging.md): a separate schema and prompt section duplicate one operation and make parent and child request heads differ.

**Put dynamic parent guidance in the request head.** Rejected because the parent id varies per activation. The initial user task can carry it after inherited history without changing the reusable prefix.

## Consequences

- Forks created directly from the base bundle are one-shot; the standard, PTC, and Cordis presets create continuable forks.
- A forked child's reusable request prefix remains equal to its parent's unless the deployment selects a different persona, tool filter, or model route.
- One-shot fork returns its result to the caller's turn. Continuable fork returns a durable id and accepts adjacent `send_message` and interrupt operations.
- Manager-owned settlement notices remain separate from model-authored child messages and cover terminal outcomes when a child cannot cooperate.

### Accepted risks

Lifecycle is a configuration choice. A custom layer can switch a fork tool between one-shot and continuable, or add a child-only request-head contribution that reduces prefix reuse. The provider reports the selected lifecycle and applies the requested deltas, while the deployment owns their token-cost tradeoff.
