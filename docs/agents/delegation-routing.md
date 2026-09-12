# Delegation routing and context reuse

English | [中文](delegation-routing.zh.md)

Use this provider-neutral reference before dispatching or continuing a subagent. Delivery-specific roles and installation model priorities belong to [the delivery workflow](../../.agents/skills/orchestrate-dsh-delivery/SKILL.md) and its references.

## Decide whether to delegate

Use deterministic tools directly for file discovery, status, exact transformations, and small local checks. Delegate when a bounded independent task benefits from separate context, parallel work, a different model, or independent review. Keep one mutable writer per worktree; read-only investigation and review may run in parallel.

Define the deliverable, read/write scope, risk, acceptance evidence, required context, and independence before choosing a route. Follow the root task-language rule for subagent descriptions and todo content; it does not constrain internal child prompts. Source code and observable checks—not a model's confidence—decide acceptance.

## Select a route explicitly

Choose an available provider and model for the task, current user restrictions, verified input capabilities, and measured performance on comparable repository work. Pass route fields when the runtime supports them instead of assuming inheritance. Distinguish configured adapter capability, official product claims, and repository task evidence. A model name does not establish image input, tools, quota, billing, cache behavior, or benchmark rank.

Respect excluded routes and do not silently fall back. Read installation-specific priorities from their owning reference and verify the live catalog rather than static account counts. Diagnose quota exhaustion, rate limiting, authentication, network transport, and code failure separately.

## Reuse or replace an owner

Before creating a child, inspect relevant direct continuable children when the runtime provides that catalog. Ownership is delivery-scoped: reuse a suitable owner through implementation, checks, review findings, integration failures, and acceptance fixes. Batch coherent findings instead of creating one session or turn per ticket, error, or comment.

Continue a direct child when its evidence, scope, permissions, and model remain suitable and independence is unnecessary. Send a delta brief with the new objective, current base, invalidated facts, retained constraints, and completion evidence. `send_message` schedules a later FIFO turn; it cannot redirect the current turn, change provider/model, or change cwd.

Prefer a safe turn-boundary same-session model change only when the host explicitly supports it and its scope is understood. Otherwise report the limitation and let the coordinator decide whether a missing capability or required independence justifies replacement. Do not create automatic fresh-session churn. A host switch may persist as a global default.

Start a fresh child for independent review, unrelated work, an unavailable or systematically stale owner, or a capability the current owner cannot gain safely. Record the reason, current base, retained evidence, open findings, and next check. A repeated failure alone is not a routing reason; keep the owner and run a discriminating experiment.

Fork the parent only when the task genuinely requires decisions spread across completed parent turns and a concise brief would lose necessary context. Fork inherits completed conversation history, not the current in-flight turn, and is not independent review. In-process spawn/fork children inherit the parent session cwd and do not imply worktree, process, disk, credential, or authority isolation.

Only direct continuable children are follow-up targets. Do not inspect private session storage or other session logs to manufacture continuity. Persist durable decisions in specifications, Context documents, and Agent Notes.

## Supervise and accept

Merge feedback to a running writer into one versioned fix list delivered at a natural checkpoint. Scattered messages queue behind the running turn; an immediate safety stop may interrupt, but `interrupt_agent` stops only the current turn, preserves descendants, and parks queued turns until a later waking send.

While a normally running writer produces no new commit, failure, or completion event, rely on runtime completion notifications or one bounded managed wait. Re-verify git, CI, or child state after a change notification or reported result rather than polling for progress.

A dispatch brief names the deliverable, observable completion evidence, current commit or worktree delta, read/write scope, exclusions, relevant sources, required fact distinctions, checks actually run, and unresolved limitations. Reuse is valuable only while retained evidence outweighs stale context, correction cost, queue delay, and bias; do not claim persistent KV cache.
