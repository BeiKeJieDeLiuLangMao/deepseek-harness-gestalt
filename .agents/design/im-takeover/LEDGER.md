# IM Account Takeover Delivery Ledger

## PR Topology and Single Spec-PR Alignment
- **Specification Pull Request**: `#623` (`codex/feature-im-takeover`, Draft Open, base `005b49be71`)
- **Cardinality Policy**: Under `orchestrate-dsh-delivery`, delivery maintains exactly **one** specification pull request. No separate or duplicate PR per ticket. Root coordinates any retargeting or stack publishing. Local working candidate stays on `codex/im-takeover-combined-base` until ready to update `#623`.
- **Live Ticket Tracker**:
  - Issue `#613`: IM Account Takeover Root Specification (OPEN)
  - Issue `#614`: B0 Fixed-snapshot interface and platform gap review (OPEN)
  - Issue `#615`: T1 IM domain configuration, accounts, and routing (OPEN)
  - Issue `#616`: T2 Message history, cursor progress, reliable delivery (OPEN)

## Baselines and Verification Anchor
- **Combined Base Worktree**: `/private/tmp/dsh-im-delivery-takeover`
- **Delivery Branch**: `codex/im-takeover-combined-base`
- **Dual-parent Merge Commit**: `d4fd51ceb546b20e7d579bffffb3d4d0f7b3fcca`
  - Parent 1 (Sync Staging Base): `4797d94e8d571fa564a6e253d4ad771b036b6de0`
  - Parent 2 (Master Latest): `005b49be715eb82826de65a06d1a9686c5577e39`
- **Current HEAD**: `838ad830be`
- **Design & Prototype Evidence**: Pinned to `54a56df8ca8ed1f2e0493224936bf18cc1505645` (retained verbatim review-pack and HASHES.sha256).

## Delivery Units and Accountable Execution Matrix

| Unit | Scope / Seam | Accountable Owner | Branch / Worktree | Prerequisite / Status | Acceptance Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **B0** (#614) | Interface & Platform Gap Review | Baseline Writer | `codex/im-takeover-combined-base` in `/private/tmp/dsh-im-delivery-takeover` | **In Progress** (Updated: Parallel review unlocked on combined base `d4fd51ceb5`; does not wait for 585 completion) | Report on Session V3, Agent, Tools, Subagent, Credentials, Better Sidebar interfaces & gap manifest |
| **T1** (#615) | IM Domain Config, Accounts, Routing | Ticket Writer | Dedicated subagent / worktree | B0 complete; **Pending** | Focused domain tests (rules precedence, dynamic all-rule, pause transitions) |
| **T2** (#616) | History, Cursor, Outbound Delivery | Ticket Writer | Dedicated subagent / worktree | B0 complete; **Pending** | Deduplication, ordering, outbound receipts, unknown result tests |
| **T3** | DingTalk DWS Adapter | Ticket Writer | Dedicated subagent / worktree | T1, T2 complete; **Pending** | DWS public command adapter unit tests with dry-run/mock fixtures |
| **T4** | Wangwang Adapter | Ticket Writer | Dedicated subagent / worktree | T1, T2 complete; **Pending** | HTTP pull/cursor adapter tests with mock fixtures |
| **T5** | Coordination, Triggers, IM Tools | Ticket Writer | Dedicated subagent / worktree | T2 complete; **Pending** | Safe-step preemption, group trigger rules, reconstructable model inputs |
| **T6** | Simulation Transport & Target Gating | Ticket Writer | Dedicated subagent / worktree | T1, T5 complete; **Pending** | Workspace target gating, 2-session isolated simulation tests |
| **T7** | Account, Workspace & Sidebar GUI | Ticket Writer | Dedicated subagent / worktree | B0, T1 complete; **Pending** | Client React components, settings form, Better Sidebar conversation view |
| **T8** | Assembled Acceptance & Snapshots | Verification Owner | Dedicated worktree | T3~T7 complete; **Pending** | Keyless assembled replay snapshot of real/simulated path parity |

## Acceptance Capability Prerequisite & Blockers
- **Native GUI Acceptance (T7/T8)**:
  - *Current Status*: Current CUA preflight verifies NO callable `Codex computer-use` tool.
  - *Policy*: Recorded as a hard blocker for final native GUI acceptance. Must NOT run irrelevant sub2api exploratory scripts or substitute Web DOM / ego-browser.
  - *Boundary*: Does not block B0, T1~T6 core domain and adapter implementation. Root will provide authorized native executor when reaching GUI acceptance.
- **Credential Protection**:
  - Offline / mock fixtures only during normal checks. Any authorized real-model / live-account validation must blind-copy credentials to a clean scratch `DSH_HOME` (0700/0600) without session/business state and never print secrets.
