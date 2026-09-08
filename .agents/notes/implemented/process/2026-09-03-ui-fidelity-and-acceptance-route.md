# Agent Note: UI fidelity gate and a dedicated acceptance route

Status: implemented

English | [中文](2026-09-03-ui-fidelity-and-acceptance-route.zh.md)

## Problem

A GUI specification can link a frozen prototype draft and still ship an implementation the human does not recognize. Ticket writers prove a smoke path. Code review reads the spec as prose. Neither session compares the running product to the draft, so layout, chrome, and affordance drift until headed review.

The same coordinating session then starts a headed instance for the user. Required data, Platform config, and leftover processes are still the writer's leftovers. The human hits the first blocked step of a feature they were asked to accept as a whole.

## Decision

A GUI specification names two planning artifacts before implementation dispatch: the [frozen high-fidelity draft](2026-09-02-fused-ui-prototype-variants.md) already required by [`to-spec`](../../../skills/to-spec/SKILL.md), and an **experience route**. The route is an ordered walk of every in-scope user story. Each step names the starting state, the action, the screen that must match the draft, and the observable result. Out-of-scope stories stay off the route.

After every GUI ticket is on the specification branch, [delivery orchestration](../../../skills/orchestrate-dsh-delivery/SKILL.md) dispatches a **fidelity writer**, not the root session. That writer starts one headless Desktop instance through [`dsh-desktop-test-instance`](../../../skills/dsh-desktop-test-instance/SKILL.md), opens each route screen, and compares it to the frozen draft (PNG/GIF on `gif-assets` and the throwaway prototype branch). The bar is the same chrome, component library, information hierarchy, and primary affordance. Pixel-identity is not required. A mismatch is a finding for the owning ticket writer. Headed human review waits until those findings are gone.

It then dispatches a **dedicated acceptance-environment session**. That session is not the root and not a ticket writer. It stops leftover instances for the goal, starts one fresh isolated Desktop, chooses fixture versus live Platform from the scenario, seeds the data the route needs, and walks the entire experience route headless. Every launch and relaunch starts from Desktop's credential-safe environment, adds only the scenario's named inputs, and validates every credential-like name against the scenario's credential-name allowlist before spawn. Existing host inspection may additionally verify environment-variable names on the actual Electron Main and Web Host processes; when no name-only inspection is available, the report records that check as unknown. No environment value is displayed or recorded. An unexpected credential-like name fails preparation and stops the instance.

A blocked route step is a writer fix or a reported human blocker; it is not a headed handoff. After the complete headless walk, the reviewed head is frozen and the required visual evidence is recorded from the actual product window into retained gitignored artifacts. Before starting the headed replacement, the session gives the user one acceptance report tied to that source or package identity: real product-path E2E screenshots and GIF with device or fixture provenance, the actual TDD RED and GREEN commands, exit results, logs, and behaviors or an explicit missing-RED statement, a readable `show-me` diff, and reproducible acceptance steps. The visual diff explains the change without substituting for product evidence. The report then carries the route, URL or window, and starting state into headed review; the observed route result and teardown result remain separate.

[Root-session orchestration](2026-09-03-root-session-orchestrates-only.md) still forbids the coordinating session from implementing, launching the acceptance instance, or walking the route.

## Alternatives considered

**Treat code-review Spec as visual fidelity.** Spec review reads the issue. It does not open the product next to the draft, so chrome and hierarchy can pass while looking like a different page.

**Let each ticket writer prove only its slice.** Slice smokes miss the assembled walk the human is asked to complete. The acceptance session owns the whole route.

**Let the root session prepare the headed instance.** That is the leftover-process failure. A dedicated session owns one goal's Desktop inventory through the runtime memo.

**Inherit the acceptance agent's shell and rely on output redaction.** Redaction protects diagnostics after launch; it cannot prevent an ambient credential variable from changing the product's configuration. A credential-safe environment plus a name-only check makes the launched inputs reviewable without reading secret values.

**Require pixel-perfect screenshot diffs.** Host chrome, font raster, and window size move. Matching product language and affordance catches the drift users report; pixel identity does not.

## Consequences

A GUI spec cannot ship without a draft pointer and an experience route. Implementation cannot reach headed review with an uncompared UI, a blocked walk, an unverified launch environment, or an incomplete acceptance report. The human starts at a state the route already completed headless and receives evidence tied to the reviewed build.

Fidelity comparison and the acceptance walk each add a writer and a headless Desktop. They delay headed review until those writers pass. A missing draft, a missing route, or a blocked step stops delivery instead of asking the user to debug the environment.
