# Agent Note: Desktop Mobile installation management

Status: implemented

English | [中文](2026-09-09-desktop-mobile-installation-management.zh.md)

## Problem

A Platform Account may reach its Mobile installation quota after acceptance runs or a lost device leaves an active Account Session. Current-installation sign-out cannot revoke another installation, while Personal Pairing revocation removes separate Desktop access authority and does not free an Account installation slot. [Issue #644](https://github.com/gestaltrun/deepseek-harness-gestalt/issues/644) owns the distinction and the Desktop recovery path.

The operation must remain consistent with account deletion, refresh rotation and an already-authorized login that has not finished polling. Revoking only the Session observed before the transaction could let one of those concurrent operations restore target access after Desktop reports success.

## Decision

The existing Platform Account module provides two Desktop-only operations. `listMobileInstallations` authenticates the calling Desktop Account Session and returns the active Mobile installations owned by the same Account. `revokeMobileInstallation` authenticates the calling Desktop, binds its one-use installation proof to the target Installation id, and delegates one atomic compare-and-mutate operation to the Account backend. The transaction commits each revoked Session and a durable invalidation record together. The service attempts every publication independently and acknowledges only accepted deliveries.

The view carries the opaque Installation id for a later authenticated mutation, but presentation code never renders or treats that value as a user reference. It renders the authenticated device name and platform plus the first twelve hexadecimal characters of the SHA-256 Installation-id digest. A persisted Session created before presentation fields existed remains listed and removable with an explicit unavailable label. The short reference is stable display data only. The list does not infer creation time, last activity, online state or IP address from Session rows.

Only an active Desktop Installation may call either operation. The backend transaction locks already-authorized login attempts for the target Installation in id order, then the Account row, the calling Session and target Session rows. It rejects a changed caller, a deleting Account, a target outside the caller's Account, and a target with neither an active Mobile Session nor a pending invalidation. This follows the login order of Attempt, Account and Session while preserving account deletion's Account-before-Session order. Refresh either commits before target Session revocation or observes the inactive Session afterward.

The transaction marks every matching active target Session inactive, removes its refresh authority, and marks already-authorized target login attempts for the same provider identity used. The invalidation records have no Account or Session foreign key, so Account deletion cannot remove undelivered work. Every Platform Account composition supplies `sessionInvalidationRetryIntervalMs`; its independent recovery timer lists only the selected identity namespace, repeats idempotent invalidation delivery after process restart, and deletes a record only after the bus accepts that Session id. A target login authorized after the attempt scan is a later user action and may complete. A new login started after revocation may also establish a Session, so removal is a remote sign-out rather than a permanent Installation ban. Pending attempts without a provider identity are not attributed to an Account and remain outside the operation.

Desktop Settings keeps the existing Mobile pairing route. Beneath the signed-in Account card it presents **Signed-in mobile installations**, with loading, empty, error and ready states. Opening the section refreshes the list. Each row shows device name, platform, stable reference and **Remove**. A second confirmation states that removal signs the Mobile out and ends its Platform Account access, preserves Personal Pairings, projects and local files, and permits a later sign-in. The existing controls appear under a separate **Personal Pairings** heading; their revoke action retains its current authority and copy.

## Alternatives considered

**Treat Personal Pairing revocation as Account Session removal.** Rejected because a pairing and an Account Session are independent grants and may exist without each other.

**Delete one Session read before the transaction.** Rejected because replacement login and refresh can race the stale read, and historical data may contain more than one active row despite the current unique index.

**Persist an Installation blacklist.** Rejected because remote sign-out must allow the user to sign in again intentionally. Cancelling attempts already authorized before the transaction closes the existing race without creating durable denial state.

**Expose timestamps or online state.** Rejected because the Account Session store does not own reliable installation creation, last-activity or connection-presence facts.

## Verification

- Memory and PostgreSQL tests pin quota release, caller and target authority, authorized-login and refresh races, legacy presentation, durable invalidation delivery, Account-deletion retention and later sign-in.
- HTTP, client, Desktop bridge and renderer tests pin the request, parsing, reopen refresh, unavailable-presentation label and confirmation behavior.
- The keyless Platform Account example performs Mobile sign-in, Desktop listing, cross-instance removal and later sign-in through the assembled provider.
- Actual Desktop GUI and release acceptance remain product-delivery evidence outside keyless fixtures.

## Consequences

The attempt scan defines the operation's temporal boundary: authorization committed after the scan is a later login and may succeed. Copy cannot imply that removal blocks the physical device. Durable Session state remains the authorization source, while the retained outbox and independent retry budget make connection closure recoverable after publication failure or restart. Every composition pays for one idle recovery timer and an outbox query per configured interval. Production cleanup selects the three confirmed test rows by their full opaque ids corresponding to approved short references; similar device names and generic Android labels are insufficient authority.
