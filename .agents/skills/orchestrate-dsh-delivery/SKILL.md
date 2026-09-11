---
name: orchestrate-dsh-delivery
description: >-
  Orchestrate DeepSeek Harness issue and specification delivery through isolated
  writers, one specification pull request, review, retro, and merge. Use when the
  user asks to implement, fix, continue, or land repository work, including
  "implement #123" and "continue this spec".
---

# Orchestrate DSH Delivery

Own the delivery graph from the root task. Treat GitHub Issues, the specification pull request, checks, and remote heads as durable coordination state. Use Codex tasks and DSH subagents or forks as accountable executors whose sessions are reused while they own active work, not as the source of truth. The root session analyzes, decomposes, dispatches, and accepts; it does not implement. [Root-session orchestration](../../notes/implemented/process/2026-09-03-root-session-orchestrates-only.md) owns that split. GUI draft comparison and the dedicated acceptance walk live in [the fidelity-and-acceptance-route decision](../../notes/implemented/process/2026-09-03-ui-fidelity-and-acceptance-route.md). Pull-request cardinality, merger ownership, scratch exploration notes, and the retro gate live in [the spec-PR decision](../../notes/implemented/process/2026-09-02-spec-pr-delivery-and-retro.md). Request authority, isolated writers, GUI evidence, cleanup proofs, and the release stop remain in [the default-orchestration decision](../../notes/implemented/process/2026-08-16-default-ticket-delivery-orchestration.md).

## Establish authority

1. Read [the tracker contract](../../../docs/agents/issue-tracker.md), [domain routing](../../../docs/agents/domain.md), `CONTEXT-MAP.md`, and the applicable repository instructions and active Agent Notes.
2. Fetch the complete issue or specification, including comments, labels, acceptance criteria, dependencies, and current pull requests. Resolve ambiguous GitHub numbers as the tracker contract requires.
3. Interpret a request to implement, fix, continue, or land the work as authorization to create branches and isolated worktrees, edit files, commit, push, open or update the specification pull request, respond to review, and merge after required evidence and the retro gate pass. An explicit user limit such as "do not push" or "stop before merge" overrides this default.
4. Keep tag creation, GitHub Releases, registry publication, signing, notarization, deployment, and other release mutations behind explicit per-release approval. Ticket delivery does not authorize them.

Complete this phase when the requested outcome, live ticket graph, mutation authority, and release stop point are explicit.

## Keep the root on orchestration

1. Restrict the root session to demand clarification, scheme decomposition, task dispatch, and result acceptance. Before dispatch or continuation, apply [delegation routing and context reuse](../../../docs/agents/delegation-routing.md): choose an explicit available provider/model under current user restrictions, then continue the accountable direct child unless the work requires independence, a capability its fixed model lacks, or a replacement.
2. Dispatch implementation through the runtime's Agent tool: under DSH, `subagent` or `subagent_fork`; under Codex, a worktree task when available. Implementation is reading a large code surface to change it, writing or editing product or documentation files, running local tests or other executable evidence, and bulk edits.
3. Treat user feedback, CI failures, review findings, and retro keep-or-drop landings the same way, including after the specification looks done. Classify the work, brief a writer, wait, and accept reported evidence. Do not implement the follow-up in the coordinating session.
4. The root may run bounded read-only status and provenance queries for Git refs, worktrees, GitHub, the tracker, worker reports, artifacts, and CI; maintain the delivery ledger; write a brief; create an empty specification branch and Draft pull request; and enqueue a merge once reported evidence passes. Those coordination queries are not executable acceptance evidence. The root does not run product tests or land code, documentation, or environment edits in the coordinating checkout.
5. When no Agent tool can run a writer, report that isolation failure and stop. Do not fall back to implementing in the coordinating session. If the user has authorized this coordinating session as unique writer, CI-failure implementation still runs the owning local gates in [dsh-pre-push-checks](../dsh-pre-push-checks/SKILL.md) before another push.

Complete this phase when every implementation path has a named writer executor, including late feedback.

## Maintain the delivery ledger

