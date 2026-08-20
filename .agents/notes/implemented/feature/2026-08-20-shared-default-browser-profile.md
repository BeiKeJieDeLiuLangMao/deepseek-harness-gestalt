# Agent Note: Shared default Browser Profile

Status: implemented

English | [中文](2026-08-20-shared-default-browser-profile.zh.md)

## Problem

`browser_create` defaulted to a disposable temporary Profile. Each omitted-profile call minted a new isolated identity and discarded it on close. Sessions could not reuse one login, and the model had to name `persistent` plus a Profile name before any identity survived. Journey 6 on the Session-owned AI Browser specification asked for a separately labeled attached-user identity that must not claim cookie or storage isolation; the delivered runtime only had isolated temporary and named persistent Profiles.

## Decision

Omitting `profile` on `browser_create`, or passing `profile: "shared"`, opens the installation-wide shared Browser Profile. Its partition is `persist:session-${idPrefix}-shared`. The `BrowserProfileId` is stable. Each unattached create starts a new Session-owned Workspace on that same partition and does not take `BROWSER_PROFILE_BUSY`. Address-field chrome uses `kind: "shared"` and the reserved name `shared`. Dock copy says shared identity and does not present the Profile as isolated.

Passing `profile: "persistent"` with a name still opens that isolated named Profile. A second independent writer of a named persistent Profile still rejects with `BROWSER_PROFILE_BUSY`. Passing `profile: "temporary"` still mints a disposable unlabeled identity. The reserved name `shared` cannot be a persistent Profile name.

This is the Desktop installation's shared Chromium identity. It does not import cookies from the system Chrome or Safari profile. The [Persistent Browser Profiles Agent Note](2026-08-19-persistent-browser-profiles.md) still owns named isolation, single-writer named Profiles, and temporary disposal.

## Alternatives considered

**Import the system Chrome or Safari cookie jar.** Rejected because that is a different product: platform-specific, privacy-sensitive, and not a Browser Profile name. The shared Profile is this Desktop's persist partition.

**Keep omitted `profile` as temporary.** Rejected because the default the model actually uses would stay disposable and isolated, so Sessions would never share a login unless the model named a persistent Profile.

**Reuse a named persistent Profile called `default` and keep `kind: "persistent"`.** Rejected because persistent chrome claims an isolated named identity. Shared chrome must be a distinct kind so Dock and model-visible results cannot call it isolated.

**Keep `BROWSER_PROFILE_BUSY` on the shared Profile.** Rejected because every Session must be able to open a Workspace on the same identity. Named persistent Profiles remain single-writer.

## Consequences

An Agent that does not name a Profile shares one login across Sessions. An Agent that names a persistent Profile keeps that Profile isolated. Explicit temporary Profiles stay disposable. Shared chrome must be labeled as shared identity.

## Testing

`packages/browser/browser-runtime/tests/types.spec.ts` pins shared resolve, reserved name, and Workspace sequencing. Deterministic, Electron, and Tandem Provider tests open two shared Profiles without `BROWSER_PROFILE_BUSY` and assert one partition. `packages/browser/browser-workspace/tests/workspace.spec.ts` opens shared Profiles from two Sessions. `packages/browser/tool-browser/tests/tools.spec.ts` pins omitted `profile` to shared chrome. `packages/client/ui-browser/tests/model.client.spec.ts` pins the shared-identity address label. Headless Browser Runtime snapshots keep the temporary tracer by passing `profile: "temporary"` and pin the updated `browser_create` schema.
