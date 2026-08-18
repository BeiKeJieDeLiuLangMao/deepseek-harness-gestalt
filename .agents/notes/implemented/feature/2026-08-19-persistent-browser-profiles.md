# Agent Note: Persistent Browser Profiles

Status: implemented

English | [中文](2026-08-19-persistent-browser-profiles.zh.md)

## Problem

A user can sign in inside a real browser, but the Browser Runtime tracer only admitted one disposable temporary Profile. Restoring that identity later required a second account-pool concept the product does not own, while concurrent writers of the same Electron partition could corrupt cookies and storage.

## Decision

`ctx.browserRuntime.create` accepts a temporary Profile or a named persistent Browser Profile. Persistent Profiles reuse a stable Tandem `persist:session-${idPrefix}-${name}` partition so cookies, localStorage, IndexedDB, cache, and service-worker state return with the same `BrowserProfileId`. Temporary Profiles receive a unique `tmp-N` session name, empty storage, and no address-field label.

The product vocabulary is Browser Profiles only. Open page state carries `chrome` for Dock to place one label near the address field and `storage` as the model-visible identity proof. Temporary chrome omits `name`. Dock headers, footers, and an account picker are absent.

Providers serialize operations and reject a second open writer of the same named Profile with `BROWSER_PROFILE_BUSY`. Mutations still require `expectedRevision` and reject `BROWSER_REVISION_CONFLICT`. Close discards a temporary identity and retains a named partition. Invalid names reject with `BROWSER_PROFILE_NAME`.

The deterministic Provider is the keyless store for persistence, isolation, cleanup, and single-writer tests. The Tandem Provider maps those facts onto one managed child and the pinned HTTP session protocol. The Consumer may create either kind of Profile; `browser_create` still defaults to temporary when the model omits `profile`.

## Alternatives considered

**Add an account pool or account-selection service beside Browser Profiles.** Rejected because the ticket forbids a second identity concept. A named Profile is the identity.

**Treat Tandem session names as caller-visible account ids.** Rejected because opaque `BrowserProfileId` values already travel with every operation. Callers choose a Profile name; Providers own the partition key.

**Allow last-writer-wins mutation of one named Profile.** Rejected because Electron persist partitions are single-writer storage. A clear `BROWSER_PROFILE_BUSY` failure is safer than silent corruption.

**Project the Profile label from Dock chrome.** Rejected because Dock is a later Desktop surface. Runtime state carries the facts Dock will consume, including a keyless snapshot of unlabeled temporary Profiles.

## Consequences

Named Profiles restore isolated identities without an account picker. Temporary Profiles remain disposable and unlabeled. Concurrent writers fail loudly. Persistence, isolation, cleanup, and revision conflict are tested at the public runtime seam; the Tandem fixture and env-gated real Electron e2e exercise the same facts against a provider that owns `persist:session-*` partitions.

## Verification

- `pnpm exec vitest run packages/browser/browser-runtime packages/browser/browser-runtime-deterministic packages/browser/browser-runtime-tandem packages/browser/tool-browser`
- `pnpm exec vitest run packages/browser/browser-runtime packages/browser/browser-runtime-deterministic packages/browser/browser-runtime-tandem packages/browser/tool-browser --coverage --coverage.include='packages/browser/browser-runtime/src/**/*.ts' --coverage.include='packages/browser/browser-runtime-deterministic/src/**/*.ts' --coverage.include='packages/browser/browser-runtime-tandem/src/**/*.ts' --coverage.include='packages/browser/tool-browser/src/**/*.ts'`
- `pnpm run test:snapshot -t 'Browser Profile'`
- Real Tandem e2e remains gated by `DSH_TANDEM_CHECKOUT` and `DSH_TANDEM_BIN`.
