# Agent Note: Client Session admission registry

Status: implemented

English | [中文](2026-09-05-client-session-admission-registry.zh.md)

## Problem

Canonical Session conversation UI must serve feature-owned identities such as Side Chat without calling stock Host Session Remotes. Those identities can exist as renderer-only provisionals before Host publication, and ordinary Session RPCs reject or mis-own them. The Client Session object layer had no exact-identity registry, so a later product adapter could not intercept prompt, cancel, queue mutation, or command on an already materialized `Session`.

## Decision

`ClientSessions` owns a live admission registry on the Client face of `api/session-controller`. `registerAdmission(sessionId, route)` binds one exact Session identity; `registerAdmissionAdapter(adapter)` binds a `handles(sessionId)` matcher with a unique adapter id. Exact identities outrank adapters. The default conflict strategy replaces the prior exact owner; `conflict: 'reject'` throws. Each registration returns a token-checked disposer: an outdated disposer does not revoke a newer owner, and a disposer after `ClientSessions` disposal is a no-op.

`SessionManager` passes the live resolver into every `Session`. Prompt, cancel, queue mutation, and command consult that resolver at call time, so late registration, replacement, and revocation apply to existing bindings. A matching adapter is invoked from `binding.session`; an unmatched Session stays on stock Remotes. A hit that returns a failure or throws never falls through to stock Host Remotes, including `subagents.prompt` and `subagents.interruptByParent` when the Session already has a catalog subagent address. An omitted `updateQueue` or `command` on a hit fails loud. A command never becomes a prompt. Ordinary Sessions without a hit keep stock Remote routing, including those subagent routes. Registration does not grant Host authority; titles and catalog subagent addresses are not credentials.

`commandCatalogSessionId` and `skillCatalogSessionId` remain lookup-only helpers. Omitting them hides those catalogs for a feature-owned Session. A catalog-addressed subagent without a feature route also hides commands and skills. `modelRoute` serves Host `session.modelCatalog` and `session.selectModel` for ordinary and catalog-addressed Sessions. A registered admission helper replaces that stock route, including an explicit undefined that hides the selector until detach. Unknown identities stay unavailable. `historyScope` is declared and unread. This slice does not register the Side Chat product adapter.

## Alternatives considered

**Keep admission only on the retained `client/runtime` barrel.** Rejected because the Client Session object layer now lives in `api/session-controller/client`; a second registry would duplicate identity and miss existing bindings.

**Authorize by title or catalog subagent address.** Rejected because those facts are display and navigation data. They must not admit Host-owned operations for a feature identity.

**Fall through to stock Remotes after a feature failure.** Rejected because a hit already selected an owner; retrying Host Session RPCs would double-dispatch and can succeed against the wrong Agent.

**Translate unmatched commands into prompts.** Rejected because slash commands have distinct Host admission and must fail loud when the owner omits `command`.

## Consequences

Canonical `Session` prompt, cancel, queue, and command can be owned by a Client plugin without Host privilege. `ui-model-selection` reads live `sessions.modelRoute`: ordinary and catalog-addressed Sessions keep the Host catalog, and a feature route can hide or replace it. Side Chat still needs its product adapter, skill/command catalog consumers, and history suffix trimming before the conversation UI is complete.

## Testing

`packages/api/session-controller/tests/session-admission.client.spec.ts` pins provisional first prompt, ordinary Remote preservation, late registration, replacement disposers, reject conflicts, no-fallback failures including thrown queue and command, command isolation, adapter `handles` dispatch through `binding.session` with unmatched Sessions on stock Remotes, catalog-addressed subagent stock routes with and without admission, title/address non-authorization, disposal, lookup-only command/skill helpers, and stock `modelRoute` catalog plus select with admission precedence and detach restore. `packages/client/ui-model-selection/tests/model-directory.client.spec.ts` drives `ModelDirectory` load and select through live `ClientSessions.modelRoute`. `packages/client/ui-model-selection/tests/browser-plugin.client.spec.ts` pins `/model` availability through the same helper. `queue-store.client.spec.ts` pins queue mutation through an injected admission resolver.
