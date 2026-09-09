# Agent Note: recoverable Mobile account deletion

Status: implemented

English | [中文](2026-09-09-mobile-account-deletion.zh.md)

## Problem

Current-installation sign-out and selected Personal Pairing revocation leave a durable Platform Account and associated personal records. Account deletion also crosses PostgreSQL, attachment object storage, shared membership authority and installation-local storage, whose failures cannot share one atomic commit. [Issue #636](https://github.com/gestaltrun/deepseek-harness-gestalt/issues/636) owns this feature.

## Decision

Account deletion is a distinct Account operation. The acceptance transaction marks the Account deleting and revokes every Account Session. The provider then revokes durable pairing and Relay authority before publishing session invalidations and cleaning owner data. Deleting Accounts cannot finish pending login, refresh, admit connections or publish new pairing, attachment and membership references. Invalidation accelerates closure; it never supplies durable authorization. Unfinished cleanup remains deleting or action-required and retries after restart. Retry sweeps isolate and report each Account failure, continue other Accounts, and expire completed receipts independently. Completion requires every configured owner to finish; a new registration receives a new Account id. Ordinary sign-out retains [its installation-scoped semantics](2026-08-17-platform-account-installation-sessions.md).

Mobile persists the operation id, random recovery token, selected successors and initiating Installation key before sending the request. Recovery is signed by that same key and permits only progress or replacement successor choices. If the server has not accepted the operation, the client retries the original request with its ordinary Account authorization; a receipt cannot create deletion authority. An accepted deletion resumes without a valid Account Session. Mobile persists a cloud-complete checkpoint before removing local Account material. Its account-scoped key and cache cleanup resumes from that checkpoint without contacting the server, even after the server receipt expires; local cleanup failure retains the checkpoint. Other Accounts' material and the Installation id remain. Other devices' local files are not remotely erased. Completed server receipts have an explicit operational lifetime; this is not a legal retention policy.

A solely owned project with other joined members requires an explicit successor membership for that project. The membership transaction promotes the successor before removing the deleting owner. Another existing owner permits direct removal. A project without other members loses its cloud records and indexes, without deleting local workspace files. A departed successor requires a replacement through the same proof-bound receipt; accepted revocation stays effective. Invitations involving the deleted account are removed, while other members and their data remain.

## Shared persistence and lock order

Operated account deletion requires the dedicated PostgreSQL Project Membership document. A namespace transaction lock spans load, role checks, mutation, roster-version persistence and commit, including an absent target. The file adapter remains a single-writer local composition. Each operation reloads its committed document; failed persistence cannot leave ghost rows for a later write or read. Roster invalidations publish only after the same version is durable. This replaces the exact inverse-closure mechanism and delayed version in the [frozen rollback record](../../archived/bug-fix/2026-08-27-project-membership-commit-point-rollback.md), preserving its atomic failure, retry and no-ghost guarantees.

Owner transactions acquire their document lock before shared locks on newly referenced Account rows, in sorted Account-id order. Login locks the Account row before checking deletion and creating its Session; acceptance either revokes that committed Session or prevents its creation. Acceptance holds only Account and Session rows and commits before entering any owner. This prevents account deletion from reversing the owner-to-account lock order. PostgreSQL rejects new references to absent or deleting Accounts at commit, including requests authenticated before acceptance. Per-instance deletion execution is serialized so held cross-instance advisory leases do not consume the pool connections needed by cleanup.

Membership import accepts only an approved immutable snapshot into an uninitialized target. A separate source-digest marker makes identical re-import a no-op after subsequent writes; startup never imports. [The cutover procedure](../../../../docs/cookbook/platform-account-deletion-cutover.md) owns all-writer fencing, source reconciliation, backup, activation and current-authority rollback export.

## Attachment ownership

Publication retains Account-to-pairing ownership independently of later unpairing. OSS metadata retirement, including consume, expiry and revoke, commits pairing-owned object and quota cleanup records before external deletion. Those records survive object deletion failure and process restart; account completion waits for them. A per-publication PostgreSQL advisory lock spans upload and finalization, and retirement cannot discard a live publication. PostgreSQL ciphertext cleanup likewise waits for publication recovery and durable quota releases. These records belong to existing attachment owners; there is no generic job service.

Objects retired by older code may have lost Account attribution. An advertised lifecycle rule alone does not prove their deletion or a maximum removal time. The cutover procedure requires read-only inventory and actual lifecycle evidence, and leaves unknown historical ownership or expiry as a release/privacy blocker. Completion covers data retained by the configured owners, not an unsupported claim of forensic erasure from every device or historical backup.

## Alternatives considered

**Rename sign-out or unpair to deletion.** Both retain the Account and independent grants.

**One transaction across every store.** Object storage and installation storage do not share PostgreSQL's commit. Durable owner progress permits recovery without restoring access.

**Keep host-local membership files for multiple instances.** Independent cached documents can restore deleted references. A shared namespace transaction is necessary even when both writers happen to mount the same file.

**Depend on inverse closures for membership rollback.** A complete authoritative reload is already required for shared persistence; retaining a second inverse mutation representation adds drift. Failed transactions discard staged changes and the next operation reloads committed state.

**Require customer support instead of an app workflow.** A contact link supplies neither user-initiated deletion nor durable progress.

## Consequences

Deletion preserves other members and local work files but can require successor selection, retries and operational cutover. Real PostgreSQL tests pin write-first/delete-first locking, shared membership import, attachment deletion failure, restart recovery and live-upload exclusion. Real Loader/TCP/P-256 tests distinguish request loss before acceptance from response loss after acceptance. The runnable Account example pins revocation and recovery; the Mobile entry snapshot pins confirmation, successor selection and progress presentation. Native storage tests cover all retained Desktop keys and receipts for the deleting account and isolation of another account. Exact candidate native GUI acceptance and its final GIF remain separate required delivery evidence; keyless tests do not substitute for that route. Apple login, identity linking and review-only access bypasses are outside this feature.
