# IM Account Takeover

- **Author**: 贝克街的流浪猫 <517375685@qq.com>
- **Date**: 2026-09-07 (Updated 2026-09-10)
- **Status**: Proposed / Implementation Unlocked via B0 Grounding
- **Tracking**: Closes #613 (Root Spec), Closes #614 (B0 Review), Implements #615 (T1), Implements #616 (T2)

## Context

DeepSeek Harness integrates with external IM platforms (DingTalk, Wangwang/Qianniu) to support account takeover, simulation testing, and unified agent steering through Better Sidebar.

## Verified Architecture Contracts (B0 Grounding)

1. **Branded Types**: Opaque IDs use single-generic `Branded<B>` from `dsh-brand`.
2. **Session Event Integrity**: Required-on-read by default; only purely informational display events use `ignorable: true`.
3. **Persistence Constraints**: `StorageDomain` serial single-key commit resolves on disk without cross-log or cross-table transactions; delivery state uses idempotent aggregate records.
4. **Model Message Reconstruction**: `createUserMessage` respects strictly typed payload definitions without unauthorized source metadata injection.
5. **Account Identity**: `merchantId` and credentials derive from configured account directory storage, without runtime prompt guessing.

## Implementation Frontier & Dependencies

- `B0` (Signed off) -> `T1` (IM domain configuration & routing core skeleton - Implemented in #615)
- `T1` -> `T2` (Message history, cursor tracking, reliable outbound delivery)
  - *Dependency note*: Issue #616 was strictly blocked by Issue #615 to prevent type definition and storage schema write competition. Now unblocked by T1 completion.
- `T1 + T2` -> `T3` (DingTalk DWS adapter) & `T4` (Wangwang adapter) & `T5` (Agent coordination & triggers)
- `T5` -> `T6` (Simulation workspace gating)
- `T1 + B0` -> `T7` (GUI settings & Better Sidebar conversation view)
- `T3~T7` -> `T8` (Keyless assembled parity replay)

## T1 Scope Delivery Summary (#615)

- Package `@deepseek-ai/dsh-im-core` under `packages/im/im-core` established with clean boundaries and manifest.
- Types & schemas for accounts, credential references (no secrets), route rules, group trigger configuration, and target resolution implemented.
- `ImConfigService` with `StorageDomain` backing, single-workspace-per-conversation enforcement, specific-precedence, disabled-retention without fallback, and account-level pause logic.
- 100% per-file test coverage on all source files under `packages/im/im-core/src/`.

## Capability & Testing Invariants

- Native Desktop GUI acceptance (T7/T8) requires a verified callable `Codex computer-use` executor; Web DOM is not an acceptable proxy.
- Authorized live testing is strictly limited to self-owned, designated test accounts without external broadcast or business side-effects.
