# Agent Note: Tandem Browser Runtime provider

Status: implemented

English | [中文](2026-08-18-tandem-browser-runtime-provider.zh.md)

## Problem

The Browser Runtime capability has one keyless deterministic Provider. Driving a real browser requires a Provider that owns a live browser process, survives its crashes truthfully, and stays inside DSH's process and identity contracts without vendoring upstream source.

## Decision

`dsh-browser-runtime-tandem` is a managed HTTP Service Provider with `inject: ['subprocess']`. It spawns the Tandem Browser child at the pinned upstream revision `3b613cfd4c299609ca7ca415d638c1b71c6ba5de` (version 1.11.4), constrains `baseUrl` to an absolute loopback HTTP origin, reads the bearer token from `tokenFile`, and polls `GET /agent/version` plus `GET /status` under `startupTimeoutMs` before admitting work. All configuration — `command`, `args`, `cwd`, `env`, `baseUrl`, `tokenFile`, `idPrefix`, `startupTimeoutMs`, `requestTimeoutMs`, `healthPollMs`, `pageSettleMs`, `reconnectAttempts`, `reconnectDelayMs`, `processGraceMs`, `maxResponseBytes` — is validated plugin config; no deployment-varying value is hardcoded.

Protocol fidelity is limited to the pinned revision, exported as `TANDEM_UPSTREAM_REVISION` and `TANDEM_UPSTREAM_VERSION`. The endpoints used are `POST /sessions/create`, `POST /sessions/destroy`, `GET /tabs/list`, `POST /tabs/focus`, `POST /navigate`, `GET /page-content`, and `GET /screenshot`, all authenticated with the bearer token and bounded by `requestTimeoutMs` and `maxResponseBytes`. Page reads carry provider-owned `settleMs`/`timeout`/`minLength` query bounds because the upstream route otherwise waits its internal 10-second settle window on short static pages. Responses that the pinned revision cannot produce — wrong shapes, empty strings where ids are required, oversized bodies — reject with `BROWSER_PROTOCOL`; transport and process failures reject with `BROWSER_RUNTIME_UNAVAILABLE`.

The Provider admits temporary and named persistent Profiles on one managed child. Each Profile maps to one Tandem session and a `persist:session-*` partition, with DSH-owned opaque Profile/Workspace/browser identities from `idPrefix`. Operations serialize through one queue; mutations check `expectedRevision` exactly. A failed later create leaves an already-open Profile's child running. Disposal stops admission, drains the queue, destroys remaining sessions, and joins the process tree under `processGraceMs`.

`BrowserRuntimeState` extends with `BrowserUnavailableState` (`status: 'unavailable'`, target, revision, reason `crashed` | `unhealthy` | `reconnect-failed`, `reconnecting`) because a live-process Provider has a failure mode the deterministic tracer cannot express: the process exists, the target identity remains meaningful, and service may return. An unexpected child exit or failed health probe commits `unavailable` with `reconnecting` set from configuration, attempts up to `reconnectAttempts` restarts, and on success re-commits open page state at the next revision with the same target; exhausted reconnects commit `reconnect-failed`. While unavailable, operations on the target reject with `BROWSER_RUNTIME_UNAVAILABLE` — the projection never reports stale page facts as open state. Two new error codes, `BROWSER_PROTOCOL` and `BROWSER_RUNTIME_UNAVAILABLE`, carry the malformed-response and lost-runtime classes.

Provenance lives in the package's `UPSTREAM.md` (pinned revision, version, MIT license, zero vendored source, no local modifications) and `THIRD_PARTY_NOTICES.md` (verbatim upstream MIT notice; no upstream code distributed). Upstream-contribution candidates recorded from delivery research: isolated sessions lack the default session's network security stack and extension loading; the session registry is memory-only; close vs forget vs wipe storage erasure is missing; the 257-tool MCP surface needs allowlists/profiles; `GET /page-content` needs caller-bounded settle waiting; the API binds all interfaces with remote access enabled by default; ownership/handoff has no event stream; Linux support is best-effort. The evaluation source is `.agents/research/2026-08-17-agent-browser-runtime-options.md`.

## Alternatives considered

**Vendor or fork the pinned Tandem source.** Rejected because the integration surface is the HTTP protocol; carrying source would import an Electron application's maintenance load and its upstream contribution candidates into this repository.

**Treat a crashed child as target loss (`BROWSER_CLOSED_STATE` or `BROWSER_NOT_FOUND`).** Rejected because close is a terminal receipt while a crashed process has a recoverable target; conflating them would either resurrect a terminal identity or hide the reconnect attempt from consumers.

**Let operations fail with transport errors until the child returns.** Rejected because consumers would retry against unknown state; the committed `unavailable` state with an explicit reason and `reconnecting` flag is the truthful projection.

**Drive Tandem through its 257-tool MCP surface.** Rejected for this Provider because the Browser Runtime seam already owns the operation vocabulary; an MCP hop would add a second tool surface without adding browser facts.

## Consequences

The capability seam has a live-browser Provider whose failure model is observable rather than fatal: consumers see truthful unavailable and reconnect states through the same `BrowserRuntimeState` union, and a crashed Tandem child recovers one target across process identity changes. The Provider depends on an external Tandem checkout at the pinned revision to run for real; tests run against an in-repository HTTP fixture. Named persistent Browser Profiles reuse `persist:session-*` partitions through the same Provider. Session-local multi-instance and multi-tab ownership lives in the [Session Browser Workspace Agent Note](2026-08-19-session-browser-workspace.md); human and Agent control of one tab lives in the [browser control arbitration Agent Note](2026-08-19-browser-control-arbitration.md). See the [persistent Browser Profile Agent Note](2026-08-19-persistent-browser-profiles.md).

## Verification

- `pnpm vitest run packages/browser/browser-runtime-tandem` — lifecycle, health, crash/reconnect projection, protocol rejection, and teardown against the in-repository Tandem HTTP fixture.
- `pnpm run test:coverage packages/browser/browser-runtime-tandem` — per-file coverage gate over the package source.
- `pnpm run test:snapshot -t tandem` — the `browser-runtime-tandem` headless snapshot scenario (tool_search → browser_create → browser_navigate → browser_observe → browser_screenshot → browser_focus → browser_close against a local Tandem HTTP fixture).
- Real-Tandem e2e is gated by `DSH_TANDEM_CHECKOUT` (checkout of the pinned revision) and `DSH_TANDEM_BIN` (Tandem executable inside it); both unset skips.
