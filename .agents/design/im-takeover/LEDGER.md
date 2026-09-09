# IM Account Takeover Delivery Ledger

## PR Topology and Single Spec-PR Alignment
- **Specification Pull Request**: `#623` (`codex/feature-im-takeover`, Draft Open, base `005b49be71`)
- **Cardinality Policy**: Exactly **one** specification pull request. No separate or duplicate PR per ticket. Root coordinates retargeting and stack publishing.
- **Delivery Branch**: `codex/im-takeover-combined-base` (Pushed: `origin/codex/im-takeover-combined-base`)
- **Live Ticket Tracker**:
  - Issue `#613`: IM Account Takeover Root Specification (OPEN)
  - Issue `#614`: B0 Interface & Platform Gap Review (CLOSED / SIGNED OFF on combined base)
  - Issue `#615`: T1 IM domain configuration, accounts, and routing (READY / FRONTIER)
  - Issue `#616`: T2 Message history, cursor progress, reliable delivery (BLOCKED by #615)

## Baselines and Verification Anchor
- **Combined Base Worktree**: `/private/tmp/dsh-im-delivery-takeover`
- **Dual-parent Ancestor Commit**: `d4fd51ceb546b20e7d579bffffb3d4d0f7b3fcca`
  - Parent 1: `4797d94e8d571fa564a6e253d4ad771b036b6de0` (Codex 上游同步集成主线)
  - Parent 2: `005b49be715eb82826de65a06d1a9686c5577e39` (origin/master 最新权威)
- **Current Branch HEAD**: In progress with B0 contract grounding
- **Design & Prototype Evidence**: Verbatim from `54a56df8ca8ed1f2e0493224936bf18cc1505645`.

## Five Verified Interface Groundings (B0 #614)
1. **`Branded<B>` Single Generic**: All opaque boundary IDs use single-parameter `Branded<B>`.
2. **SessionEvent Required-on-Read**: Blanket `ignorable: true` prohibited; only pure info annotations may skip.
3. **StorageDomain Serial Single-Key**: Atomic single-key unit commits without cross-log transactions; T2 uses aggregate root records.
4. **`createUserMessage` Source Purity**: Strictly typed reconstructed payload; no arbitrary source fields.
5. **Configured `merchantId`**: Extracted directly from configured account directory, no manual prompt input.

## Frontier Dependency & Sequencing Matrix

| Unit | Scope / Seam | Accountable Owner | Branch / Worktree | Prerequisite / Status | Acceptance Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **B0** (#614) | Interface & Platform Gap Review | Baseline Writer | `codex/im-takeover-combined-base` | **CLOSED / Complete** | Verified 5-point contract in `B0-INTERFACE-REVIEW.md` |
| **T1** (#615) | IM Domain Config, Accounts, Routing | Ticket Writer | Dedicated worktree / branch from combined base | B0 complete; **READY (Frontier)** | Focused domain tests (rules precedence, dynamic all-rule, pause transitions) |
| **T2** (#616) | History, Cursor, Outbound Delivery | Ticket Writer | Dedicated worktree / branch | **BLOCKED by #615** (serial skeleton requirement to avoid types write race) | Deduplication, ordering, aggregate outbound receipts, unknown result tests |
| **T3** | DingTalk DWS Adapter | Ticket Writer | Dedicated worktree | T1, T2 complete; **Pending** | DWS adapter unit tests with dry-run/mock fixtures |
| **T4** | Wangwang Adapter | Ticket Writer | Dedicated worktree | T1, T2 complete; **Pending** | HTTP pull/cursor adapter tests with mock fixtures |
| **T5** | Coordination, Triggers, IM Tools | Ticket Writer | Dedicated worktree | T2 complete; **Pending** | Safe-step preemption, group trigger rules, reconstructable model inputs |
| **T6** | Simulation Transport & Target Gating | Ticket Writer | Dedicated worktree | T1, T5 complete; **Pending** | Workspace target gating, 2-session isolated simulation tests |
| **T7** | Account, Workspace & Sidebar GUI | Ticket Writer | Dedicated worktree | B0, T1 complete; **Pending** | Client React components, settings form, Better Sidebar conversation view |
| **T8** | Assembled Acceptance & Snapshots | Verification Owner | Dedicated worktree | T3~T7 complete; **Pending** | Keyless assembled replay snapshot of real/simulated path parity |

## Capability Blockers & Invariants
- **GUI Acceptance Capability (T7/T8)**:
  - Current status: No callable `Codex computer-use` tool.
  - Policy: Strict blocker for T7/T8 native desktop walk. Does not block headless T1~T6 implementation.
- **Authorized Testing Boundary**:
  - Offline / mock fixtures remain default.
  - Any authorized live test strictly limited to designated self-owned test accounts without external broadcast or business side-effects.