1. Keep one concise ledger in the specification pull request or linked Issue. For every required delivery unit, record its fixed accepted scope, accountable writer session and branch, acceptance evidence, current state, blocker, and next discriminating check. Preserve every accepted criterion unless the user makes a material scope decision. Classify a new finding as a current blocker only when it prevents accepted behavior or required evidence; otherwise record it as a separate improvement without expanding this delivery. Add reviewer, fidelity, or acceptance-environment owners only when that delivery needs those roles; trivial work does not require a fixed session count.
2. Record completed evidence against the exact commit, behavior or route, environment, and mode it demonstrated. A newer head never changes that provenance. Classify each later change by the behavior and environment it can affect before deciding what evidence remains valid.
3. Route a same-delivery bug, review finding, failed check, or acceptance finding to the existing owner. Reuse the reviewer for delta review and the Codex acceptance-environment session for rebuild, restart, diagnosis, and re-walk until its environment is handed off or cleaned up. Only one active desktop-input owner may drive the exact test application at a time. Batch related fixes into one review cycle when their affected scope is coherent.
4. Start a new owner only for an independent delivery unit, required independent judgment, a model capability the current owner lacks, an unavailable or systematically stale owner, or a standalone request after the earlier delivery closed. A merely preferred model does not replace a suitable owner. Record the reason, current branch and commit, retained evidence, open findings, and next check; mark the previous owner replaced or complete so two sessions never own the same mutable work.
5. Writers may use read-only investigators, but they do not create another write-capable owner. Route a proposed split to the root, which decides whether it is an independent ledger row and owns the handoff.

Complete this phase when every required item has one accountable owner, evidence and blockers have exact provenance, and no new session lacks a recorded routing reason.

## Establish the specification branch

1. Before the first workspace write, require a clean checkout, fetch `origin/master`, and create and push one remote `codex/feature-<slug>` specification branch from its exact SHA. If work already exists in a dirty checkout, stop new writes, preserve the diff, and migrate it into a clean specification worktree without moving or cleaning the dirty checkout first.
2. Keep planning authority on that branch: confirmed prototype conclusions, specification, Agent Notes, Context documents, published tickets, and for a GUI change the frozen draft plus the experience route, must be committed and pushed before implementation dispatch. Local conversation history is not a handoff artifact. A GUI specification without that draft pointer and route is not ready.
3. Record the specification branch and exact remote SHA in every worker handoff. Verify the ticket's accepted requirements and mapped domain sources are readable from that SHA.
4. Keep one specification branch per independently releasable feature or fix. Parallel delivery scopes use separate branches; extract genuinely shared foundations into their own master-bound delivery instead of copying them between scopes.
5. Open or update one Draft pull request from that branch to `master`. It is the only pull request that will close the specification and tickets. Do not open a pull request per ticket.

Complete this phase when the specification branch is remotely visible, the planning checkout is clean, the Draft pull request exists, and every implementation input is durable at the recorded SHA.

## Build the delivery frontier

1. Decompose only when the source is not already ticketed. Use the Matt specification and ticket skills for product shaping and blocker-first ticket publication; do not rewrite accepted ticket scope during implementation.
2. Order tickets by live dependency state. A ready frontier contains only tickets whose blockers are already on the specification branch.
3. Keep independent tickets as independent writer branches. Stack pull requests only when a leftover dependency still needs GitHub's official stack after this topology cannot express it.
4. Follow the [runtime-specific executor decision](../../notes/implemented/process/2026-08-27-runtime-specific-delivery-executors.md) for product-shaping work. Do not draw UI or write a scheme in the coordinating session. Under Codex, create an independent Codex Worktree task with a short brief. Under DSH, use `subagent_fork` only when the brief is already written; otherwise dispatch a plain `subagent`. Brief a UI writer to follow [prototype](../prototype/SKILL.md): fuse interaction variants into the existing page, then have a Codex computer-use session walk every native Desktop variant through [dsh-desktop-test-instance](../dsh-desktop-test-instance/SKILL.md) before human review; Web-only variants may use an isolated headless browser. Brief a scheme writer to follow [codebase-design/SCHEME.md](../codebase-design/SCHEME.md): write the proposed Agent Note on the specification branch, self-check it, then open a gitignored HTML review pack for the human. Keep prototype code on its own pushed worktree and branch. Implementation tickets adapt that code instead of merging it verbatim; retire the prototype branch once its consuming tickets have landed.
5. Put exploration notes in a scratch directory outside the repository. Record its absolute path in the gitignored runtime memo so later writers can read it. Do not commit those notes.

