# IM Account Takeover Delivery Ledger

## PR Topology and Single Spec-PR Alignment
- **Specification Pull Request**: `#623` (`codex/feature-im-takeover`, Draft Open, base `005b49be71`).
- **Cardinality Policy**: Exactly **one** specification pull request. No separate or duplicate PR per ticket. Root coordinates retargeting and stack publishing.
- **Combined Base Worktree**: `/private/tmp/dsh-im-delivery-takeover`
- **Candidate Delivery Branch**: `codex/im-takeover-combined-base` (Pushed: `origin/codex/im-takeover-combined-base`)
- **Live Ticket Tracker**:
  - Issue `#613`: IM Account Takeover Root Specification (OPEN)
  - Issue `#614`: B0 Interface & Platform Gap Review (OPEN / Static Interfaces Accepted, Baseline Runtime Tests Remaining)
  - Issue `#615`: T1 IM domain configuration, accounts, and routing (OPEN / In Progress by session `11a38d69`)
  - Issue `#616`: T2 Message history, cursor progress, reliable delivery (OPEN / Blocked by #615)

## Baselines and Verification Anchor
- **Combined Base Ancestor Commit**: `d4fd51ceb546b20e7d579bffffb3d4d0f7b3fcca`
  - Parent 1: `4797d94e8d571fa564a6e253d4ad771b036b6de0` (Codex 上游同步集成主线)
  - Parent 2: `005b49be715eb82826de65a06d1a9686c5577e39` (origin/master 最新权威)
- **Current Branch HEAD SHA**: `7435d04381`
- **Design & Prototype Evidence**: Verbatim from `54a56df8ca8ed1f2e0493224936bf18cc1505645`.

## Five Verified Interface Groundings (B0 #614 Static Sign-off)
1. **`Branded<B>` Single Generic**: All opaque boundary IDs use single-parameter `Branded<B>`.
2. **SessionEvent Required-on-Read**: Blanket `ignorable: true` prohibited; only pure info annotations may skip.
3. **StorageDomain Serial Single-Key**: Atomic single-key unit commits without cross-log transactions; T2 uses aggregate root records.
4. **`createUserMessage` Source Purity**: Strictly typed reconstructed payload; no arbitrary source fields.
5. **Configured `merchantId`**: Extracted directly from configured account directory, no manual prompt input.

## Frontier Dependency & Accountable Execution Matrix

| Unit | Scope / Seam | Accountable Owner Session | Branch / Worktree | Prerequisite / Status | Acceptance Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **B0** (#614) | Interface & Platform Gap Review | Baseline Owner (`92d02922-bab0-48ca-9435-53174fb2547d`) | `codex/im-takeover-combined-base` in `/private/tmp/dsh-im-delivery-takeover` | **IN PROGRESS (Static Accepted, Runtime Tests Remaining)** | Static interface review complete in `B0-INTERFACE-REVIEW.md`; baseline runtime tests continuing under baseline owner |
| **T1** (#615) | IM Domain Config, Accounts, Routing Core | Ticket Writer (`11a38d69`) | `codex/615-im-configuration` (base: `0d8d0faa5451bf13960e4d585cb267f0d408a43a`) | **IN PROGRESS (Parallel Implementation Dispatched)** | Core configuration schemas, route rules precedence; integration requires passing checks evidence |
| **T2** (#616) | History, Cursor, Outbound Delivery | Ticket Writer (TBD) | Dedicated branch (from T1 integration) | **BLOCKED by #615** (serial skeleton relay to avoid types/storage write races) | Pending implementation after T1 core lands |
| **T3** | DingTalk DWS Adapter | Ticket Writer (TBD) | Dedicated branch | T1, T2 complete; **Pending** | Pending implementation |
| **T4** | Wangwang Adapter | Ticket Writer (TBD) | Dedicated branch | T1, T2 complete; **Pending** | Pending implementation |
| **T5** | Coordination, Triggers, IM Tools | Ticket Writer (TBD) | Dedicated branch | T2 complete; **Pending** | Pending implementation |
| **T6** | Simulation Transport & Target Gating | Ticket Writer (TBD) | Dedicated branch | T1, T5 complete; **Pending** | Pending implementation |
| **T7** | Account, Workspace & Sidebar GUI | Ticket Writer (TBD) | Dedicated branch | B0, T1 complete; **Pending** | Pending implementation |
| **T8** | Assembled Acceptance & Snapshots | Verification Owner (TBD) | Dedicated branch | T3~T7 complete; **Pending** | Pending implementation |

## Baseline Checks Real Execution Log Evidence
1. **`scripts/ci-workflow.spec.ts`**:
   - Command: `npx vitest run scripts/ci-workflow.spec.ts`
   - Exit Code: `0`
   - Evidence: 39 tests passed in 53ms.
2. **`packages/experimental/agent-team/tests/persistence.spec.ts`**:
   - Command: `pnpm run build:native-system && npx vitest run packages/experimental/agent-team/tests/persistence.spec.ts`
   - Exit Code: `0`
   - Evidence: 6 tests passed (normal scheduling + recovery owns dispatch) in 2.19s.
3. **`apps/web/tests/produced-files.e2e.ts`**:
   - Command: `npx vitest run --config vitest.web.config.ts apps/web/tests/produced-files.e2e.ts`
   - Exit Code: `1` (Built prerequisite requirement: `web app dist not built`)
   - Evidence: Code harmonized with motion matrix; test execution safely retained pending web dist build pipeline.

## Desktop Architecture Memo & GUI Capability Blocker
- **Architecture Pipeline**: Uses candidate reserved profile, private host byte pipe, and `dsh-app://` custom protocol; no loopback web ports.
- **GUI Acceptance Capability (T7/T8)**: Blocked due to absence of callable `Codex computer-use` tool. Scripted test lanes cannot substitute for authentic Desktop acceptance.
