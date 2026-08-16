---
name: orchestrate-dsh-delivery
description: Orchestrate DeepSeek Harness issue and specification delivery from the Gestalt GitHub tracker through isolated implementation, review, CI, and merge. Use by default when the user asks to implement, fix, continue, or land a ticket or specification in this repository, including short requests such as "implement #123" or "continue this spec".
---

# Orchestrate DSH Delivery

Own the delivery graph from the root task. Treat GitHub Issues, pull requests, checks, and official stacks as durable coordination state. Use Codex tasks and subagents as replaceable executors, not as the source of truth.

## Establish authority

1. Read [the tracker contract](../../../docs/agents/issue-tracker.md), [domain routing](../../../docs/agents/domain.md), `CONTEXT-MAP.md`, and the applicable repository instructions and active Agent Notes.
2. Fetch the complete issue or specification, including comments, labels, acceptance criteria, dependencies, and current pull requests. Resolve ambiguous GitHub numbers as the tracker contract requires.
3. Interpret a request to implement, fix, continue, or land the work as authorization to create branches and isolated worktrees, edit files, commit, push, open or update pull requests, respond to review, and merge after required evidence passes. An explicit user limit such as "do not push" or "stop before merge" overrides this default.
4. Keep tag creation, GitHub Releases, registry publication, signing, notarization, deployment, and other release mutations behind explicit per-release approval. Ticket delivery does not authorize them.

Complete this phase when the requested outcome, live ticket graph, mutation authority, and release stop point are explicit.

## Build the delivery frontier

1. Decompose only when the source is not already ticketed. Use the Matt specification and ticket skills for product shaping and blocker-first ticket publication; do not rewrite accepted ticket scope during implementation.
2. Order tickets by live dependency state. A ready frontier contains only tickets whose blockers are merged or represented by an intentional official PR stack.
3. Keep independent tickets as independent pull requests. Use a stack only for a real code dependency, never merely to gain parallelism.

Complete this phase when every selected ticket has one base, one acceptance source, and a known dependency position.

## Dispatch isolated writers

1. Keep the root task as the sole coordinator and merger. Prefer one Codex Worktree task per ready ticket when task/worktree tools are available. Assign the project `ticket_worker` role when custom agents are available.
2. Give each worker exactly one ticket, one `codex/<issue>-<slug>` branch, one worktree, its verified base, the acceptance criteria, and the required reporting format. Never let two writers mutate the same worktree.
3. Allow read-heavy exploration, log analysis, and review to run as subagents inside a ticket. Keep one writer for that ticket unless every writer has a disjoint worktree and branch.
4. Route follow-ups and dependency discoveries through the root task. Sibling agents need no direct communication. Record durable cross-ticket facts in the relevant Issue, pull request, Context document, or Agent Note.
5. If task/worktree creation is unavailable, execute tickets sequentially with one writer in the current checkout. Use subagents only for read-only work and report the reduced isolation.

Complete this phase when every ready ticket has one accountable writer and no mutable checkout has multiple owners.

## Enforce the worker contract

Require each ticket worker to:

1. Re-read the ticket and mapped domain sources from its own context.
2. Use the Matt `implement` workflow and TDD at an agreed seam where practical. Repository instructions and [DSH pre-push checks](../dsh-pre-push-checks/SKILL.md) override the Matt workflow's generic full-suite advice.
3. Preserve unrelated worktree changes. Add the required documentation, Agent Note, real runnable snapshot, and visual evidence when their repository rules apply.
4. Run the narrowest evidence that covers the diff through `dsh-pre-push-checks`, then commit, push, and verify the remote head.
5. Open or update a pull request that links the ticket, carries canonical labels, explains the behavior and evidence, and leaves release work out of scope.
6. Return the branch, commit, pull request, checks run, CI state, review blockers, and any changed dependency to the root task.

Complete a worker phase only when the remote pull request represents its full ticket diff and its reported evidence is reproducible.

## Review and land

1. Review each pull request against both the repository standards and its ticket/specification with `code-review` and `dsh-code-review`; use the project `dsh_reviewer` role when available. Send fixes to the owning worker.
2. Wait for required CI and live review state. Re-fetch the exact head, base, unresolved threads, approvals, checks, and mergeability after every rewrite or base change.
3. Merge an independent pull request only after its required local evidence, CI, review, and merge requirements pass. For dependent pull requests, follow [the official stack workflow](../dsh-merging-stacked-prs/SKILL.md) and land blocker-first.
4. Confirm GitHub reports the selected pull requests as merged, update the tickets with verification evidence, close resolved tickets, and recompute the ready frontier.
5. Resume a failed or interrupted worker from GitHub state. Ask the user only for missing credentials, permissions, a material product decision, conflicting official stack metadata, or release authorization.

Complete delivery when every selected ticket is merged or has a concrete reported blocker, GitHub reflects the final state, and no release mutation has occurred without approval.

## Report

Report merged tickets and pull requests, checks actually run, unresolved blockers, remaining ready tickets, and the explicit release stop point. If a newly installed skill or project agent is absent from the current task's catalog, ask the user to start one fresh Codex task once; do not require a new task per ticket.
