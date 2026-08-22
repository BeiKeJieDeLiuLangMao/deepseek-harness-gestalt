# `@deepseek-ai/dsh-noise-channel`

English | [中文](README.zh.md)

Snow 0.10.0 WebAssembly adapter for Personal Pairing and encrypted Companion messages. The same committed module runs in Node and browser WebViews; it selects only `Noise_XKpsk3_25519_ChaChaPoly_SHA256` for first pairing and `Noise_IK_25519_ChaChaPoly_SHA256` for reconnect.

## Pairing

`SnowPairingHandshakeProvider` and `SnowMobileHandshakeClient` complete all three XKpsk3 messages. The finished handshake hash supplies only authentication words. Relay authority is the first responder transport payload from that completed handshake, not JSON protected by a separately assembled application cipher. Opening or sealing that payload destroys the invitation PSK, pairing ephemerals, and transcript state; each endpoint retains only its independently generated static key and the authenticated peer public key.

The provider rebuilds one short-lived XKpsk3 state after a non-sticky HTTP transition by supplying a Snow-generated, single-use ephemeral through Snow's `fixed_ephemeral_key_for_testing_only` API. The independent review must approve that exact use before a product composition selects this provider.

## Reconnect and messages

`beginSnowMobileReconnect` and `acceptSnowDesktopReconnect` create one IK channel per physical Relay attachment. Snow generates a fresh ephemeral for every attempt. The IK prologue binds the Relay route, credential-bound pairing selector, independent Desktop and Mobile attachment ids, and a positive connection generation, so another route, pairing, attachment tuple, or generation cannot reuse the transcript. `SnowMobileAttachmentOwner` and `SnowDesktopAttachmentOwner` carry those IK messages as opaque Relay ciphertext payloads; the Desktop selects only local static state named by the non-secret selector, and Snow authenticates that static identity.

`SnowCompanionProtocolChannel` encrypts only values admitted by `@deepseek-ai/dsh-remote-protocol`. Its ordered Snow transport rejects replay and out-of-order ciphertext. Foreground synchronization is a versioned `foreground-sync` Companion projection carrying the attachment generation and Desktop revision; a raw one-byte frame cannot decode as synchronization authority.

## Model Experience

None, as pairing, Relay authority, and Companion transport metadata never enter a model request.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Relay peer discovery and the Mobile attachment owner are assembled. Desktop remains fail-closed until first pairing and durable static state are Desktop-owned; the Platform pairing provider is deliberately not mounted as an end-to-end endpoint.
- Node 22 and 24 plus the existing simulator and emulator proof cover the selected Snow dependency. Physical iOS and Android evidence and the independent security-review record for this exact adapter remain release blockers.
