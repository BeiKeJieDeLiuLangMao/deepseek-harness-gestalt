# `@deepseek-ai/dsh-project-membership-core`

English | [中文](README.zh.md)

Project Membership provider over an exclusive document transaction. Every mutation enforces its role checks inside the operation and commits a complete document before emitting roster invalidations. Each operation reloads committed state, so a failed write cannot leave ghost rows or affect later reads and retries. The staged document includes the published roster version.

The default file adapter stores `<storagePath>/<environment>/project-membership.json` through atomic rename at mode `0600` under a `0700` directory. It accepts only format version 1, rejects dangling or duplicate indexed records and retains corruption failures; absence means empty first boot. It has one writer. Operated multi-instance storage uses `PostgresProjectMembershipPersistence` in [Platform](../../../apps/platform/README.md), holding its namespace transaction lock across load, mutation and commit. Account deletion transfers explicit successor ownership and removes personal references in that same transaction.

Consumers rebuild cached roster views from the invalidation stream and `rosterVersion(projectId)`; the package's own invariant companion holds that published stream to strictly increasing projection versions — every commit advances its project by exactly one version, removals included, so a removal can never follow stale bookkeeping.

## Extension Points

Config fields: `storagePath` (directory for the durable corpus) and `environment` (`'development' | 'production'`, rejected loudly otherwise). The Loader mounts the package default export directly:

```yaml
- name: '@deepseek-ai/dsh-project-membership-core'
  config:
    storagePath: '~/.dsh/projects'
    environment: 'development'
```

Alternative persistence implements `ProjectMembershipPersistence.transact`; its callback must hold exclusive authority until staged writes commit. Adding file-backed providers around one path does not provide multi-instance safety. Only external nondeterminism (uuids, wall clock) reaches tests; composed scenarios run keyless over real local storage.

## Model Experience

None, as Project Membership authority stays outside agent sessions and model requests.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Single-process writer** — one write chain serializes all mutations within a process; two processes pointed at the same storage root have no cross-process lock and can lose updates. Scaling needs a backend swap, not more instances.
- **Review-gated production stance** — development composes keylessly over local storage; routed member questions remain fail-closed behind the standing independent encryption review recorded in [the placement Agent Note](../../../.agents/notes/implemented/feature/2026-08-27-project-membership-core.md). This package ships no transport, credentials, or plaintext.
- **No administration surfaces** — pruning declined/retracted invitations and audit export are deferred until a consumer exists.
