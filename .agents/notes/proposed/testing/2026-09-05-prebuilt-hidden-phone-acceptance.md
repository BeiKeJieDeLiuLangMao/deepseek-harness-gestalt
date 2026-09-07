# Agent Note: Prebuilt hidden phone acceptance

English | [中文](2026-09-05-prebuilt-hidden-phone-acceptance.zh.md)

Status: proposed

## Problem

A click-only playback check needs the built Desktop composition without rebuilding shared artifacts or running unrelated Agent/device lanes. A child `close` wait can hang on inherited pipes, and deleting scratch after failed cleanup removes ownership evidence.

## Proposal

Use one test-only prebuilt wrapper with a root-reviewed published-SHA input graph, a protected-process inventory younger than 60 seconds at spawn, the hidden E2E profile, existing phone helpers, and opt-in held synthetic H264 streams. The graph binds every declared component identity to canonical file realpaths and hashes, and binds the actual Node, WDIO, Electron, Desktop main, operated Platform config, helpers, fixture, and complete Host/Client/Web closure. The runner rechecks it before spawn and after exit. A complete graph is an external build-owner prerequisite; source does not fabricate one.

Persist direct launcher ownership before readiness, observe `exit` independently of pipe `close`, and memoize bounded completion. A normal zero exit succeeds only after the smoke log contains one ready Host, that exact Host's `requestedStop=stop` exit, and the success-only `shutdown complete` receipt, with zero model requests and closed Host, fake, and CDP listeners. Production owners join the Host and fake child handles before publishing the receipt. Recovery retains scratch and may TERM only the captured direct launcher; discovery predicates never grant signal authority. No fixture IPC or process broker participates.

Launch with an explicit keyless child environment, fresh empty `HOME`, `DSH_HOME`, and `TMPDIR`, pinned fake executable, denying tool prefix, and rejecting loopback model provider. Reject credential fallback paths through metadata without reading them; copy no user settings or credentials.

The [Desktop Electron lane](../../implemented/testing/2026-08-31-desktop-phone-electron-e2e-lane.md) retains its broader scenario/build rationale. The [Host-generation ownership policy](../../implemented/testing/2026-09-05-bounded-host-generation-fixture-ownership.md) retains its native ownership constraints. Neither note is superseded: this wrapper is bounded graceful test support, not a production broker or native Host-SIGKILL containment guarantee.

## Alternatives considered

**Stock runner.** Its unconditional builds and unrelated scenarios do not fit one prebuilt click-only acceptance assignment.

**Await direct child close indefinitely.** Descendants can retain stdout after the launcher exits, preventing cleanup from starting.

**Delete scratch despite failed cleanup.** This destroys evidence while owned processes or listeners may remain alive.

## Acceptance criteria

Fake-child checks cover zero and nonzero exit, inherited-pipe retention, verifier failure, direct-launcher recovery, unknown-observer isolation, and successful completion once. Pure checks reject changed component identities, realpath escapes, stale inventory, credential fallbacks, mismatched Host exits, and missing receipts. The byte fixture verifies held H264 bytes and release/end control. Root review of a complete graph precedes any Desktop execution. The actual route requires waiting, nonuniform current-canvas pixels, visible decoded fallback, replacement waiting/repaint, graceful shutdown evidence, and listener closure.

## Risks

The component graph proves the reviewed listed inputs, but build-owner review must still establish that its Host/Client/Web lists are complete. Same-user filesystem access, network confinement, absolute device commands, stale decoder callbacks, failed MJPEG, physical hardware, and native crash containment require independent evidence. No complete graph or real Desktop result is stored with this proposal. The [lane reference](../../../../apps/desktop/tests/e2e-electron/README.md) owns execution prerequisites and limitations.
