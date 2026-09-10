# Enable recoverable account deletion on Platform

English | [中文](platform-account-deletion-cutover.zh.md)

This procedure switches the operated two-instance deployment from host-local membership files to one PostgreSQL authority. It requires an approved Platform candidate, access to each instance's private membership volume, a private backup directory, and permission to stop all membership writers. [Platform deployment](../../apps/platform/README.md) owns image promotion; [the deletion decision](../../.agents/notes/implemented/feature/2026-09-09-mobile-account-deletion.md) owns account and cleanup semantics. These commands do not authorize production cutover or deletion of a normal user account.

Ordinary Platform Deploy verifies every predecessor before starting any candidate and refuses file-to-PostgreSQL or PostgreSQL-to-file membership changes. Its separate `membership_cutover` mode performs this first activation under the same release-candidate and production authorization checks. Reserve a maintenance window, prepare dedicated test-account login beforehand, and prevent external writers or concurrent manual deployments. The window interrupts Platform login, pairing, Relay and cloud membership access.

Set Environment `production` variables `PLATFORM_MEMBERSHIP_BACKEND=postgres`, `PLATFORM_ACCOUNT_DELETION_RETRY_INTERVAL_MS` and `PLATFORM_ACCOUNT_DELETION_RECEIPT_LIFETIME_MS` to match the activated runtime configuration before subsequent normal deployments. Both budgets must be positive safe integers. Leaving the backend variable unset selects `file`; setting it does not authorize or execute migration.

Every first import and retry revalidates the live source on both fenced hosts; a retained snapshot alone does not establish current source agreement. Maintenance CLIs use a transaction-bound container name, command digest and exact container id. Client failure or interruption triggers bounded kill, wait, exit inspection and removal; an unverified daemon state remains unresolved. The final sixty seconds of the maintenance budget are reserved for cleanup. PostgreSQL membership migration and import apply the remaining statement and lock deadline before every SQL operation, including commit; rollback and daemon cleanup do not depend on an already expired operation budget.

Each Cloud Assistant action receives the smaller of its existing timeout (300 seconds, or 1800 for staging) and the transaction time remaining. Its absolute action deadline is passed to the host. CLI and PostgreSQL work end sixty seconds before that deadline; cleanup has an independent fifty-five-second limit and leaves five seconds for exit reporting. An earlier external SIGKILL can still prevent cleanup confirmation: the retained CLI identity and importing phase then block continuation until the same transaction proves that container quiescent.

## Execute the bounded maintenance transaction

1. Prepare the normal merged candidate, numbered plan and immutable image. Supply the approved first-source digest, identical predecessor image/revision, and a maintenance budget through the [Platform Deploy inputs](../../apps/platform/README.md). Select `membership_cutover=true`, `deploy=true` and `publish_release=false`; bootstrap and ordinary recovery are incompatible. The controller rejects a budget exceeding the remaining credentials or signed URLs before stopping either writer.
2. The controller stages verified bytes without booting or replacing the collector, binds both original containers, disables their restart policies and waits for clean stops. It captures only after both fences succeed. The first source must match its approved digest and the second volume must remain empty. Source changes, unexpected volume consumers, attachment metadata, OSS objects or lifecycle changes leave the transaction unresolved without importing or deleting data.
3. Import writes the approved source once through the existing CLI. A read-only check from the second host verifies the separate source marker and current text bytes before either candidate starts. This database write/read is migration evidence; it does not substitute for dedicated-account product acceptance.
4. Both loopback candidates and both serving instances must return strict readiness for PostgreSQL membership, account deletion, OSS and their expected instance ids. Public readiness must observe both. The controller archives its stable record and preserves old volumes, snapshots and stopped predecessor containers. It publishes no release.
5. Re-run the same approved inputs within the recorded deadline to resume a failed phase. A changed candidate, source, host generation, configuration or expired deadline refuses automatic continuation. Any unresolved membership record blocks ordinary deployment/recovery. Inspect that record and the private host backups; never delete it to bypass the stop. After PostgreSQL boot is possible, continue with PostgreSQL or use the current-export rollback below, never the original snapshot. GUI login, deletion and GIF capture happen after activation and never hold the maintenance window open.

## Prepare immutable source evidence

