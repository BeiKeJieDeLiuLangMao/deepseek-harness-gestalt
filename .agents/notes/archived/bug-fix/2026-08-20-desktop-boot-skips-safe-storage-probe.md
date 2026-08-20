# Agent Note: Desktop boot skips the Keychain encryption probe

Status: implemented
Archived: 2026-08-20

English | [中文](2026-08-20-desktop-boot-skips-safe-storage-probe.zh.md)

## Problem

Packaged Desktop Release smoke on signed macOS hangs after `window created` when Platform environment is present. `safeStorage.isEncryptionAvailable()` is a synchronous native Keychain probe. On a GitHub Actions runner it can stall the Electron main process, so the Host never starts, smoke never writes `ok`, and the GitHub Release job is skipped.

## Decision

Desktop Host does not probe encryption availability during boot. It always composes `EncryptedDesktopAccountStore` over `safeStorage.encryptString` / `decryptString`. First-run `start()` still allocates an in-memory installation id and does not touch Keychain. Encrypt and decrypt remain the capability failure at first persist or restore.

## Alternatives considered

**Timeout the probe on the main thread.** A synchronous native stall cannot be raced from the same thread.

**Keep the probe after Web Host start.** Smoke still needs Account and Pairing before `ok`; the stall would move, not disappear.

**Add Keychain entitlements only.** That may help production persist, but CI still has no Keychain UI; a boot-time probe would remain a release blocker.

## Consequences

A signed Mac boot with Platform environment reaches Web Host start without talking to Keychain. Unavailable encryption surfaces when a record is saved or loaded, not as a frozen window. Packed smoke can drain the fail-closed Relay after `ok`.

## Testing

`apps/desktop/tests/platform-account.spec.ts` keeps first-run `start()` from persisting. Desktop Release packed smoke covers the Platform-environment Relay drain path.
