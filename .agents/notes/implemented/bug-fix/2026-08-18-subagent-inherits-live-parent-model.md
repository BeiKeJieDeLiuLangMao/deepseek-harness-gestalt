# Agent Note: Subagents inherit the live parent model

Status: implemented

English | [中文](2026-08-18-subagent-inherits-live-parent-model.zh.md)

## Problem

A Web session's model switch updates the live `ModelSelection` used by the next parent prompt, and later parent turns log that route on `request/header`. Starting a subagent still copied `parent.options.provider` / `parent.options.model`, which stay at Agent creation. After switching from GLM to Grok, the parent talks to Grok while a new child still starts on GLM and fails.

## Decision

`inheritParentAgentRoute` is the single parent-route snapshot for in-process one-shot and continuable children, including the continuable descriptor. It prefers `liveModelSelection(parent)` (the same installed selection the next parent prompt uses), then the latest logged `request/header` config, then creation-time `AgentOptions`. An explicit `request.agentOptions` override still wins.

## Alternatives considered

**Read only the latest `request/header`.** Misses a switch that has not yet produced a parent turn, which is the usual "I changed the model, then started a subagent" path.

**Mutate `Agent.options` on `session.selectModel`.** Would make creation-time options a moving target for every other consumer of that object.

## Consequences

A child started after a parent model switch uses the route the parent is currently pointed at. Tests cover live selection, logged-header fallback, creation-time fallback, and an explicit child override.

## Testing

`packages/core/agent/tests/model-selection.spec.ts` pins `liveModelSelection` to the installed ref until dispose. `packages/subagent/subagent/tests/child-agent.spec.ts` pins the three inherit tiers and the explicit override.
