# Agent Note: Desktop Mobile installation management

Status: proposed

English | [中文](2026-09-09-desktop-mobile-installation-management.zh.md)

## Problem

A Platform Account may reach its Mobile installation quota after acceptance runs or a lost device leaves an active Account Session. Current-installation sign-out cannot revoke another installation, while Personal Pairing revocation removes separate Desktop access authority and does not free an Account installation slot. [Issue #644](https://github.com/gestaltrun/deepseek-harness-gestalt/issues/644) owns the distinction and the Desktop recovery path.

The operation must remain consistent with account deletion, refresh rotation and an already-authorized login that has not finished polling. Revoking only the Session observed before the transaction could let one of those concurrent operations restore target access after Desktop reports success.

## Proposal

The existing Platform Account module gains two Desktop-only operations. `listMobileInstallations` authenticates the calling Desktop Account Session and returns the active Mobile installations owned by the same Account. `revokeMobileInstallation` authenticates the calling Desktop, binds its one-use installation proof to the target Installation id, and delegates one atomic compare-and-mutate operation to the Account backend. The backend returns every revoked Account Session id; the service publishes each invalidation after the transaction commits.

The view carries the opaque Installation id for a later authenticated mutation, but presentation code never renders or treats that value as a user reference. It renders the authenticated device name and platform plus the first twelve hexadecimal characters of the SHA-256 Installation-id digest. The short reference is stable display data only. The list does not infer creation time, last activity, online state or IP address from Session rows.

Only an active Desktop Installation may call either operation. The backend transaction locks already-authorized login attempts for the target Installation in id order, then the Account row, the calling Session and target Session rows. It rejects a changed caller, a deleting Account, a target outside the caller's Account, and a target without an active Mobile Session. This follows the login order of Attempt, Account and Session while preserving account deletion's Account-before-Session order. Refresh either commits before target Session revocation or observes the inactive Session afterward.

The transaction marks every matching active target Session inactive, removes its refresh authority, and marks already-authorized target login attempts for the same provider identity used. A target login authorized after the attempt scan is a later user action and may complete. A new login started after revocation may also establish a Session, so removal is a remote sign-out rather than a permanent Installation ban. Pending attempts without a provider identity are not attributed to an Account and remain outside the operation.

Desktop Settings keeps the existing Mobile pairing route. Beneath the signed-in Account card it adds **Signed-in mobile installations**, with loading, empty, error and ready states. Each row shows device name, platform, stable reference and **Remove**. A second confirmation states that removal signs the Mobile out and ends its Platform Account access, preserves Personal Pairings, projects and local files, and permits a later sign-in. The existing controls appear under a separate **Personal Pairings** heading; their revoke action retains its current authority and copy.

## Alternatives considered

**Treat Personal Pairing revocation as Account Session removal.** Rejected because a pairing and an Account Session are independent grants and may exist without each other.

**Delete one Session read before the transaction.** Rejected because replacement login and refresh can race the stale read, and historical data may contain more than one active row despite the current unique index.

**Persist an Installation blacklist.** Rejected because remote sign-out must allow the user to sign in again intentionally. Cancelling attempts already authorized before the transaction closes the existing race without creating durable denial state.

**Expose timestamps or online state.** Rejected because the Account Session store does not own reliable installation creation, last-activity or connection-presence facts.

## Acceptance criteria

- An authenticated Desktop lists only active Mobile installations of its Account and cannot list through Mobile credentials, a stale Session or a replayed proof.
- The renderer displays authenticated name, platform and stable short reference without displaying the opaque Installation id.
- Removal rejects a Desktop caller changed before the Account lock, an Account in deletion, a foreign Account target, a Desktop target and an absent active target.
- Removal revokes all active target Sessions and refresh credentials and publishes every committed Session invalidation across Platform instances.
- A refresh or already-authorized login concurrent with removal cannot restore access after success; a newly authorized or newly started login after the removal scan can establish access.
- The confirmation and section headings distinguish Account access from Personal Pairing and state the retained data and later sign-in behavior.
- Memory and PostgreSQL tests pin lock-sensitive outcomes. HTTP, client, Desktop bridge and renderer tests pin the same request and presentation behavior.
- A real runnable example updates the keyless snapshot, and the PR records a GIF from its actual Desktop route and model flow.
- The existing account-deletion, Windows deadline and Docker daemon-lifecycle regressions retain their behavior.

## Risks

The attempt scan deliberately defines the operation's temporal boundary: authorization committed after the scan is a later login and may succeed. Copy must not imply that removal blocks the physical device. Invalidation accelerates connection closure but durable Session state remains the authorization source. Production cleanup must select the three confirmed test rows by their full opaque ids corresponding to approved short references; similar device names and generic Android labels are insufficient authority.
