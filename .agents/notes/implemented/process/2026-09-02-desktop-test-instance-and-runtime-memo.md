# Agent Note: Desktop test instance and runtime memo

Status: implemented

English | [中文](2026-09-02-desktop-test-instance-and-runtime-memo.zh.md)

## Problem

Agent-started Desktop Electron instances and ego-lite task spaces had no durable local inventory. A request to start a test program often launched another visible window beside leftover Host, PostgreSQL, sidecar, scratch-home, and SysV shared-memory state from the same goal. Browser work could create a new DSH task space on later rounds even when the first space still existed. Native GUI checks also assumed headless Electron was observable without proving that the current computer-use integration could capture and control the hidden window. Model calls from those instances had no rule that they inherit the provider catalog already stored in the normal DSH Home. `pnpm gestalt:dev` also requires an operated Platform config and does not default one, so agents stalled for a human login instead of choosing the fixture or a generated production identity from the scenario.

## Decision

[`dsh-desktop-test-instance`](../../../skills/dsh-desktop-test-instance/SKILL.md) owns agent-started Desktop test Electron lifecycle. One user goal has one instance and one active desktop-input owner. The agent stops the recorded instance, then any other live test processes for that goal, before a replacement starts. Native product GUI checks use the verified [macOS background computer-use](https://learn.chatgpt.com/docs/computer-use#when-to-use-computer-use) route against the actual isolated Electron. [CUA availability evidence](../../../skills/dsh-desktop-test-instance/CUA-AVAILABILITY.md) distinguishes configured MCP access from a callable formal Codex turn and from a completed route. The session must capture the exact application, send user-level input, observe the resulting UI, and preserve the user's foreground application. Another driver or execution mode requires an explicit user scope change and is never an automatic replacement.

The macOS reference proof uses a byte-identical DSH 0.1.15 application copy at a unique path while retaining its original Developer ID signature, `open -g -j -n -a "$appPath" --env "DSH_HOME=$scratchDshHome" --args "--user-data-dir=$scratchUserData"`, and computer use bound to that exact path. It matched the test process and Host, captured the fresh UI, clicked through onboarding, opened Settings, entered search text, observed the result, and kept ChatGPT foreground throughout; `-g` without `-j` brought DSH foreground. This proves that version's background control bootstrap, not pointer immobility, an arbitrary target build, or a complete product E2E. A target build may be unsigned; its copy remains byte-identical and preserves whatever signature it already has.

The session drives the requested product route through the fixed background path. If that path cannot complete a required step, the same owner diagnoses the exact cause and reports the blocker. Human review starts only after the agent completes the route. The agent chooses the operated Platform config from the scenario: `apps/desktop/tests/fixtures/operated-platform.json` unless the run must talk to live Platform or the diff changes Platform identity, callback, Relay, or companion-attachment fields. A keyless run copies no model configuration; an explicitly authorized model-calling instance blind-copies only `settings.yaml` and `.credentials.yaml` from the normal DSH Home through `copyModelConfiguration` in `scripts/web-acceptance.ts` and does not invent provider models.

`.agents/local/runtime-memo.json` is gitignored checkout-local inventory. Desktop records the exact application path, revision, background control status, input owner, PIDs, ports, and scratch paths there; [`ego-browser`](../../../skills/ego-browser/SKILL.md) records the live DSH task-space id in the same file and reuses that id until the user asks for a fresh space, the goal changes, or the recorded space is gone. Creating a second DSH space while the first still exists fails the round.

[`orchestrate-dsh-delivery`](../../../skills/orchestrate-dsh-delivery/SKILL.md) points at those two skills for GUI smoke, fidelity comparison, the dedicated acceptance walk, and browser work. Automated unit, protocol, snapshot, and Electron lanes such as `pnpm --dir apps/desktop test:e2e-sub2api` retain their own drivers and teardown. They complement the Codex computer-use route but do not replace its native GUI evidence. [The fidelity-and-acceptance-route decision](2026-09-03-ui-fidelity-and-acceptance-route.md) owns the dedicated validation sessions and human handoff.

## Alternatives considered

**Write the launch and cleanup steps into root `AGENTS.md`.** Those steps fire only on Desktop or browser work. A standing-order paragraph would spend context on every turn.

**Store process ids only in conversation.** Sessions compact, fork, and restart. A gitignored memo is the inventory a later round can read without reconstructing PIDs from chat.

**Kill leftovers with a command-line substring match.** A pattern that matches the cleanup shell, or another project's PostgreSQL, is not an exact owner. Recorded PIDs and paths are the stop list.

**Let test instances share the user's normal `DSH_HOME`.** That mixes test state into the installed product home and can leave the user's provider catalog dirty. The scratch copy is the isolation.

**Use scripted DOM or Electron IPC checks as native product acceptance.** Those checks retain deterministic CI value, but they bypass the user-level route whose behavior this acceptance must establish.

**Automatically change the control route after a failure.** That changes the evidence contract and can hide a regression in the prescribed background path. A different driver or mode needs an explicit user scope change.

**Wait for the user to ask for a real Platform login before every Desktop start.** `gestalt:dev` needs a config, not a human decision. The scenario already tells whether live Platform is in play.

**Hard-code `gestalt:dev` to the test fixture.** Release packaging and live Platform runs need the generated production identity. The fixture is the default only when the scenario does not touch Platform.

**Create a new ego task space whenever a heredoc starts.** Ego runtimes forget in-process bindings across heredocs, but the task space itself can persist. The memo plus `listTaskSpaces()` is the reuse check.

## Consequences

Agents can replace a test Electron without leaving a second window, Host, or database on the machine, and browser work stays in one DSH space for the goal. Native acceptance uses the verified macOS background path and reports a blocker when that path cannot complete the requested route. Model calls from those instances use the installed provider catalog instead of a fixture default.

The memo is local and can go stale; a missing process deletes its record rather than blocking the next start. Human review waits for the agent's complete background computer-use route. Automated Electron lanes remain responsible for their own survivors and remain necessary CI evidence. A live-Platform run still needs Environment fields for `write-operated-platform-config.mjs`; the fixture cannot stand in for that identity.
