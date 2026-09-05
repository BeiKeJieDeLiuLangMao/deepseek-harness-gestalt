# Agent Note: Client Session admission registry

Status: implemented

English | [中文](2026-09-05-client-session-admission-registry.zh.md)

## Problem

Canonical Session conversation UI must serve feature-owned identities such as Side Chat without calling stock Host Session Remotes. Those identities can exist as renderer-only provisionals before Host publication, and ordinary Session RPCs reject or mis-own them. The Client Session object layer had no exact-identity registry, so a later product adapter could not intercept prompt, cancel, queue mutation, or command on an already materialized `Session`.

## Decision

`ClientSessions` owns a live admission registry on the Client face of `api/session-controller`. `registerAdmission(sessionId, route)` binds one exact Session identity; `registerAdmissionAdapter(adapter)` binds a `handles(sessionId)` matcher with a unique adapter id. Exact identities outrank adapters. The default conflict strategy replaces the prior exact owner; `conflict: 'reject'` throws. Each registration returns a token-checked disposer: an outdated disposer does not revoke a newer owner, and a disposer after `ClientSessions` disposal is a no-op.

`SessionManager` passes the live resolver into every `Session`. Prompt, cancel, queue mutation, and command consult that resolver at call time, so late registration, replacement, and revocation apply to existing bindings. A hit that returns a failure or throws never falls through to stock Host Remotes. An omitted `updateQueue` or `command` on a hit fails loud. A command never becomes a prompt. Ordinary Sessions without a hit keep stock Remote routing. Registration does not grant Host authority; titles and catalog subagent addresses are not credentials.

`modelRoute`, `commandCatalogSessionId`, and `skillCatalogSessionId` consult the live owner. Omitting the catalog helpers hides those catalogs for a feature-owned Session. A catalog-addressed subagent without a feature route also hides commands and skills. This slice does not install a stock model catalog for ordinary Sessions, does not wire skill or command catalog consumers, does not trim history to `historyScope: 'owned-suffix'`, and does not register the Side Chat product adapter.

## Alternatives considered

**Keep admission only on the retained `client/runtime` barrel.** Rejected because the Client Session object layer now lives in `api/session-controller/client`; a second registry would duplicate identity and miss existing bindings.

**Authorize by title or catalog subagent address.** Rejected because those facts are display and navigation data. They must not admit Host-owned operations for a feature identity.

**Fall through to stock Remotes after a feature failure.** Rejected because a hit already selected an owner; retrying Host Session RPCs would double-dispatch and can succeed against the wrong Agent.

**Translate unmatched commands into prompts.** Rejected because slash commands have distinct Host admission and must fail loud when the owner omits `command`.

## Consequences

Canonical `Session` prompt, cancel, queue, and command can be owned by a Client plugin without Host privilege. Side Chat and other feature Sessions still need their product adapter, stock model catalog, catalog consumers, and history suffix trimming before the conversation UI is complete. `ui-model-selection` already reads `modelRoute`; ordinary Sessions stay without a stock route until that later slice.

## Testing

`packages/api/session-controller/tests/session-admission.client.spec.ts` pins provisional first prompt, ordinary Remote preservation, late registration, replacement disposers, reject conflicts, no-fallback failures, command isolation, adapter dispatch, title/address non-authorization, and disposal. `queue-store.client.spec.ts` pins queue mutation through an injected admission resolver.
