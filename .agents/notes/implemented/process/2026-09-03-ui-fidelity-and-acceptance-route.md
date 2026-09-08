# Agent Note: UI fidelity gate and a dedicated acceptance route

Status: implemented

English | [中文](2026-09-03-ui-fidelity-and-acceptance-route.zh.md)

## Problem

A GUI specification can link a frozen prototype draft and still ship an implementation the human does not recognize. Ticket writers prove a smoke path. Code review reads the spec as prose. Neither session compares the running product to the draft, so layout, chrome, and affordance drift until headed review.

The same coordinating session then starts a headed instance for the user. Required data, Platform config, and leftover processes are still the writer's leftovers. The human hits the first blocked step of a feature they were asked to accept as a whole.

## Decision

A GUI specification names two planning artifacts before implementation dispatch: the [frozen high-fidelity draft](2026-09-02-fused-ui-prototype-variants.md) already required by [`to-spec`](../../../skills/to-spec/SKILL.md), and an **experience route**. The route is an ordered walk of every in-scope user story. Each step names the starting state, the action, the screen that must match the draft, and the observable result. Out-of-scope stories stay off the route.

After every GUI ticket is on the specification branch, [delivery orchestration](../../../skills/orchestrate-dsh-delivery/SKILL.md) dispatches a **Codex fidelity session with computer use**, not the root session. That session starts one isolated Desktop through [`dsh-desktop-test-instance`](../../../skills/dsh-desktop-test-instance/SKILL.md), prefers background control, then a proven headless route, then headed foreground control, and opens each screen through user-level input. It compares the actual Electron route to the frozen draft (PNG/GIF on `gif-assets` and the throwaway prototype branch). A standalone Web page, scripted DOM, or direct Electron IPC is not native fidelity evidence. The bar is the same chrome, component library, information hierarchy, and primary affordance. Pixel-identity is not required. A mismatch is a finding for the owning ticket writer. Human review waits until those findings are gone.

It then dispatches a **dedicated Codex acceptance-environment session with computer use**. That session is not the root and not a ticket writer. It stops leftover instances for the goal, starts one fresh isolated Desktop, chooses fixture versus live Platform from the scenario, seeds the data the route needs, and walks the entire actual Electron route through user-level input. It follows the same least-disruptive mode order, records the proven control path and any fallback reason, and remains the only desktop-input owner through rebuilds, diagnosis, re-walks, and cleanup. A blocked step is a writer fix or a reported human blocker. Only a complete agent walk starts the user handoff. The session then gives the user the route, application or window, and starting state.

[Root-session orchestration](2026-09-03-root-session-orchestrates-only.md) still forbids the coordinating session from implementing, launching the acceptance instance, or walking the route.

## Alternatives considered

**Treat code-review Spec as visual fidelity.** Spec review reads the issue. It does not open the product next to the draft, so chrome and hierarchy can pass while looking like a different page.

**Let each ticket writer prove only its slice.** Slice smokes miss the assembled walk the human is asked to complete. The acceptance session owns the whole route.

**Let the root session prepare the acceptance instance.** That is the leftover-process failure. A dedicated session owns one goal's Desktop inventory and computer-use input through the runtime memo.

**Use scripted Electron or Web checks as the acceptance walk.** Those checks retain their deterministic evidence, but they cannot establish the actual native route when they bypass user-level input or Electron-only behavior.

**Require pixel-perfect screenshot diffs.** Host chrome, font raster, and window size move. Matching product language and affordance catches the drift users report; pixel identity does not.

## Consequences

A GUI spec cannot ship without a draft pointer and an experience route. Implementation cannot reach human review with an uncompared UI or a blocked walk. The user receives a state that the Codex session already completed through the actual product route.

Fidelity comparison and the acceptance walk each add a dedicated Codex validation responsibility, but stable owner sessions may carry repeated fixes without multiplying sessions. Background control minimizes disruption when it is proven; headless and headed fallbacks require their own evidence. A missing draft, route, computer-use path, or completed step stops delivery instead of asking the user to debug the environment.