Complete this phase when every selected ticket has one writer branch, one acceptance source, and a known dependency position.

## Dispatch isolated writers

1. Keep the root task as coordinator and monitor. It does not merge writer branches. Match the writer executor to the runtime: under Codex, prefer one Codex Worktree task per ready ticket when task/worktree tools are available; under DSH, choose continuation, `subagent`, or `subagent_fork` through [the routing reference](../../../docs/agents/delegation-routing.md). Pass an explicit available provider/model when the tool supports routing; no role pins a model. On the normal path, every writer commits only inside its own isolated worktree. Assign the project `ticket_worker` role when custom agents are available.
2. Give each worker exactly one ticket, one `codex/<issue>-<slug>` branch, one worktree, the verified remote specification branch and SHA, the scratch exploration path when one exists, the acceptance criteria, and the required reporting format. Never let two writers mutate the same worktree.
3. Allow read-heavy exploration and log analysis to run as subagents inside a ticket. Keep one writer for that ticket through its fixes and acceptance unless the ledger records a replacement; every parallel writer has a disjoint delivery unit, worktree, and branch.
4. Route follow-ups and dependency discoveries through the root task as delta briefs to the existing owner. Sibling agents need no direct communication. Record durable cross-ticket facts in the relevant Issue, the specification pull request, Context document, or Agent Note.
5. When Codex task creation is unavailable but an isolated worktree can still be created, dispatch writers sequentially into one dedicated worktree at a time through the Agent tool; the root still does not write. If the active runtime cannot create an isolated worktree or cannot run an Agent tool, report the isolation failure and stop.

Complete this phase when every ready ticket has one accountable writer and no mutable checkout has multiple owners.

## Supervise asynchronous workers

1. Treat dispatch as a monitored handoff. Register every independent executor — a Codex task, a fresh Codex session, or a background `subagent` run — in one active wait set and keep the root session alive with bounded waits while any selected worker is running. Preserve task cursors and re-wait after unchanged timeouts without narrating them.
2. Let a completion or attention event resume the root session. Read the result, answer worker needs, route follow-up work, and return the executor to the wait set until it reaches a terminal state. Continue supervising the other workers in parallel.
3. Require a human blocker to end with `[BLOCKED · Issue #N]`, one concrete requested action, and the evidence that makes it necessary. Surface that request from the root session; never leave the user to discover it in an implementation task.
4. Keep follow-up ownership in the root session. The user need not ask to continue before the root observes completion. Yield only for missing authority or input, or after all selected workers are terminal and their results have been incorporated into the delivery graph.
5. Before the first expensive build, Electron run, model call, or recording, identify and preflight the known prerequisites that can fail late in that target environment. Keep the preflight proportional to the planned operation instead of building a generic checklist. For example, test a dependency cache in a clean directory and offline mode, or verify credentials, selected session, page, and tab before a full Electron walk.
6. When the same failure signature occurs a second time, stop unchanged retries and keep diagnosis with the current owner. Record the observed evidence, plausible hypotheses, and the smallest experiment that distinguishes them; a fresh worker is not a retry strategy. Re-run the expensive operation only when that experiment or a changed prerequisite adds evidence.

Complete this phase when every dispatched executor's final state has been observed and acted on, and no selected worker remains unwatched.

## Enforce the worker contract

Require each ticket worker to:

