# Agent Note: Default ticket delivery orchestration

Status: implemented

English | [中文](2026-08-16-default-ticket-delivery-orchestration.zh.md)

## Problem

A short request to implement a ticket does not by itself tell a coding agent whether it may create worktrees, delegate, commit, push, open pull requests, or merge. Repeating that authority and the coordination topology in every prompt adds human work and still permits different sessions to choose incompatible stopping points.

Subagent transcripts are also a poor durable coordination record. A worker can be restarted, its task can lose context, and sibling communication support can vary by host or session. GitHub already stores the ticket graph, review state, checks, and merged result.

## Decision

The repository's [delivery orchestrator](../../../skills/orchestrate-dsh-delivery/SKILL.md) is the default workflow when a user asks to implement, fix, continue, or land an issue or specification. That request authorizes the root task to create isolated ticket worktrees and branches, dispatch workers, edit, commit, push, open or update pull requests, respond to review, and merge work whose required evidence passes. Explicit limits in the current request override the default.

The root task is the sole coordinator and merger. GitHub Issues, pull requests, checks, and official stacks are durable state. Each ready ticket has one write-capable owner and one worktree; independent tickets may run concurrently. Read-heavy exploration and review may use subagents, while follow-ups and cross-ticket discoveries route through the root task and are recorded in GitHub or the owning repository document. Sibling-agent communication is not required.

Project Codex roles encode the two recurring responsibilities: `ticket_worker` owns one ticket through its verified pull request without merging, and `dsh_reviewer` performs a read-only standards-and-specification review. If task or worktree creation is unavailable, the root task preserves the same ownership model by executing ticket writers sequentially.

The [pre-push workflow](../../../skills/dsh-pre-push-checks/SKILL.md) selects outgoing evidence, and the [native stack decision](2026-08-02-native-github-stacks-and-optional-rebases.md) owns dependent pull-request landing. A merge waits for live local evidence, CI, review, and merge requirements. Tag creation, GitHub Releases, publication, signing, notarization, and deployment always require explicit per-release approval.

## Alternatives considered

**Require a full delivery prompt for every request.** This keeps authority visible in each conversation but makes the user restate stable repository policy and creates avoidable differences between sessions.

**Use one long-lived task for all implementation.** This avoids task creation but mixes unrelated mutable state, grows context without bound, and weakens ticket-level recovery.

**Let workers coordinate directly.** Peer messaging can reduce root-task relays, but it makes transient agent topology part of the workflow and duplicates durable ticket and pull-request state.

**Stop every ticket before push or merge.** This maximizes per-step confirmation but preserves the manual handoffs this repository default is intended to remove. Release mutations retain the human boundary because they affect distributed users and registries beyond the reviewed pull request.

## Consequences

A user can request implementation with a ticket number or specification reference and expect delivery through verified merge without repeating routine Git and GitHub permissions. The root task can replace or resume workers from GitHub state, and independent tickets can progress in parallel without shared writable checkouts.

Automatic merge increases the importance of accurate ticket scope, repository checks, and live review-state inspection. Explicit user limits remain authoritative, unavailable isolation reduces execution to sequential writers, and release work always pauses for approval.
