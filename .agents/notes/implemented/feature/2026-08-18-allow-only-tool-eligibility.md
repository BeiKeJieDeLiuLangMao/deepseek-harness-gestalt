# Agent Note: Allow-only tool eligibility

Status: implemented

English | [中文](2026-08-18-allow-only-tool-eligibility.zh.md)

## Problem

An agent preset can compose a tool catalog, but users also need Workspace- and Session-specific additions. The existing `ctx.tools.restrict()` primitive accepts both allow and deny filters and exists for trusted internal composition. Projecting that primitive directly into user settings would create two policy vocabularies, make later registrations behave differently under allow and deny, and contradict the product's positive configuration.

Eligibility must also remain one fact across model assembly and execution. Filtering only request schemas would let a stale or forged call execute, while filtering only dispatch would advertise tools the model cannot use. Persisting only the configured names would still be insufficient for replay because dynamic registration decides which schemas existed for a particular request.

## Decision

`dsh-tools` owns a positive eligibility contribution per scope. Contributions along the preset-to-Agent scope chain union. No contribution preserves the existing unrestricted catalog; a declared chain whose union is empty allows no end tool. Once active, the same resolved view filters inherited and scope-local definitions for `schemas()`, `get()`, and `execute()`. Names are not validated when declared, so a preset or setting may precede dynamic tool registration. The internal allow/deny `restrict()` surface remains available to trusted plugins and is absent from user configuration.

`dsh-agent-tool-eligibility` is the preset row and exposes one required `allow` list. `dsh-tools-eligibility` registers the allow-only `tool-eligibility` settings section with `workspaces` and `sessions` maps. It contributes the matching Workspace list and then the matching Session list to each live Agent; both are positive additions to the preset base, and live settings changes replace that contribution without restarting the Session. Workspace matching uses the stable Workspace id after locating the Workspace whose canonical path equals `session.header.cwd`.

The resolved tool view is the sole runtime fact. Agent-loop request assembly takes schemas from it, and dispatch resolves the called definition from it before the tool body. `session.toolEligibility` returns the same positive union and current schemas to Host clients. The exact model-visible schemas remain reconstructable from the existing durable `request/header` event, which records every assembled request's tools. No eligibility event is added: recording current settings separately would duplicate policy input without proving which dynamic definitions reached that request.

Code Mode keeps `run_code` as reserved presentation infrastructure. Positive eligibility filters the end-tool definitions used to generate its SDK; the transport is not a separately configurable capability.

## Verification

Tool registry tests cover scope-chain union, explicit allow-none, inherited and scope-local schema filtering, stale-call refusal, and body non-execution. Resolver tests cover preset, Workspace, and Session additions, dynamic registration, live settings updates, and absence of a user-facing deny field. API tests cover `session.toolEligibility`. The Web minimal-preset keyless replay mounts an allow-only preset, records only `bash` in the durable request header, executes it, and proves a stale `str_replace_editor` call fails before execution.

## Alternatives considered

**Expose `restrict()` as settings.** Rejected because deny is an internal composition mechanism, while the accepted user configuration is positive-only.

**Compile eligibility into an internal restriction per Agent.** Rejected because internal restrictions deliberately exempt scope-local registrations used by delegation machinery. Eligibility must judge every model-visible end tool, including definitions registered in the Agent's own scope.

**Add a durable eligibility event.** Rejected because `request/header.tools` already records the exact model-visible result. A settings event would record an input that may not match the dynamic catalog at request time and would create a second reconstruction source.

## Consequences

Preset authors and users configure only additive allow lists, while the model, Host API, and executor share one catalog. Existing compositions that declare no eligibility remain unrestricted. An effective empty union intentionally removes every end tool, and a misspelled or currently absent name grants nothing until a tool with that exact name registers. Settings documents key entries by stable ids, so a generic settings editor needs those ids; richer Workspace and Session affordances can write the same namespace later without changing the policy model.
