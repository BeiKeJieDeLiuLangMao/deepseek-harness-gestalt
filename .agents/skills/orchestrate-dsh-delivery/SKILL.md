---
name: orchestrate-dsh-delivery
description: >-
  Orchestrate DeepSeek Harness issue and specification delivery through isolated
  writers, one specification pull request, review, retro, and merge. Use when the
  user asks to implement, fix, continue, or land repository work, including
  "implement #123" and "continue this spec".
---

# Orchestrate DSH Delivery

Own the delivery graph from the root task. Treat GitHub Issues, the specification pull request, checks, and remote heads as durable coordination state. Use a small set of stable accountable sessions rather than one session per ticket, error, or comment; [delivery session roles](references/session-roles.md) owns the conditional role set and acceptance sequence. The user chooses the root model, and the root never routes or changes itself. For permitted CLIProxyAPI installations, apply the live-catalog-dependent [delivery model mapping](references/model-routing-cliproxyapi.md). The root session investigates, grills the demand with the user, accepts the reviewed scheme and design, builds the dependency DAG, dispatches, and accepts; it does not implement. [Root-session orchestration](../../notes/implemented/process/2026-09-03-root-session-orchestrates-only.md) owns that split. GUI draft comparison and the dedicated acceptance walk live in [the fidelity-and-acceptance-route decision](../../notes/implemented/process/2026-09-03-ui-fidelity-and-acceptance-route.md). Pull-request cardinality, merger ownership, scratch exploration notes, and the retro gate live in [the spec-PR decision](../../notes/implemented/process/2026-09-02-spec-pr-delivery-and-retro.md). Request authority, isolated writers, GUI evidence, cleanup proofs, and the release stop remain in [the default-orchestration decision](../../notes/implemented/process/2026-08-16-default-ticket-delivery-orchestration.md).

## Establish authority

1. Read [the tracker contract](../../../docs/agents/issue-tracker.md), [domain routing](../../../docs/agents/domain.md), `CONTEXT-MAP.md`, and the applicable repository instructions and active Agent Notes.
2. Fetch the complete issue or specification, including comments, labels, acceptance criteria, dependencies, and current pull requests. Resolve ambiguous GitHub numbers as the tracker contract requires.
3. Interpret a request to implement, fix, continue, or land the work as authorization to create branches and isolated worktrees, edit files, commit, push, open or update the specification pull request, respond to review, and merge after required evidence and the retro gate pass. An explicit user limit such as "do not push" or "stop before merge" overrides this default.
4. Keep tag creation, GitHub Releases, registry publication, signing, notarization, deployment, and other release mutations behind explicit per-release approval. Ticket delivery does not authorize them.

Complete this phase when the requested outcome, live ticket graph, mutation authority, and release stop point are explicit.

## Keep the root on orchestration

1. Restrict the root session to orchestration. It first investigates whether the demand belongs in a new or existing module and whether UI is involved, grills unresolved choices with the user, and obtains a complete reviewed scheme and design before publishing the dependency DAG. The user selects the root model; the root never routes or changes itself.
2. Choose the fewest conditional roles from [delivery session roles](references/session-roles.md). Before dispatch or continuation, apply [delegation routing and context reuse](../../../docs/agents/delegation-routing.md) and any permitted installation mapping. Reuse the accountable owner through coherent fixes; start a replacement only for required independence, a missing capability, or an unavailable or stale owner.
3. Dispatch implementation through the runtime's Agent tool: under DSH, `subagent` or `subagent_fork`; under Codex, a worktree task when available. Implementation is reading a large code surface to change it, writing or editing product or documentation files, running local tests or other executable evidence, and bulk edits.
4. Treat user feedback, CI failures, review findings, and retro keep-or-drop landings the same way, including after the specification looks done. Classify the work, brief a writer, wait, and accept reported evidence. Do not implement the follow-up in the coordinating session.
5. The root may run bounded read-only status and provenance queries for Git refs, worktrees, GitHub, the tracker, worker reports, artifacts, and CI; maintain the delivery ledger; write a brief; create an empty specification branch and Draft pull request; and enqueue a merge once reported evidence passes. Those coordination queries are not executable acceptance evidence. The root does not run product tests or land code, documentation, or environment edits in the coordinating checkout.
6. When no Agent tool can run a writer, report that isolation failure and stop. Do not fall back to implementing in the coordinating session.

Complete this phase when every implementation path has a named writer executor, including late feedback.

## Maintain the delivery ledger

