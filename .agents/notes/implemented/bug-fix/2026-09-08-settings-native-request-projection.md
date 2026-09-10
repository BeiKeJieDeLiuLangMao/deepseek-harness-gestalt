# Agent Note: Project native Settings requests through the Settings owner

Status: implemented

English | [中文](2026-09-08-settings-native-request-projection.zh.md)

## Problem

The Settings trigger opened a component-local modal in the ordinary Desktop document, while the native overlay document had no consumer for Settings requests. The real Electron provider-configuration path switched to that overlay and could not find Models. Document bootstrap alone could render native menus but could not restore Settings.

## Decision

The Settings owner implements the three presentation modes specified by the [fullscreen Settings decision](../architecture/2026-08-27-settings-fullscreen-shell.md). Browser Web opens the page locally; ordinary Desktop sends a Host request; the overlay renders that request using the same SettingsPage, section slots, and full-viewport CSS. Close and Escape return the current request id. No second Settings renderer or Host protocol is introduced.

A private adapter captures the preload boundary in `apply`, projects its current request through the injected observable, and supplies plain native-action callbacks. Components read no ambient bridge and own no IPC subscriptions. The adapter subscribes before its initial read and rejects that read's stale result after a newer event. Matching replies close only their request, duplicate close actions emit once, and disposal releases subscriptions and drains accepted calls without late publication. A rejected show clears only its still-current request and reports the error.

The adapter consumes the existing preload fields structurally. Adding a reverse dependency on ui-desktop would close a project-reference cycle because ui-desktop already depends on the Settings owner. The complete wire definition remains in ui-desktop, and the assembled fixture forwards those same request/result operations between ordinary and overlay pages.

## Alternatives considered

**Open an ordinary modal in the Electron acceptance test.** Native official-page views sit above that document; this bypasses the accepted Settings path and cannot prove its presentation.

**Restore bridge reads and subscriptions inside SettingsRoot.** External state belongs in the injected observable channel. Component-local subscriptions would duplicate the framework's lifecycle and allow a late initial read to replace a newer Host request.

**Create a new public Settings chrome service or slot.** The existing Settings owner, preload boundary, and sidebar.settings occupant already provide the complete path; another registry would add independent lifecycle state.

## Consequences

The document [bootstrap](2026-09-08-desktop-overlay-document-bootstrap.md) remains the prerequisite for native mode selection. Settings keeps its current connection recovery, onboarding registrants, section navigation, and focus restoration. Only browser-local Settings holds the overlay-lock handshake; the Host owns native view stacking.

Tests cover request affinity, initial-read races, unload during pending calls, operation failures, mode-specific rendering, and section opening. The real Desktop-patch Web scenario drives the ordinary Settings trigger, forwards preload operations into a separately bootstrapped overlay document, clicks Models, verifies viewport fill, and returns header/Escape close results. The Web scenario verifies the same full-page geometry. Native Electron acceptance remains required for view stacking and the complete create/restore/archive path.
