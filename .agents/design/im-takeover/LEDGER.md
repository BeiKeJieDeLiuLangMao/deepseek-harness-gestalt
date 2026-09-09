# IM Account Takeover Delivery Ledger

## Baselines and Branches
- **Combined Base Worktree**: `/private/tmp/dsh-im-delivery-takeover`
- **Delivery Branch**: `codex/im-takeover-combined-base`
- **Dual-parent Merge Commit**: `d4fd51ceb546b20e7d579bffffb3d4d0f7b3fcca`
  - Parent 1 (Sync Staging Base): `4797d94e8d571fa564a6e253d4ad771b036b6de0`
  - Parent 2 (Master Latest): `005b49be715eb82826de65a06d1a9686c5577e39`
- **Current HEAD**: `1ef4393065` (Dual-parent merge + spec 54a graft)
- **Specification Source Head**: `54a56df8ca8ed1f2e0493224936bf18cc1505645` (Retained verbatim prototype hashes & review-pack)

## Delivery Units and Accountable Execution Matrix

| Unit | Scope / Seam | Accountable Owner | Branch / Worktree | Prerequisite / Status | Acceptance Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **B0** | Interface & Platform Gap Review | Baseline Writer | `codex/im-takeover-combined-base` in `/private/tmp/dsh-im-delivery-takeover` | **Ready** (Source restriction lifted; verify Session V3, Agent, tools, subagent, credentials, settings) | Report on B0 interfaces & platform gap manifest |
| **T1** | IM Domain Config, Accounts, Routing | Ticket Writer | Dedicated subagent / worktree | B0 complete; **Pending** | Focused domain tests (rules precedence, dynamic all-rule, pause transitions) |
| **T2** | History, Cursor, Outbound Delivery | Ticket Writer | Dedicated subagent / worktree | B0 complete; **Pending** | Deduplication, ordering, outbound receipts, unknown result tests |
| **T3** | DingTalk DWS Adapter | Ticket Writer | Dedicated subagent / worktree | T1, T2 complete; **Pending** | DWS public command adapter unit tests with dry-run/mock fixtures |
| **T4** | Wangwang Adapter | Ticket Writer | Dedicated subagent / worktree | T1, T2 complete; **Pending** | HTTP pull/cursor adapter tests with mock fixtures |
| **T5** | Coordination, Triggers, IM Tools | Ticket Writer | Dedicated subagent / worktree | T2 complete; **Pending** | Safe-step preemption, group trigger rules, reconstructable model inputs |
| **T6** | Simulation Transport & Target Gating | Ticket Writer | Dedicated subagent / worktree | T1, T5 complete; **Pending** | Workspace target gating, 2-session isolated simulation tests |
| **T7** | Account, Workspace & Sidebar GUI | Ticket Writer | Dedicated subagent / worktree | B0, T1 complete; **Pending** | Client React components, settings form, Better Sidebar conversation view |
| **T8** | Assembled Acceptance & Snapshots | Verification Owner | Dedicated worktree | T3~T7 complete; **Pending** | Keyless assembled replay snapshot of real/simulated path parity |

## Acceptance Capability Prerequisite
- **Native GUI Acceptance (T7/T8)**:
  - *Current Status*: Current DSH runtime has no callable `Codex computer-use` tool.
  - *Constraint*: Must not substitute Web DOM / ego-browser / standalone preview for native Desktop acceptance.
  - *Mitigation*: Listed as prerequisite for final GUI walk; does not block B0, T1~T6 core domain and adapter implementation. Root will assign authorized native executor when reaching T7/T8.
