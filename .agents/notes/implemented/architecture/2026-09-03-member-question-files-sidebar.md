# Agent Note: Member Question references open through the official Sidebar file viewers

Status: implemented

English | [中文](2026-09-03-member-question-files-sidebar.zh.md)

## Problem

A routed Member Question can carry referenced documents. T6 opened those chips into a Member-Question-specific details-panel document seat. That preview never used the receiving Session's Files viewer, so markdown, sandboxed HTML, and unsupported types had a second in-product dock. Transferred bytes also had no receiver-owned Workspace path, so a same-named local file could be overwritten or opened by mistake.

## Decision

The Host Session materializer writes transferred document bytes under a receiver-owned hidden Workspace directory: `.dsh/member-questions/<questionId>/<basename>`. Colliding basenames inside one question receive a numeric suffix. Cache parents are created as owner-only real directories after unlinking a planted symlink at `.dsh`, `.dsh/member-questions`, or the question directory. Cache files unlink a leftover or link-shaped path, then exclusive-create an owner-only regular file (`wx`, `0o600`) so the write cannot follow into a same-named Workspace file. The receiver ledger stores only `{ path, reason, cachedPath }` metadata; document bodies stay outside the JSON document.

Clicking a material chip opens only that cached path as a `fileAddressFor` resource through `ctx.sidebarRight.forSession(sessionId).openResource` with the receiving Session id. A chip without `cachedPath` is a no-op: the asking Session path and a same-named Workspace file are never opened. Markdown, HTML, and other extensions reuse the ordinary Files viewer registry. HTML starts in its opaque-origin sandbox; the Files settings own the warned opt-out. When the file address has no registered viewer, the chip calls `ctx.remote.session.openWorkspacePath({ path: absolute })` and the Host system opener. Navigation failures appear on the material card; failure from a registered viewer does not retry through the system opener. The details-panel document seat is not part of the product path.

The card reads the official Sidebar projection and folds only while one of its cached reference paths is the selected file tab in a visible pane or floating window of the mounted receiving Session. Pane focus does not change whether its selected file is visible; inactive Sessions do not contribute visible references. Hiding that viewer, activating an unrelated tab, or switching Sessions restores the card and clears the local reveal. Selecting another referenced file clears the reveal and folds around that file; reopening a hidden reference also folds it again. Subscriptions follow late provider and viewer registration and receiving Workspace root changes. Teardown releases state, registry, Session list, and Cordis service listeners.

The [receiving Session materialization note](2026-09-02-receiving-session-arrival-materialization.md) still owns Host Session creation and brief injection. The [Host receiver ledger](2026-08-31-host-owned-member-question-receiver-ledger.md) still owns persistence, first claim, and human-turn reservation.

## Alternatives considered

**Keep the T6 details-panel document seat as the product open path.** Rejected because markdown, sandboxed HTML, and unsupported types already have Files viewers, and a second dock disagrees with stories 33–35.

**Write transferred bytes over the asking Session's Workspace-relative path.** Rejected because a same-named local file would be overwritten or opened by mistake.

**Store document bodies in the receiver ledger.** Rejected because Companion document transfer owns those bytes, and the ledger already excludes referenced bodies.

**Always call `ctx.workspaces.openPath` and let the official Sidebar intercept.** Rejected because a missing Files viewer must fall back to the system opener without a second in-product dock, and the chip must name the receiving Session rather than the current Session.

**Infer viewer focus from global panel DOM state.** Rejected because an unrelated tab or another Session can open the same panel. The official Sidebar projection identifies the mounted Session and visible file resources without a second focus store.

## Consequences

A receiver reads the transferred copy through the ordinary Files viewer of the receiving Session while the decision remains recoverable beside it. Local Workspace files with the same basename stay untouched. A composition without Files uses the Host system opener and does not fold the card around an in-product viewer that is absent.

## Testing

Focused cache tests pin hidden-directory writes, same-name isolation, and planted-symlink refusal. Receiver ingest tests pin transferred bytes on the materializer without ledger bodies. Client plugin tests pin file-resource navigation with the receiving Session id, system-opener fallback, late-provider subscription cleanup, and a no-op when `cachedPath` is absent. The card test pins exact Session-and-path matching, restoration when the viewer disappears, and a new fold when a hidden or different referenced file becomes visible. Keyless Web assembled coverage opens the transferred Markdown and sandboxed HTML paths, observes each card fold, restores it beside each visible viewer, and proves the Workspace twin was not read; the owning snapshot pins the durable receiving events.
