# B0 Interface and Platform Gap Review (#614)

**Review Execution Baseline**: Dual-parent combined base `d4fd51ceb546b20e7d579bffffb3d4d0f7b3fcca` (Ancestor: `d4fd51ceb5`, HEAD: `7258f609be`)
**Environment**: Independent candidate worktree `/private/tmp/dsh-im-delivery-takeover`
**Status**: Signed off and aligned with root 5-point contract. Unblocks T1 (#615).

## 1. Five Verified Interface Groundings (Authoritative Contract)

1. **Branded Single Generic**:
   - Package: `@deepseek-ai/dsh-brand` (`packages/util/brand/`).
   - Contract: All opaque cross-boundary IDs (`AccountId`, `MessageId`, `RouteRuleId`, `ReceiptId`) must strictly use single-generic `Branded<B>`, never multi-parameter brand shims.

2. **Event Envelope & Required-on-Read Invariant**:
   - Package: `packages/session/session-format/`, `packages/session/session-format-catalog/`.
   - Contract: Members of `SessionEventMap` are **required-on-read** by default. Builds refusing unknown events must not be bypassed with blanket `ignorable: true`. Only purely informational, display-only annotations may set `ignorable: true`.

3. **StorageDomain Serial Single-Key Commit (No Cross-Log Transactions)**:
   - Package: `packages/session/session-persistence/`, `packages/session/session-persistence-jsonl/`.
   - Contract: `StorageDomain` guarantees serial single-key atomic unit commit resolved on disk, with **no multi-table or cross-log atomic transactions**.
   - Design Impact for T2: Outbound delivery status, inbound message deduplication, and cursor progress must be maintained under aggregate root records or idempotent single-key envelopes, rather than distributed multi-key updates.

4. **Message Reconstruction & `createUserMessage` Source Purity**:
   - Package: `packages/core/agent/`, `packages/llm/llm/`.
   - Contract: Admitted IM messages reconstructed into model-visible session input must follow standard `user/message` structure. Calls to `createUserMessage` must strictly adhere to typed definitions—no arbitrary or untyped `id`/`role` injection in payload `source` fields.

5. **Wangwang / Qianniu Account Directory (Configured `merchantId`)**:
   - Package: `packages/credentials/`, `packages/settings/`.
   - Contract: Merchant identity relies strictly on configured account metadata from directory storage. No manual user-prompt entry for `merchantId` and no fake `whoami` runtime discovery claims.

## 2. Platform Gap Resolution & Frontier Sequencing

- **Real Adapter Verifications (T3/T4)**: Live delivery receipts and network edge cases remain deferred to adapter tests (using mock fixtures by default) and do not block T1 core domain models.
- **Frontier Dependency Serialization (T1 → T2)**:
  - Issue `#616` (T2) is officially marked as **blocked by Issue `#615` (T1)** to prevent shared types/event write races.
  - T1 must establish the shared core domain types, configuration schemas, and route rules before T2 implements history cursor and delivery engines.
- **GUI Acceptance Capability (T7/T8)**:
  - Callable `Codex computer-use` tool is currently unconfigured. This is cataloged as a blocker strictly for final Desktop GUI acceptance; it does not impede headless T1~T6 implementation.
- **Authorized Testing Boundary**:
  - Offline/mock fixtures remain the default. Necessary live tests authorized by the user must target strictly self-owned, designated test accounts/conversations; external sends or business mutations (such as refunds) remain strictly forbidden.

**Conclusion**: B0 interface grounding is complete, durable, and synchronized across repository notes and tracker ledgers.
