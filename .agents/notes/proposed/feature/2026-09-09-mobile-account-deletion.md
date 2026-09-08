# Agent Note: recoverable Mobile account deletion

Status: proposed

English | [中文](2026-09-09-mobile-account-deletion.zh.md)

## Problem

Mobile creates a durable Platform Account through GitHub login but exposes only current-installation sign-out and selected Personal Pairing revocation. Neither operation deletes the Account or its associated personal records. [Issue #636](https://github.com/gestaltrun/deepseek-harness-gestalt/issues/636) owns delivery.

## Proposal

Add account deletion to the existing Account capability and Mobile account page. A confirmed, Installation-proof-bound request durably marks the Account as deleting and revokes all Account Sessions. Deleting Accounts cannot refresh, finish pending login, create pairings or regain access. Ordinary sign-out retains its existing semantics in the [Account decision](../../implemented/feature/2026-08-17-platform-account-installation-sessions.md), which remains active; this proposal adds a distinct operation.

The Account provider owns a small durable deletion record and restart recovery. Existing pairing, route, attachment and membership owners remove the Account's authority and personal references. Preserve shared projects and other members' records, and never delete Desktop-local work files or the GitHub account. Durable revocation precedes connection invalidation; a failed notification cannot restore authorization. Persist unfinished cleanup and report completion only when every required owner has finished. No universal job service is introduced.

The request is idempotent. Before sending it, Mobile stores the operation identifier and Installation-bound recovery material; an uncertain response or restart queries the same operation rather than opening another. Recovery authorization permits only deletion progress and replacement successor selections for that operation, never ordinary account operations. Keep it until the terminal result is observed, then remove it with that Account's local session, pairing keys and cache. Preserve other Accounts' material. Server recovery records have a bounded operational lifetime declared in configuration, without inventing legal retention requirements. Re-registration after completed deletion creates a new Account id without old authority.

Shared projects retain other members' data. When the deleting Account is the sole owner and other joined members exist, confirmation requires an explicit successor membership for each project. Persist `{projectId, successorMembershipId}` in the deletion operation; pending invitations are not candidates. The membership owner validates that the successor is another joined member of that project, promotes the successor before removing the deleting membership, and resumes safely if interrupted with both owners present. If another owner already exists, remove the deleting membership directly. If no other membership exists, remove the cloud project, memberships, invitations, name and remote indexes without touching local files. A successor who leaves concurrently makes the same operation require user action: the receipt permits replacement selections, while accepted session and pairing revocation stays effective. No project may become ownerless through deletion.

## Frozen UI and experience route

The existing account page supplies layout, typography and controls. The [state draft](2026-09-09-mobile-account-deletion.svg) freezes the following interaction; it is a planning illustration, not product acceptance evidence.

| State | Content | Action and outcome |
| --- | --- | --- |
| Entry | Delete account below sign-out | Open confirmation; no request |
| Confirmation | All installations and pairings lose access; local files and GitHub remain; select each required successor from joined members | Cancel returns unchanged; valid selections enable Delete account |
| In progress | Deleting account; unfinished work resumes after reopening | Disable ordinary account operations; retain recovery material |
| Complete | Account deleted | Erase this Account's local material and return to sign-in |
| Recovery failure | Unable to confirm status, or a selected successor left | Retry the same operation or choose another joined member through its receipt; never restore access |

Walk the real Mobile account page with two signed-in installations, two pairings and a shared project. Cancel first and verify access remains. Confirm, verify both installations lose access, interrupt connectivity and restart Mobile/Platform, retry progress, and observe completion. Select a successor for a solely owned shared project; verify ownership transfers and the other member's data and local files remain. Repeat with a successor leaving during deletion, select a replacement through the same receipt, and verify revocation stays effective. Re-register and prove old tokens and pairings stay unusable. Record the final GUI route and GIF only on the implementation candidate.

## Alternatives considered

**Rename sign-out or unpair to deletion.** These operations leave the Account and independent grants intact.

**One transaction across all storage.** PostgreSQL, object storage and membership persistence do not share one atomic commit. Durable owner cleanup makes partial failures recoverable.

**Require customer support to delete.** The user must initiate a real deletion workflow in the app; a contact link alone provides no durable result.

## Acceptance criteria

Focused tests cover cancel, duplicate requests, response loss, restart recovery, cross-account rejection, concurrent login/refresh, cross-instance revocation and cleanup failures, including successor departure and interruption after promotion. An assembled keyless product snapshot covers the UI states. Required owner records and attachment capabilities disappear before completion; shared-project data belonging to others remains. Mobile resumes an accepted deletion without its revoked Account Session. New registration never inherits deleted authority.

## Risks

Identity deletion must close active Relay access as well as login sessions. Shared memberships and retained encrypted attachments require their own owners' cleanup. Production retention facts must be confirmed before publishing policy claims. Platform and Mobile require subsequent releases; this work leaves the current Desktop 0.1.17 and Android build 8 release lines untouched. Apple login, provider linking and review-only access bypasses are outside this proposal.
