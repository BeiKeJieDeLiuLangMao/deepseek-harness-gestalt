# Agent Note: Mount a local two-instance companion Platform for product clients

Status: implemented

English | [中文](2026-08-21-local-companion-platform.zh.md)

## Problem

Production Platform listen mounts Account HTTP and migrates Remote Access tables, but pairing HTTP and Relay WSS stay unmounted until independent Noise review. Assembled keyless fixtures already prove pairing and two-instance Relay in process, yet Mobile and Desktop product entries have no loopback composition that shares one trusted HTTPS origin, real Account sessions, and a non-sticky TLS front. Simulator browsers also cannot complete GitHub login when Capacitor Browser is absent unless a still-valid pending attempt can resume after navigating the current browsing context.

## Decision

[`examples/local-companion-platform`](../../../../examples/local-companion-platform/README.md) is the long-running development listen. It binds one `127.0.0.1` TLS endpoint, alternates `/v1/*` and Relay upgrades across two in-process instances, and shares memory Account, pairing-authority, and Relay route stores. The selected development identity is that TLS origin; production identities remain the operated `www.gestaltrun.com` pair so client pair validation still rejects a shared identity. GitHub authorization in this composition is `/v1/account/oauth/github/development-complete` on the same origin and always yields the `octocat` public identity. `LOCAL_COMPANION_PAGE_ORIGIN` reverse-proxies non-`/v1` paths to Mobile Vite so CORS and `loadPlatformEnvironment` see one HTTPS origin. [`apps/platform/src/boot.ts`](../../../../apps/platform/src/boot.ts) does not import this example or `DevelopmentKeylessPairingHandshakeProvider`.

`PlatformAccountInstallation.load()` resumes a still-valid pending login as polling when no session exists and clears an expired pending attempt, so a Capacitor-unavailable Mobile entry can `location.assign` the prepared authorization URL and continue after the user returns. The entry still has no `window.open`, popup, or custom-URL token fallback.

The Loader scenario uses sequential entropy and the real Desktop/Mobile Account clients plus Remote Access HTTP and WSS clients to prove same-account login, default-disabled Mobile Access, confirmed pairing, and one encrypted Relay round trip.

## Alternatives considered

**Mount pairing and Relay on production listen.** That would ship an unreviewed handshake on the operated origin. The production process stays fail-closed.

**Point Mobile at `http://127.0.0.1` and rewrite fetch.** Account and Remote Access HTTP allow only the selected HTTPS origin. A TLS front plus same-origin page proxy keeps CORS and pairing links honest.

**Keep pending login only in process memory.** Same-window authorization would lose the five-minute attempt. Resuming durable pending state is the product recovery path, not a test hook.

## Consequences

Developers can stand up one loopback origin that Mobile simulators and Desktop keyless flags consume without a second cloud Platform. The trade-off is an unreviewed handshake, memory stores, and a bundled test certificate: this listen is not production and cannot replace Noise review, SLS, or TestFlight/APK acceptance. Cross-links: [two-instance Relay](2026-08-18-stateless-two-instance-remote-relay.md), [keyless pairing acceptance](../testing/2026-08-19-personal-pairing-assembled-acceptance.md).

## Testing

[`examples/local-companion-platform/tests/local-companion-platform.spec.ts`](../../../../examples/local-companion-platform/tests/local-companion-platform.spec.ts) boots the real `cordis.yml` through the Loader and asserts the assembled transcript plus the production-boot isolation grep. [`packages/platform/platform-account-client/tests/installation.client.spec.ts`](../../../../packages/platform/platform-account-client/tests/installation.client.spec.ts) resumes or clears durable pending login. [`apps/mobile/tests/mobile-entry.spec.ts`](../../../../apps/mobile/tests/mobile-entry.spec.ts) navigates the current browsing context when Capacitor Browser is unavailable.
