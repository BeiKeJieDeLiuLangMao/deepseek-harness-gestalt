# Agent Note: Type prerequisites for lint

Status: implemented

English | [中文](2026-09-08-lint-type-prerequisites.zh.md)

## Problem

Type-aware lint can report cascades of unsafe operations when an imported declaration is unavailable or a runnable example has no discoverable TypeScript project. Those diagnostics do not establish that the source uses untyped APIs. Host-only build preparation leaves Client transport declarations unavailable to cross-face assembly tests.

## Decision

The public lint and fix commands build Host libraries and then Client libraries before invoking their internal lint command. The internal commands consume these prepared declarations. The Remote Protocol, Two Instance Relay, and Personal Pairing examples own no-emit TypeScript projects with explicit entry/provider roots and references to their imported workspace packages. Remote Protocol snapshot tests have a separate nearby project. The program-less root solution and separate aggregate programs retain their existing responsibilities.

The [Oxlint discovery decision](../process/2026-07-29-oxlint-linter.md) remains authoritative: a nearest TypeScript project governs type-aware discovery; the CLI tsconfig override only changes import resolution. The [compiler-face decision](../process/2026-09-04-merged-workspace-compiler-faces.md) continues to own cross-face test placement and declaration consumption.

## Verification

The executable lint tests require both public commands to prepare both library phases, lint the real example without unsafe-type diagnostics, and reject a string argument to the protocol's numeric-version-list parameter with TS2345 or missing HTTP transport options with TS2741. A separate negative fixture uses the example's configuration and references without changing its runnable source.

## Alternatives considered

**Suppress unsafe diagnostics at each imported call.** This hides missing type information and accepts invalid uses of otherwise typed APIs.

**Pass the CLI tsconfig override or add roots to the solution.** The override does not govern type-aware discovery. Adding solution roots would mix compiler ownership that the separate aggregates preserve.

## Consequences

Public type-aware lint includes Client build preparation. The project-free staged lint path remains independent of build artifacts. Example project roots and package references are explicit maintenance obligations. Real source-policy diagnostics remain actionable after the declared type prerequisites are satisfied.
