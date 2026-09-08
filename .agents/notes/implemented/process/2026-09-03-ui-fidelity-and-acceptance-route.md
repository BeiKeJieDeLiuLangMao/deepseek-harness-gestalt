# Agent Note: UI fidelity gate and a dedicated acceptance route

Status: implemented

English | [中文](2026-09-03-ui-fidelity-and-acceptance-route.zh.md)

## Problem

A GUI specification can link a frozen prototype draft and still ship an implementation the human does not recognize. Ticket writers prove a smoke path. Code review reads the spec as prose. Neither session compares the running product to the draft, so layout, chrome, and affordance drift until headed review.

The same coordinating session then starts a headed instance for the user. Required data, Platform config, and leftover processes are still the writer's leftovers. The human hits the first blocked step of a feature they were asked to accept as a whole.

## Decision

A GUI specification names two planning artifacts before implementation dispatch: the [frozen high-fidelity draft](2026-09-02-fused-ui-prototype-variants.md) already required by [`to-spec`](../../../skills/to-spec/SKILL.md), and an **experience route**. The route is an ordered walk of every in-scope user story. Each step names the starting state, the action, the screen that must match the draft, and the observable result. Out-of-scope stories stay off the route.

After every GUI ticket is on the specification branch, [delivery orchestration](../../../skills/orchestrate-dsh-delivery/SKILL.md) dispatches a **Codex fidelity session with computer use**, not the root session. That session starts one isolated Desktop through the verified macOS background path in [`dsh-desktop-test-instance`](../../../skills/dsh-desktop-test-instance/SKILL.md) and opens each screen through user-level input. It compares the actual Electron route to the frozen draft (PNG/GIF on `gif-assets` and the throwaway prototype branch). Evidence from another driver or execution mode does not satisfy this workflow without an explicit user scope change. The bar is the same chrome, component library, information hierarchy, and primary affordance. Pixel-identity is not required. A mismatch is a finding for the owning ticket writer. Human review waits until those findings are gone.

It then dispatches a **dedicated Codex acceptance-environment session with computer use**. That session is not the root and not a ticket writer. It stops leftover instances for the goal and starts one fresh isolated Desktop through the same background path. Every launch and relaunch starts from Desktop's credential-safe environment, adds only the scenario's named inputs, and validates every credential-like name against the scenario's credential-name allowlist before spawn. Existing host inspection may additionally verify environment-variable names on the actual Electron Main and Web Host processes; when no name-only inspection is available, the report records that check as unknown. No environment value is displayed or recorded. An unexpected credential-like name fails preparation and stops the instance. The session chooses fixture versus live Platform from the scenario, seeds the data the route needs, and walks the entire actual Electron route through user-level input. It records the verified application and remains the only desktop-input owner through rebuilds, diagnosis, re-walks, and cleanup. A blocked step is a writer fix or a reported human blocker; the session does not switch drivers or execution modes.

After the complete background walk, the reviewed head is frozen and the required visual evidence is recorded from the actual product window into retained gitignored artifacts. Before user handoff, the session gives one acceptance report tied to that source or package identity: real product-path E2E screenshots and GIF with device or fixture provenance, the actual TDD RED and GREEN commands, exit results, logs, and behaviors or an explicit missing-RED statement, a readable `show-me` diff, and reproducible acceptance steps. The visual diff explains the change without substituting for product evidence. The report carries the route, exact application path, and starting state into human review; the observed route result and teardown result remain separate.

[Root-session orchestration](2026-09-03-root-session-orchestrates-only.md) still forbids the coordinating session from implementing, launching the acceptance instance, or walking the route.

## Alternatives considered

**Treat code-review Spec as visual fidelity.** Spec review reads the issue. It does not open the product next to the draft, so chrome and hierarchy can pass while looking like a different page.

**Let each ticket writer prove only its slice.** Slice smokes miss the assembled walk the human is asked to complete. The acceptance session owns the whole route.

**Let the root session prepare the acceptance instance.** That is the leftover-process failure. A dedicated session owns one goal's Desktop inventory and computer-use input through the runtime memo.

**Use another driver as the acceptance walk.** Deterministic checks retain their own evidence, but they do not complete the background computer-use route prescribed here.

**Inherit the acceptance agent's shell and rely on output redaction.** Redaction protects diagnostics after launch; it cannot prevent an ambient credential variable from changing the product's configuration. A credential-safe environment plus a name-only check makes the launched inputs reviewable without reading secret values.

**Require pixel-perfect screenshot diffs.** Host chrome, font raster, and window size move. Matching product language and affordance catches the drift users report; pixel identity does not.

## Consequences

A GUI spec cannot ship without a draft pointer and an experience route. Implementation cannot reach human review with an uncompared UI, a blocked walk, an unverified launch environment, or an incomplete acceptance report. The user receives evidence tied to the reviewed build and a state that the Codex session already completed through the actual product route.

Fidelity comparison and the acceptance walk each add a dedicated Codex validation responsibility, but stable owner sessions may carry repeated fixes without multiplying sessions. Both validations use the verified macOS background path. A missing draft, route, or computer-use path, or an incomplete route step, stops delivery instead of asking the user to debug the environment or changing the evidence scope automatically.