1. Fetch the recorded remote specification branch, create the ticket branch from its exact SHA, and re-read the ticket and mapped domain sources from that checkout. Read scratch exploration notes when the handoff recorded a path.
2. Follow the shared implementation workflow in [`implement`](../implement/SKILL.md) as an ordinary reference; it is a user-invoked entry, not a required automatic Skill-tool call. Use TDD at an agreed seam where practical, then select narrow checks through [DSH pre-push checks](../dsh-pre-push-checks/SKILL.md).
3. Preserve unrelated worktree changes. Add the required documentation, Agent Note, and real runnable snapshot when their repository rules apply. For a GUI change, make the ticket's slice ready for a non-recording product smoke. The root routes native Desktop smoke to the existing Codex computer-use validation owner through [dsh-desktop-test-instance](../dsh-desktop-test-instance/SKILL.md); a Web-only route uses [ego-browser](../ego-browser/SKILL.md) in one DSH task space per goal. Scripted DOM, direct Electron IPC, and a standalone Web page do not substitute for the native user route. Defer GIF recording and the whole-route walk until the fidelity and acceptance sessions below.
4. Run the narrowest evidence that covers the diff through `dsh-pre-push-checks`, then commit, push, and verify the remote ticket head. Do not open a pull request. A required CI failure uses that skill's owning-gate table; do not push another pin from annotations until the local gate is green.
5. Return the branch, commit, checks run, review blockers, scratch notes path, and any changed dependency to the root task.

Complete a worker phase only when the remote ticket branch represents its full ticket diff and its reported evidence is reproducible.

## Merge through a merger subagent

1. Dispatch a merger subagent, not the root session, to integrate each completed ticket branch into the specification branch. Fast-forward when the histories allow it; otherwise create a merge commit. Push the specification branch and report the new head. Give the merger `/opt/homebrew/bin` on PATH. `pnpm: command not found` is a PATH miss, not a sandbox denial. When the ticket SHA is already verified and the spec update is a fast-forward of only that SHA, the merger may push with `LEFTHOOK=0`; GitHub CI on that SHA owns typecheck. Do not rewrite lefthook in the same product PR.
2. After a successful merge, recompute the ready frontier and dispatch newly unblocked writers.
3. Before each batch, have the merger subagent merge-forward current `origin/master` into the specification branch once and push it. Affected in-flight writers then merge-forward that updated remote head into their ticket branches, audit semantic conflicts, and republish the exact head. Sibling writers do not merge master independently.
4. For leftover GitHub-level dependencies that this single pull request cannot express, follow [the official stack workflow](../dsh-merging-stacked-prs/SKILL.md).

Complete this phase when every selected ticket commit is on the specification branch or has a concrete reported merge blocker.

## Review, fidelity, acceptance route, retro, and land