1. Keep one concise ledger in the specification pull request or linked Issue. For every required delivery unit, record its fixed accepted scope, accountable writer session and branch, acceptance evidence, current state, blocker, and next discriminating check. Preserve every accepted criterion unless the user makes a material scope decision. Classify a new finding as a current blocker only when it prevents accepted behavior or required evidence; otherwise record it as a separate improvement without expanding this delivery. Add reviewer, fidelity, or acceptance-environment owners only when that delivery needs those roles; trivial work does not require a fixed session count.
2. Record completed evidence against the exact commit, behavior or route, environment, and mode it demonstrated. A newer head never changes that provenance. Classify each later change by the behavior and environment it can affect before deciding what evidence remains valid.
3. Route a same-delivery bug, review finding, failed check, or acceptance finding to the existing owner. Reuse the reviewer for delta review and the Codex acceptance-environment session for rebuild, restart, diagnosis, and re-walk until its environment is handed off or cleaned up. Only one active desktop-input owner may drive the exact test application at a time. Batch related fixes into one review cycle when their affected scope is coherent.
4. Start a new owner only for an independent delivery unit, required independent judgment, a model capability the current owner lacks, an unavailable or systematically stale owner, or a standalone request after the earlier delivery closed. A merely preferred model does not replace a suitable owner. Record the reason, current branch and commit, retained evidence, open findings, and next check; mark the previous owner replaced or complete so two sessions never own the same mutable work. When the ticket is already on `master`, the replacement brief names that merged SHA.
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

1. Keep the root task as coordinator and monitor. It does not merge writer branches. Match the executor to the runtime: under Codex, prefer isolated Worktree tasks when available; under DSH, choose continuation, `subagent`, or `subagent_fork` through [the routing reference](../../../docs/agents/delegation-routing.md). Pass an explicit available provider/model when the tool supports routing. On the normal path, every writer commits only inside its own isolated worktree.
2. Assign implementation by stable module ownership, not session count. One module implementer may own several related tickets and remains accountable through fixes; use separate implementers only for independent module boundaries in the DAG. Give each owner one branch and worktree, the verified remote specification branch and SHA, its ticket set and acceptance criteria, the scratch path when one exists, and the reporting format. Never let two writers mutate the same worktree.
3. Allow read-heavy exploration and log analysis inside a module delivery unit. Keep its implementer through review, CI, E2E, and acceptance fixes unless the ledger records a replacement; every parallel writer has a disjoint module boundary, worktree, and branch.
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

1. Fetch the recorded remote specification branch, create the ticket branch from its exact SHA, and re-read the ticket and mapped domain sources from that checkout. Read scratch exploration notes when the handoff recorded a path. Isolated ticket writers start at the named test/script pair and write RED before any skill or documentation tour.
2. Follow the shared implementation workflow in [`implement`](../implement/SKILL.md). Use TDD at an agreed seam where practical, then select narrow checks through [DSH pre-push checks](../dsh-pre-push-checks/SKILL.md).
3. Preserve unrelated worktree changes. Add the required documentation, Agent Note, and real runnable snapshot when their repository rules apply. For a GUI change, make the ticket's slice ready for a non-recording product smoke. The root routes native Desktop smoke to the existing Codex computer-use validation owner through [dsh-desktop-test-instance](../dsh-desktop-test-instance/SKILL.md); a Web-only route uses [ego-browser](../ego-browser/SKILL.md) in one DSH task space per goal. Scripted DOM, direct Electron IPC, and a standalone Web page do not substitute for the native user route. Defer GIF recording and the whole-route walk until the fidelity and acceptance sessions below.
4. Run the narrowest evidence that covers the diff through `dsh-pre-push-checks`, then commit, push, and verify the remote ticket head. Do not open a pull request.
5. Return the branch, commit, checks run, review blockers, scratch notes path, and any changed dependency to the root task.

Complete a worker phase only when the remote ticket branch represents its full ticket diff and its reported evidence is reproducible.

## Merge through a merger subagent

1. Dispatch a merger subagent, not the root session, to integrate each completed ticket branch into the specification branch. Fast-forward when the histories allow it; otherwise create a merge commit. Push the specification branch and report the new head. Give the merger `/opt/homebrew/bin` on PATH. `pnpm: command not found` is a PATH miss, not a sandbox denial. When the ticket SHA is already verified and the spec update is a fast-forward of only that SHA, the merger may push with `LEFTHOOK=0`; GitHub CI on that SHA owns typecheck. Do not rewrite lefthook in the same product PR.
2. After a successful merge, recompute the ready frontier and dispatch newly unblocked writers.
3. Before each batch, have the merger subagent merge-forward current `origin/master` into the specification branch once and push it. Affected in-flight writers then merge-forward that updated remote head into their ticket branches, audit semantic conflicts, and republish the exact head. Sibling writers do not merge master independently.
4. For leftover GitHub-level dependencies that this single pull request cannot express, follow [the official stack workflow](../dsh-merging-stacked-prs/SKILL.md).

Complete this phase when every selected ticket commit is on the specification branch or has a concrete reported merge blocker.

## Review, fidelity, acceptance route, retro, and land

Follow the role sequence in [delivery session roles](references/session-roles.md): Quality completes E2E before human acceptance; during acceptance Quality runs local CI in a separate clean checkout while Delivery integrates, prepares provider and experience instructions, freezes the exact acceptance instance, maintains the Draft pull request, and monitors CI. Only after human acceptance do Scheme perform simplification and Independent code review assess the integrated candidate. The user chooses improvements; fixes return to their original module owners, then affected E2E, code-review delta, and human acceptance repeat.

