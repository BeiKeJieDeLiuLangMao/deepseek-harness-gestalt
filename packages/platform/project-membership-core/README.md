---
description: "Project Membership provider with environment-namespaced JSON persistence, serialized atomic mutations, and role-gated operations."
kind: "package-reference"
---

# `@deepseek-ai/dsh-project-membership-core`

English | [中文](README.zh.md)

## Summary

Project Membership provider. Every mutation — create, invite, retract, atomic accept-with-link, decline, promote/demote, tag edit, remove — runs under one serialized write chain in this process, enforces its role gate inside the operation, validates its inputs loudly (`INVALID_PROJECT_NAME`, `INVALID_REMOTE_URL`, `INVALID_TAGS`, `INVALID_LINK`), republishes the complete environment document through an atomic temp-file rename at mode `0600` under a `0700` directory, and only then emits `project-membership/roster-invalidated`. A rejected durable write rolls that operation's exact mutation batch back out of memory before the rejection returns, so no later commit can publish a row the document refused. Concurrent callers therefore observe all-or-nothing commits: eight simultaneous invites to one account settle into exactly one pending row and seven `DUPLICATE_INVITEE` rejections. Each operation reloads committed state, so a failed write cannot leave ghost rows or affect later reads and retries. The staged document includes the published roster version.

The default file adapter stores `<storagePath>/<environment>/project-membership.json` through atomic rename at mode `0600` under a `0700` directory. It accepts only format version 1, rejects dangling or duplicate indexed records and retains corruption failures; absence means empty first boot. It has one writer. Operated multi-instance storage uses `PostgresProjectMembershipPersistence` in [Platform](../../../apps/platform/README.md), holding its namespace transaction lock across load, mutation and commit. Account deletion transfers explicit successor ownership and removes personal references in that same transaction.

Consumers rebuild cached roster views from the invalidation stream and `rosterVersion(projectId)`; the package's own invariant companion holds that published stream to strictly increasing projection versions — every commit advances its project by exactly one version, removals included, so a removal can never follow stale bookkeeping.

## Table of Contents

- [Extension Points](#extension-points)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="extension-points"></a>
## Extension Points

Config fields: `storagePath` (directory for the durable corpus) and `environment` (`'development' | 'production'`, rejected loudly otherwise). The Loader mounts the package default export directly:

```yaml
- name: '@deepseek-ai/dsh-project-membership-core'
  config:
    storagePath: '~/.dsh/projects'
    environment: 'development'
```

Alternative persistence implements `ProjectMembershipPersistence.transact`; its callback must hold exclusive authority until staged writes commit. Adding file-backed providers around one path does not provide multi-instance safety. Only external nondeterminism (uuids, wall clock) reaches tests; composed scenarios run keyless over real local storage.

<a id="model-experience"></a>
## Model Experience

Indirectly, through the authoritative roster, roles, and function tags rendered by `project_members` and member-question consumers.

#### KV Cache effect

The Provider adds no stable request prefix; roster mutations change later tool-result and member-routing content.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- **Single-process writer** — one write chain serializes all mutations within a process; two processes pointed at the same storage root have no cross-process lock and can lose updates. Scaling needs a backend swap, not more instances.
- **Review-gated production stance** — development composes keylessly over local storage; routed member questions remain fail-closed behind the standing independent encryption review recorded in [the placement Agent Note](../../../.agents/notes/implemented/feature/2026-08-27-project-membership-core.md). This package ships no transport, credentials, or plaintext.
- **No administration surfaces** — pruning declined/retracted invitations and audit export are deferred until a consumer exists.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
