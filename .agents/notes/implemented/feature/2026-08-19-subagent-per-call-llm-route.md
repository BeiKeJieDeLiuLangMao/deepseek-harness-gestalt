# Agent Note: Per-call LLM provider and model on subagent

Status: implemented

English | [中文](2026-08-19-subagent-per-call-llm-route.zh.md)

## Problem

A parent model cannot send one delegated child to a different LLM route. Each `dsh-tool-subagent` instance either inherits the parent's live provider and model or uses a deployment-pinned `agentOptions` block. Workflow already forwards per-child `provider` and `model` through `request.agentOptions`; the model-facing tool did not. Out-of-process backends silently ignored that field.

## Decision

`SubagentCapabilities.agentOptions` is the start-time flag for `request.agentOptions`. In-process spawn and fork advertise it. ACP, Codex, Claude Code, and the SDK backend advertise it false through `NO_START_CAPABILITIES`. One-shot `start` rejects any present `agentOptions` with `UNSUPPORTED_CAPABILITY` when the flag is false.

On a capable backend, the model-facing tool exposes optional `provider` and `model` strings. Those names are the LLM adapter route and model id (for example `deepseek-official` and `deepseek-v4-pro`), not the tool's configured subagent backend. Either field may be supplied alone. Call values override deployment `agentOptions`; omitted fields keep that default, then inherit the parent session route. Empty or whitespace values fail before start. An incapable backend omits the fields, refuses a deployment pin at mount, and rejects undeclared extra keys at execute.

Transport backend selection stays config: one tool instance still binds one of spawn, fork, ACP, and so on. [The capability-seam note](2026-06-21-subagent-capability-seam.md) records that split. Explicit `request.agentOptions` still wins over [live parent-route inheritance](../bug-fix/2026-08-18-subagent-inherits-live-parent-model.md).

## Alternatives considered

**Always show `provider`/`model` and ignore them on ACP/Codex.** Violates the seam rule that an unsupported start-time option is rejected, never accepted-then-ignored.

**Treat the new fields as a transport selector.** Would collapse spawn versus fork into one schema enum and undo the one-tool-one-backend binding.

**Enumerate `listProviders()`/`listModels()` in the schema.** Catalog entries are advisory and change with adapter topology, which would churn the parent KV-cache prefix. Invalid routes still fail through the existing adapter miss.

**Ship `effort` in the same slice.** Reasoning effort is adapter-owned and model-specific; workflow already defers it.

## Consequences

A capable `subagent` or `subagent_fork` call can send Flash work to a Pro parent, or the reverse, without another tool instance. A deployment `agentOptions` pin is a default, not a ceiling. Workflow `agent({ provider, model })` against an incapable backend now fails loud. Fork children that change route still receive the inherited completed-turn seed; prefix reuse under the new route is not promised.

## Testing

`packages/subagent/subagent/tests/service.spec.ts` rejects unsupported `agentOptions` before provider startup. `packages/subagent/tool-subagent/tests/tool-subagent.spec.ts` pins schema presence, call-over-config merge, provider-only and model-only forwarding, mount refusal, extra-key refusal, and empty-field refusal. Keyless assembled tool-schema snapshots record the new optional fields on spawn/fork tools and their absence on product backends.