1. Have Quality run the narrow deterministic checks and complete E2E before human acceptance. Keep unit, protocol, snapshot, scripted Electron, and local-CI evidence distinct; during acceptance, local CI runs in a separate clean checkout and never disturbs the frozen instance.
2. For a native GUI change, have the UI or fidelity owner use callable computer-use tools to compare every actual Electron screen with the frozen draft through [dsh-desktop-test-instance](../dsh-desktop-test-instance/SKILL.md). Preserve the required chrome, component library, information hierarchy, and primary affordance; pixel identity is not required. Send mismatches to the original module owner. Web-only routes may use the approved browser path. Do not ask the user to review while a mismatch remains.
3. Have Delivery integrate the candidate and prepare one credential-safe acceptance environment: stop leftovers for this goal, select fixture or live Platform, prepare required providers and experience instructions, walk every route step, maintain the Draft pull request, and monitor CI. Reuse this environment owner through rebuilds, diagnosis, re-walks, and cleanup; no other session drives the same Desktop concurrently.
4. Freeze the exact candidate after E2E, fidelity, and the agent acceptance walk pass. Give the user the initial handoff with the existing screenshots, exact version, application path, starting state, and acceptance route; do not wait for the later code review or GIF.
5. After human acceptance, have Scheme inspect the accepted design for simplifications and an independent reviewer examine the integrated candidate with `code-review` and `dsh-code-review`. The reviewer uses a non-primary-author model, stays accountable for its findings, and performs delta review after fixes. The user chooses which improvement proposals enter the demand.
6. Route accepted improvements and findings to the original module owners. Reintegrate them through Delivery, rerun affected deterministic checks and E2E through Quality, obtain independent code-review delta, and have the user reaccept every affected behavior. Re-run affected fidelity screens, route steps, and environment conditions; preserve unaffected evidence only with its original commit and provenance. After user acceptance, review, and regressions all pass on the exact candidate, record and publish the required GIF with `record-browser-gif` and add it to the pull request. Every product-user-visible GUI pull request must carry that final verified GIF before merge.
7. Ask every involved session to run [`retro`](../retro/SKILL.md) on only its own work; that skill and the [session retrospective standard](../../../docs/agents/session-retro.md) own the rules. The root synthesizes candidates, presents them to the user, and waits for an explicit keep-or-drop decision per item. Route accepted edits to the owning module or environment writer on the same demand branch, rerun affected checks, and do not merge to `master` before that decision.
8. Wait for required CI and live review state. Re-fetch the exact head, base, unresolved threads, approvals, checks, and mergeability after every rewrite or base change.
9. Mark the specification pull request ready. Its body carries `Closes` for the specification and every delivered ticket. After the exact head passes `all checks passed` against the current strict base and review plus retro are complete, submit it to the protected-master merge queue. The queue's synthetic `merge_group` candidate must pass `candidate verdict`; that verdict does not run on the pull-request head, and `all checks passed` does not run on the candidate. No approval is required.
10. Confirm the queued result merged and its tickets closed. Resume a failed or interrupted worker from GitHub state. Ask the user only for missing credentials, permissions, a material product decision, a retro keep-or-drop, a blocked experience-route step, conflicting official stack metadata, or release authorization.

Complete this phase when every selected ticket is on `master` or has a concrete reported blocker, GitHub shows the `Closes` pull request MERGED, GUI fidelity and the experience route have passed when they apply, the retro decision is recorded, and no release mutation has occurred without approval.

## Retire completed work

1. After GitHub shows the `Closes` specification pull request MERGED and its tickets closed, retire that delivery in the same coordinating turn. Confirm each writer is terminal through the owning runtime's task, subagent, or session state.
2. For each exact dedicated worktree that still exists, verify it has no uncommitted files, stash, unpushed commit, or unique commit absent from the remote merged result. Preserve that worktree and report the discrepancy when a check fails. A missing dedicated worktree after that MERGED `Closes` pull request is already retired; report that completion.
3. Archive a terminal Codex task only when that writer created one. Remove each remaining validated dedicated worktree, retain any shared checkout, delete merged local and remote ticket branches and the specification branch, and run `git worktree prune`.
4. Record an explicit retention reason instead when follow-up work still needs a path or branch. Delete the scratch exploration directory after the user has not asked to keep it.

Complete delivery only after this retire step: every removed path and branch was exact, merged, clean, and replaceable from GitHub, every retained artifact has a named owner and reason, and the report includes those cleanup or already-retired results.

## Report

Report the specification branch and pull request, ticket branches, checks actually run, merger results, fidelity findings, experience-route status, retro candidates and user decisions, cleanup or retention results, unresolved blockers, remaining ready tickets, and the explicit release stop point. After an explicitly authorized Product Release, read its machine-readable manifest and report Desktop, Mobile, and Platform as separate released, skipped, or blocked states; a merged release plan is not publication evidence. If a newly installed skill or project agent is absent from the current task's catalog, ask the user to start one fresh Codex task once; do not require a new task per ticket.
