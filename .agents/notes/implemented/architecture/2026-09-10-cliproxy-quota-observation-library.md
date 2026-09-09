# Agent Note: the CLIProxyAPI quota observation library is a pure first-party package

Status: implemented

English | [中文](2026-09-10-cliproxy-quota-observation-library.zh.md)

## Problem

The [built-in account pool proposal](../../proposed/architecture/2026-09-09-built-in-cliproxyapi-account-pool.md) requires normalized quota observations for five account vendors without exposing the CLIProxyAPI management secret or the generic management request facility to the renderer. Issue #651 delivers the data plane of that requirement: probe construction, payload parsing, window normalization, and sanitization, ahead of the runtime owner (#650) that will inject the outbound channel.

## Decision

The capability is a pure library, [`@deepseek-ai/dsh-cliproxy-quota`](../../../../packages/llm/cliproxy-quota/README.md), not a cordis plugin and not a capability seam. It exports one factory — `createQuotaObserver({ transport })` — and defines the narrow `QuotaObservationTransport` contract the runtime owner injects. The library holds no process, no management secret, and no scheduling; its invariant companion registers an explained empty installer.

Probe construction, payload parsing, and window normalization are ported from the official CLIProxyAPI management center (router-for-me/Cli-Proxy-API-Management-Center at `ed5f1c48e11ba7335f1e8f676f228c280196af85`, MIT) rather than reinvented from UI evidence. The package NOTICE carries the license text, the upstream commit, and the module-level import map; each ported module's JSDoc names its upstream source. Adaptations are deliberate: i18next and theme coupling removed (window identity is a stable key; display naming belongs to the consumer's locale), and missing counters are never defaulted to zero where the management center's display rows did.

The port is read-only by construction. The upstream xAI paid health check pairs `/v1/me` with a real chat completion, so it is not ported and paid xAI accounts report `unsupported`; the Codex reset-credit consume operation does not exist in this package, while the read-only listing counts are retained. Every probe is a GET except the Antigravity quota-summary POST, whose body is only the project id.

Observation truth semantics follow the proposal: `known` / `partial` / `unsupported` / `failure` plus the sampling instant, with window fields absent when the source did not supply them and `periodHours: null` when the source left the duration undetermined (Antigravity accepts only `5h`/`five-hour`/`five_hour` and `weekly`/`week`). Consumers keep stale samples by comparing `observedAt`; the observer never retries, caches, or fabricates. Errors are bounded and credential-redacted even though probes never receive credentials.

## Alternatives considered

**Register a cordis service so consumers discover the observer through `ctx`.** Rejected because no second consumer exists to justify a Service Definition / Provider / Consumer seam, and the transport must stay Host-owned regardless of the observer's packaging.

**Keep the upstream xAI `/v1/me` profile read as a degraded paid-tier signal.** Rejected because a profile without quota counters does not change the `unsupported` verdict, and keeping it would split one behavioral rule across two probe paths.

**Port the management center's Claude profile request for plan metadata.** Rejected because Codex already carries `plan_type` in its usage payload and the proposal requires no other provider's plan marker; one fewer request per probe keeps the matrix honest.

## Consequences

The suite covers every provider's real data path through a fake trusted transport — allowed URLs, methods, and request fields, malformed and oversized payloads, credential-shaped error text, and the full probe-to-observation assembly for all five providers — 104 tests with per-file 100% coverage. The fake is a test double for the transport contract, not evidence about live provider endpoints: Kimi, xAI, and Antigravity payload shapes remain verified only against the upstream management center's parsers, and drift will surface as `failure` or `partial` rather than fabricated numbers. The interface this package freezes — probe input, transport, observation — is the handoff contract for the #650 runtime owner.
