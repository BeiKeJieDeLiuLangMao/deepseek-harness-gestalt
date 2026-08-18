# Personal Pairing

English | [中文](personal-pairing.zh.md)

[`@deepseek-ai/dsh-remote-access`](../../packages/platform/remote-access/README.md) owns Mobile Access enablement, Pairing Challenge consumption, pending handshake confirmation, Personal Pairing identity, and Companion-only Device Principal authority. It calls `ctx.platformAccount.currentInstallation()` to authenticate each Account Session's installation id and kind, then compares opaque Platform Account ids; it never reads Account storage or GitHub fields and never trusts a caller-supplied installation identity.

## Challenge and confirmation lifecycle

Mobile Access is false for each Desktop Installation until the Desktop Settings owner enables it. An enabled Desktop creates one challenge containing a 32-byte invitation capability, Desktop fingerprint, rendezvous id, two-minute expiry, and protocol major. QR and full-link presentation encode the same HTTPS value. There is no short-code parser or fallback.

The Mobile completion consumes the invitation only after its complete link matches the retained capability. A cross-account attempt destroys that invitation before the crypto adapter runs. A valid same-account handshake produces a pending key and handshake hash; the six derived authentication words appear on both installations, but active pairing lists remain empty until Desktop confirmation. Confirmation activates one unique provider-owned key reference and grants a branded Device Principal whose authority is exactly `companion-surface`.

Mutations are serialized. Expiry, cancellation, rejection, disablement, and one successful completion commit terminal state before another mutation can observe the capability. Crypto-resource destruction is independently retryable: a failed cleanup never repeats handshake completion or pairing activation, and provider disposal attempts every challenge, pending key, active key, and cleanup record. Challenge expiry is scheduled at creation rather than waiting for another completion request. Opaque generated ids and activated key references are checked before insertion, so a collision cannot replace an existing record or abandon a newly allocated key.

## Cryptographic adapter

`PairingHandshakeProvider` prepares, completes, activates, and destroys provider-private handshake state. Remote Access never implements Noise transitions or cryptographic primitives. `remote-access-http` consumes `ctx.remoteAccess`, while `remote-access-client` validates the wire values used by the real Desktop Settings and Mobile controllers. The assembled Loader scenario runs the provider, HTTP Consumer, and shared transport through a real loopback server with an explicitly unreviewed keyless provider. Desktop and Mobile development entrypoints select their real controllers only through explicit flags. Production composition stays unavailable until the independent Noise review admits a reviewed provider; the development proof is never selected by the production path.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxremoteaccess--remoteaccessservice-abstract-seam"></a>

### `ctx.remoteAccess` — `RemoteAccessService` (abstract seam)

Remote Access capability owning the complete Personal Pairing lifecycle.

```ts cordis-catalog
/**
 * Create one two-minute invitation for a signed-in Desktop Installation.
 * @param input - Desktop authorization and opaque rendezvous identity.
 * @returns complete QR/link projection; no low-entropy fallback exists.
 */
abstract createChallenge(input: { desktop: PairingAccountAuthentication rendezvousId: PairingRendezvousId }): Promise<PairingChallengeView>

/**
 * Read the current Desktop Installation's Mobile Access state.
 * @param desktop - current Desktop authorization.
 * @returns whether Settings has enabled Mobile Access for this Installation.
 */
abstract getMobileAccessState(desktop: PairingAccountAuthentication): Promise<MobileAccessState>

/**
 * Set Mobile Access from the Desktop Settings owner.
 * @param input - current Desktop authorization and requested state.
 * @returns committed Mobile Access state.
 */
abstract setMobileAccess(input: { desktop: PairingAccountAuthentication enabled: boolean }): Promise<MobileAccessState>

/**
 * Complete the same-account cryptographic exchange without granting authority.
 * @param input - Mobile authorization, invitation, device metadata, and handshake bytes.
 * @returns pending result shown on both installations before Desktop confirmation.
 */
abstract completeChallenge(input: { mobile: PairingAccountAuthentication completionId: PairingCompletionId oneTimeLink: string device: PairingDeviceDescription mobileHandshake: Uint8Array }): Promise<PairingCompletionView>

/**
 * Read the decision for one pairing completed by the current Mobile Installation.
 * @param input - current Mobile authorization and pending identity.
 * @returns pending, paired, or rejected without exposing Desktop authority.
 */
abstract getMobilePairingStatus(input: { mobile: PairingAccountAuthentication pendingPairingId: PendingPairingId }): Promise<MobilePairingStatus>

/**
 * List active pairings visible to one signed-in Desktop Account.
 * @param desktop - current Desktop Account authorization.
 * @returns only confirmed pairings; pending handshakes are excluded.
 */
abstract listPersonalPairings(desktop: PairingAccountAuthentication): Promise<readonly PersonalPairingView[]>

/**
 * List completed handshakes awaiting this Desktop Installation's decision.
 * @param desktop - current Desktop authorization.
 * @returns pending handshakes owned by this Desktop Installation.
 */
abstract listPendingPairings(desktop: PairingAccountAuthentication): Promise<readonly PairingCompletionView[]>

/**
 * Activate one pending pairing after the Desktop user compares authentication words.
 * @param input - confirming Desktop and pending identity.
 * @returns independently keyed Companion-only Device Principal.
 */
abstract confirmPairing(input: { desktop: PairingAccountAuthentication pendingPairingId: PendingPairingId }): Promise<PersonalPairingView>

/**
 * Cancel one active invitation; repeated cancellation is a no-op.
 * @param input - owning Desktop authorization and challenge identity.
 */
abstract cancelChallenge(input: { desktop: PairingAccountAuthentication challengeId: PairingChallengeId }): Promise<void>

/**
 * Reject one pending handshake; repeated rejection is a no-op.
 * @param input - owning Desktop authorization and pending identity.
 */
abstract rejectPairing(input: { desktop: PairingAccountAuthentication pendingPairingId: PendingPairingId }): Promise<void>
```

Source: [`packages/platform/remote-access/src/index.ts:232`](../../packages/platform/remote-access/src/index.ts)
<!-- END GENERATED cordis-surface -->
