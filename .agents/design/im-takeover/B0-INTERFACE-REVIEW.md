# B0 Interface and Platform Gap Review (#614)

**Review Execution Baseline**: Dual-parent combined base `d4fd51ceb546b20e7d579bffffb3d4d0f7b3fcca` (HEAD: `5501c5dd99`)
**Environment**: Independent worktree `/private/tmp/dsh-im-delivery-takeover`

## 1. Session V3 Event & History Query Seam
- **Package**: `packages/session/session-format/`, `packages/session/session-persistence-jsonl/`
- **Reviewed Contract**:
  - Session events follow monotonic `SCHEMA_VERSION = 1` and `SESSION_FORMAT_VERSION = 0`.
  - V3 persistence represents system prompt as surface node zero (`packages/session/session-format-v2-to-v3/src/payload.ts`), avoiding legacy in-history migration shims.
  - History query API (`SessionPersistence`) supports event stream hydration and cursor filtering without body-loading whole sessions during listing.
- **Verdict for IM (T2/T5)**: **ACCEPTED**. The normalized IM message schema (`user/message` with `source.kind = 'im-message'`) maps cleanly into standard SessionEvent without format bumping.

## 2. Agent Loop, Steer & Inbox Seam
- **Package**: `packages/core/agent/`, `packages/core/agent-loop/`
- **Reviewed Contract**:
  - `Agent` dispatch interface (`dispatch.ts`, `consumed-work.ts`) provides safe turn boundary detection.
  - Long-running delegations go through existing subagent / `subagent_fork` capabilities (`packages/subagent/`).
  - Preemption at nearest safe step is supported via `AbortSignal` without tool cancellation side effects.
- **Verdict for IM (T5)**: **ACCEPTED**. Trigger rules and inbound message preemption can be scheduled through standard agent steer without mutating the loop core.

## 3. Tool Registration & Execution Seam
- **Package**: `packages/core/tools/`, `packages/skill/skill/`
- **Reviewed Contract**:
  - Tool schemas are declared via Cordis plugin effects (`ctx.effect()`, `ctx.on()`).
  - Tools declare JSON schema parameters and UI render intent (`generic`/`terminal`/`diff`).
- **Verdict for IM (T5/T6)**: **ACCEPTED**. IM outbound tools (`im_send_message`, `im_query_history`) and simulation tools can be mounted dynamically as plugin capabilities.

## 4. Credentials & Authorization Flow
- **Package**: `packages/credentials/`
- **Reviewed Contract**:
  - Storage is credential-reference based; live tokens are not stored plaintext in tracked configs.
  - Safe scratch `DSH_HOME` (mode `0700`, files `0600`) pattern is standard for isolated auth tests.
- **Verdict for IM (T1/T3/T4)**: **ACCEPTED**. DingTalk and Wangwang adapters reference credentials through configured keys; mock fixtures suffice for all automated tests.

## 5. Better Sidebar 0.18.1 Seam
- **Package**: `packages/client/ui-better-sidebar/`
- **Reviewed Contract**:
  - Unified Workbench and Rightbar slot registration (`packages/client/ui-better-sidebar/src/index.ts`).
  - Tab domain occurrence lifecycle (`tab-domain.ts`) supports custom tab kinds and views.
- **Verdict for IM (T7)**: **ACCEPTED**. Better Sidebar provides standard slot hooks to mount IM conversation lists and takeover views.

## 6. Identified Platform Gaps & Mitigations
1. **DWS Public Command Availability**: DingTalk adapter (T3) will use dry-run / mock fixtures for CI; real DWS command execution stays behind live authorization.
2. **Wangwang Protocol Scope**: Wangwang adapter (T4) limits scope to HTTP pull/cursor/receipt, deliberately omitting Travel-Team specific merchant business orchestration.
3. **Native Desktop GUI Acceptance (T7/T8)**: No callable `Codex computer-use` tool in current environment. Blocked for final native walk, but does not block T1~T6 domain and adapter code.

**Conclusion**: B0 interface review passes. All core seams on `d4fd51ceb5` are stable and ready for T1/T2 implementation.