1. Inventory every serving Platform instance and any candidate or rollback container capable of writing membership state. Stop all such writers before taking the final snapshots. Copy each `<storagePath>/production/project-membership.json` into a separate private evidence directory. Preserve the original volumes. A missing file is not evidence of an empty account corpus.
2. Run the candidate's bundled utility for each file. `capture` validates the complete membership document, writes a new `0600` backup under a newly created `0700` directory, verifies its bytes, and prints only its SHA-256. Existing backups are never overwritten. Use `--empty` instead of `--source` only after an operator verifies that every instance has no membership records.

```sh
node apps/platform/dist/membership-cutover-cli.mjs capture --source /private/instance-1/project-membership.json --output /private/cutover/instance-1.json
node apps/platform/dist/membership-cutover-cli.mjs capture --source /private/instance-2/project-membership.json --output /private/cutover/instance-2.json
```

3. Compare both complete documents and digests. Different documents require a reviewed reconciliation that preserves every valid project, membership, invitation, owner and unique remote/name binding. Do not select an arbitrary host or concatenate rows. Record the approved document's full digest independently of its eventual PostgreSQL content.
4. Verify the attachment authority is `bridge` or `oss`. Account deletion refuses the legacy delivery phase. Read the live bucket lifecycle rule and inventory under exactly `PLATFORM_OSS_OBJECT_PREFIX`; use read-only OSS `GetBucketLifecycle` and `ListObjectsV2` operations with the deployment's configured region and endpoint. Match each retained object to its metadata or pairing-owned cleanup record. Do not run the lifecycle-enforcement CLI or delete objects during this preflight. A configured one-day expiry rule alone proves neither actual removal nor a maximum completion time. Record the provider's verified lifecycle timing and evidence of any unmatched objects' disappearance. If an older object has lost account attribution, its ownership or latest removal time is unknown until independently proven; that uncertainty blocks any stronger account-deletion privacy promise and formal release relying on it.

## Import and activate

1. Keep every file writer stopped. Run the following inside the approved candidate environment with its normal PostgreSQL/TLS configuration and selected identity namespace. `--writers-fenced` records the operator's acknowledgement; the utility cannot remotely prove that every process is stopped.

```sh
node apps/platform/dist/membership-cutover-cli.mjs import --source /private/cutover/approved.json --sha256 FULL_APPROVED_SHA256 --writers-fenced
```

The target must be uninitialized. The document and a separate immutable source-digest marker commit under one namespace lock. Repeating the same approved import is a no-op even after later membership changes; another digest is rejected. Startup never imports a file or overwrites PostgreSQL.

2. Set `PLATFORM_MEMBERSHIP_BACKEND=postgres` on every serving instance and explicitly supply positive safe integers for `PLATFORM_ACCOUNT_DELETION_RETRY_INTERVAL_MS` and `PLATFORM_ACCOUNT_DELETION_RECEIPT_LIFETIME_MS`. The first controls background retries; the second bounds completed recovery receipts, not legal retention. Preserve the source backups. Start only candidates configured for the shared authority.
3. Check each instance directly and through the normal load balancer. Verify the immutable image candidate separately. `/readyz` must report each expected `instanceId`, `membershipStorage: "postgres"`, `accountDeletion: true`, and the selected attachment storage. Verify shared reads and writes across both instances before reopening traffic. Use dedicated test Accounts, projects and attachments for the Mobile confirmation/cancel, successor, interrupted deletion, recovery and completed-deletion route. Never exercise real deletion on an operator's normal account.

## Roll back without restoring deleted references

Stop every PostgreSQL membership writer, including background deletion workers, before export. The utility refuses rollback export while an account deletion remains unfinished; finish it under the shared authority first. A file from before PostgreSQL writes is never a valid rollback source.

```sh
node apps/platform/dist/membership-cutover-cli.mjs export --output /private/rollback/current.json --writers-fenced
```

Verify the exported digest and complete document, install those exact bytes into every stopped file-backed instance, verify their copies, switch all instances together, and only then resume traffic. Do not resume simultaneous file writers as a horizontally safe deployment; file persistence retains its single-writer restriction. If the all-writer fence, source agreement, current export, attachment provenance or lifecycle evidence cannot be established, retain the candidate and backups and report the specific blocked step.
