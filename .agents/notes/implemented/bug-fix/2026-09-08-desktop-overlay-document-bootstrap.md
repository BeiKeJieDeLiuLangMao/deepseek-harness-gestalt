# Agent Note: Initialize the Desktop overlay document before client activation

Status: implemented

English | [中文](2026-09-08-desktop-overlay-document-bootstrap.zh.md)

## Problem

The Desktop Host opens native chrome at `?dsh-desktop-overlay=1`, but the Web entry did not call its document-marking helper. The Desktop plugin therefore skipped its menu registration, even though workbench consumers could recognize the query. Clicking the Session Surface tab menu opened an overlay document without its menu renderer.

## Decision

`AppWebEntry.run()` calls `markDesktopOverlayDocument()` before awaiting bootstrap readiness, loading bundles, activating plugins, or mounting the UI. The document attribute is available when `ui-desktop.apply` registers `DesktopChromeOverlay` into `shell.overlay`. The document retains this role until navigation destroys it; ordinary pages remain unmarked.

The Web entry owns the initialization because client plugins cannot depend on another plugin discovering the document role first. The native-view design in [Official Browser](../feature/2026-08-21-workbench-official-browser.md) remains separate. This fix does not implement the [fullscreen Settings decision](../architecture/2026-08-27-settings-fullscreen-shell.md): the current Settings root has no Desktop request subscription, so a Settings bridge request has no corresponding UI transition.

## Alternatives considered

**Recognize the query only in the Electron test.** This identifies a view without installing its missing menu renderer; it cannot restore Side Chat selection.

**Set the attribute from a test fixture or a later plugin.** Fixture injection bypasses the shipped entry, and late registration depends on activation order. The existing Web initialization helper belongs before both.

## Consequences

The entry regression loads the real Desktop plugin through the module system and Cordis Loader, checking its menu seat before mounting and preserving ordinary-page behavior. The assembled Desktop Web scenario authenticates through the Host, loads the shipped Desktop patch with its installation dependency closure, opens an overlay query, and records the actual menu plus its Side Chat result through a preload IPC fixture. Its session fixture owns the Desktop persisted projection and header sidecars; the response reuses keyless recorded model chunks. Removing the initialization call makes the assembled menu assertion fail.

The preload fixture does not prove Electron view stacking. Native Electron acceptance and the missing Settings request subscription remain distinct obligations; no Settings golden is claimed by this fix.