1. Run the narrow deterministic checks needed before visual comparison. Keep existing unit, protocol, snapshot, and scripted Electron CI evidence; Codex computer use adds product GUI evidence rather than replacing those lanes. Require callable computer-use tools in the selected executor—a Codex model or provider name alone does not qualify—and report their absence instead of creating an unauthorized user-owned task. Do not spend model calls or capture frames for a final GIF yet, and do not hand an instance to the user before the agent's route passes.
2. Review the specification pull request against both the repository standards and the specification with `code-review` and `dsh-code-review`; use the project `dsh_reviewer` role when available. Keep that reviewer accountable for its findings, send fixes to the owning writer, batch coherent fixes, then ask the same reviewer for delta review after the merger subagent integrates them. Repeat until no code finding remains. Spec review of prose is not visual fidelity.
3. For a native GUI change, dispatch a Codex fidelity session with computer use. It starts one isolated Desktop through the verified macOS background path in [dsh-desktop-test-instance](../dsh-desktop-test-instance/SKILL.md), opens every screen through user-level input, and compares the actual Electron route to the frozen draft named by the specification (`gif-assets` PNG/GIF and the throwaway prototype branch). Evidence from another driver or execution mode cannot satisfy this workflow without an explicit user scope change. Require the same chrome, component library, information hierarchy, and primary affordance. Pixel-identity is not required. Send each mismatch to the owning ticket writer and merge the fix through the merger subagent. If the background route fails, keep diagnosis with the same session and report the exact blocker. Do not ask the user to review while a mismatch remains.
4. Dispatch a dedicated Codex acceptance-environment session with computer use, not the root and not a ticket writer. That session stops leftover instances for this goal, starts one fresh isolated Desktop through the same verified macOS background path with the credential-safe environment required by `dsh-desktop-test-instance`, chooses fixture versus live Platform from the scenario, seeds the data the experience route needs, and walks every step of the actual Electron route through user-level input. Reuse it for later rebuilds, restarts, diagnosis, and re-walks until cleanup or a recorded replacement; no other session drives desktop input concurrently. A blocked step is a writer fix or a structured human blocker, never an unrequested switch to another execution mode. A complete agent walk makes the reviewed head ready to freeze; it does not start the user handoff.
5. Freeze the exact reviewed specification head after fidelity and the complete initial acceptance walk pass. For a product-user-visible GUI change, record and publish the required GIF from that head with `record-browser-gif`; verify the served revision before the first real-model call or captured frame. After a later change, use the ledger's impact map to re-run affected deterministic checks and reviewer delta, then re-run every affected fidelity screen, route step, environment condition, and GIF storyboard from the new head. Preserve unaffected evidence only at its recorded commit and provenance; never relabel it as evidence from the newer head. Product behavior or environment changes invalidate the evidence that exercises them, and uncertain impact expands revalidation until the uncertainty is resolved. Every replacement GIF remains one coherent run.
6. Have the acceptance-environment session prepare the evidence report required by `dsh-desktop-test-instance` from the frozen head. The report ties the evidence lane, source or package identity, credential-safe launch results, actual background computer-use screenshots and GIF, TDD RED and GREEN evidence or an explicit missing-RED statement, a readable `show-me` diff, and reproducible acceptance steps to that head. Only after the complete route and report pass does the session give the user the route, exact application path, and starting state.
7. Ask each writer session to run [`retro`](../retro/SKILL.md) on its own session; that user-only skill and the [session retrospective standard](../../../docs/agents/session-retro.md) — an ordinary shared reference any coordinator or writer can read — own the rules. Collect the candidates in the root task, present a synthesized list to the user, and wait for an explicit keep-or-drop decision per item. Dispatch a writer to land only accepted environment changes on the specification branch, then accept the writer's re-run of the affected checks. Do not merge to `master` before that decision.
8. Wait for required CI and live review state. Re-fetch the exact head, base, unresolved threads, approvals, checks, and mergeability after every rewrite or base change.
9. Mark the specification pull request ready. Its body carries `Closes` for the specification and every delivered ticket. After the exact head passes `all checks passed` against the current strict base and review plus retro are complete, submit it to the protected-master merge queue. The queue's synthetic `merge_group` candidate must pass `candidate verdict`; that verdict does not run on the pull-request head, and `all checks passed` does not run on the candidate. No approval is required.
10. Confirm the queued result merged and its tickets closed. Resume a failed or interrupted worker from GitHub state. Ask the user only for missing credentials, permissions, a material product decision, a retro keep-or-drop, a blocked experience-route step, conflicting official stack metadata, or release authorization.

Complete delivery when every selected ticket is on `master` or has a concrete reported blocker, GitHub reflects the final state, GUI fidelity and the experience route have passed when they apply, the retro decision is recorded, and no release mutation has occurred without approval.

## Retire completed work

1. After the specification pull request lands, verify each writer is terminal through the owning runtime's task, subagent, or session state. Verify that its exact worktree has no uncommitted files, stash, unpushed commit, or unique commit absent from the remote merged result. Preserve the worktree and report the discrepancy when any check fails.
2. Archive a terminal Codex task only when that writer created one. Remove only a validated dedicated worktree, retain any shared checkout, delete merged local and remote ticket branches and the specification branch, and run `git worktree prune`.
3. Record an explicit retention reason instead when follow-up work still needs a path or branch. Delete the scratch exploration directory after the user has not asked to keep it.

Complete cleanup when every removed path and branch was exact, merged, clean, and replaceable from GitHub, and every retained artifact has a named owner and reason.

## Report

Report the specification branch and pull request, ticket branches, checks actually run, merger results, fidelity findings, experience-route status, retro candidates and user decisions, cleanup or retention results, unresolved blockers, remaining ready tickets, and the explicit release stop point. After an explicitly authorized Product Release, read its machine-readable manifest and report Desktop, Mobile, and Platform as separate released, skipped, or blocked states; a merged release plan is not publication evidence. If a newly installed skill or project agent is absent from the current task's catalog, ask the user to start one fresh Codex task once; do not require a new task per ticket.
