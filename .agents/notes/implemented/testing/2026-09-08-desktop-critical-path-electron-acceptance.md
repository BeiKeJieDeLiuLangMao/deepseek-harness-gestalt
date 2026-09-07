# Agent Note: Desktop critical-path Electron acceptance

Status: implemented

English | [中文](2026-09-08-desktop-critical-path-electron-acceptance.zh.md)

## Problem

Focused package tests and browser scenarios establish Session, model-selection, Side Chat, and archive behavior separately. They do not prove that the shipped Electron main process, Web Host, preload and IPC path, production client composition, Session persistence, and visible renderer preserve one Side Chat's selected route and permission across a complete process restart.

## Decision

`pnpm --dir apps/desktop test:e2e-critical-path-electron` is the source acceptance for the ordinary Desktop path outside Member Questions. The runner requires a clean worktree, then builds Host libraries, Client libraries, Web, and Desktop main once from the current commit. It creates one private `DSH_HOME`, Electron `userData`, and git Workspace, then launches the same built Desktop for three sequential WebdriverIO phases: create, restore, and archive. Every invocation atomically creates an exclusive child under the configured artifact base. The final manifest can pass only if HEAD still equals the recorded commit and the worktree remains clean after all three phases.

The create phase connects the Workspace through the shipped browse directory provider, prompts the main Session through the renderer, opens an unpublished Side Chat, and holds a bounded stability window during which neither the main Session list nor the Tasks tree gains a row and no child JSONL exists before the first Side Chat prompt. While that tab remains open, the Models page declares an `openai-completions` provider and model. The Side Chat selects that model, sends its first prompt, switches to Read Only, and verifies the visible response and the resulting raw JSONL.

The restore phase reuses the exact home, Workspace, and `userData`. It requires one restored Side Chat tab with the same model and permission, records the prior child-owned event cut and visible-response count, then sends another prompt. The phase requires exactly one new visible reply and one ordered child-owned user message, model request, assistant message, and durable turn end after that cut. It proves the main Session header exposes that exact durable child and closes the tab through its UI. The phase waits for both the tab and main-header child row to disappear after the archive projection. The archive phase launches the same state again and verifies the tab stays closed, the child id is present in the Workspace domain's durable archive set, and the child JSONL still carries both own turns, both model-B request headers, and the Read Only event.

The loopback OpenAI-compatible HTTP listener is the only external-service substitute. It responds by requested model and retains only phase, URL path, and model id. The test profile routes automatic title generation to a second shipped DeepSeek model so the audit distinguishes that request without retaining its prompt. The runner does not read the user's normal `DSH_HOME`; its test profile is accepted only by the source-only Desktop E2E gate. WDIO records each observed test outcome instead of letting the planned phase count stand in for execution. Process evidence records Electron before the test body, records the Web Host during the first poll that observes its startup record, and samples both exact start identities plus their descendants throughout each phase. Teardown signals only identities that still match, treats a reused PID as an exited owner, and requires every captured identity to stop before scratch cleanup. Production Session JSONL is decoded by the JSONL persistence implementation; runner-owned cross-phase records validate only their declared fields and reconstruct branded Session ids.

## Alternatives considered

**Extend the three-installation Project Members runner.** Rejected: this path has one installation and no Account, Project Membership, Relay, or Companion behavior. Combining them would make a routing regression depend on unrelated multi-account infrastructure.

**Call Host controllers or install an in-process Agent fixture from the test.** Rejected: that would skip the Desktop main entry, Web Host process, Remote transport, Session controller, preload and IPC composition, and visible user interaction this lane exists to prove.

**Reload one renderer instead of restarting Electron.** Rejected: a page reload cannot establish that the selected route, permission, Session log, and Side Chat restoration survive termination of both Electron and the Web Host.

**Use compressed production JSONL and read it through Host RPC.** Rejected: the lane selects the production JSONL provider's supported `compression: none` and `packChunks: false` settings so evidence can inspect the physical artifact directly without adding another Host control path.

## Consequences

One command produces reviewable screenshots, build logs, phase logs, process-identity evidence, a prompt-free provider audit, redacted main and child event-ledger JSONL, Session state, and a result manifest under `.artifacts/critical-path-electron/<timestamp>-<sha>-<random>/`. The manifest aggregates observed WDIO pass, failure, and skip counts and remains available with the fixed commit and redacted failure summaries when setup, build, a phase, or cleanup fails. It is written as incomplete before scratch removal and can report a pass only after cleanup and the retained-artifact secret scan finish. A matching file is removed and the manifest reports only the count, never the matched content; an incomplete scan purges the namespace before writing a new failure manifest. The redacted ledgers retain Session ids, lineage, owned event types, request and assistant routes, permission, and the archive set while omitting prompts, system text, tool schemas, and event payloads. A passing result proves the ordinary single-installation create, restart, and archive chain at that commit. Member Questions, operated Platform traffic, packaged Desktop, and real-provider behavior retain their own acceptance owners.

## Testing

- `pnpm --dir apps/desktop run typecheck:e2e-critical-path`
- `pnpm exec vitest run apps/desktop/tests/electron-runner-infrastructure.spec.ts apps/desktop/tests/critical-path-e2e/artifact-io.spec.ts`
- `pnpm --dir apps/desktop test:e2e-critical-path-electron` on a host with a visible display
