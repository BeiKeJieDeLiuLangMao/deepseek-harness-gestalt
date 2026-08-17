# Agent Note: Settings-owned same-account Personal Pairing

Status: implemented

English | [中文](2026-08-18-settings-personal-pairing.zh.md)

## Problem

A Platform Account identifies an Installation but grants no Desktop authority. Personal Pairing needs a short-lived capability, an authenticated same-account exchange, an explicit human comparison, and a narrowly authorized Device Principal without exposing Remote Access state throughout the existing Session Surface. The selected Noise implementation also remains behind an independent review requirement, so lifecycle delivery cannot silently turn a proof-local dependency into product cryptography.

## Decision

`@deepseek-ai/dsh-remote-access` is the Remote Access module for Mobile Access and Personal Pairing lifecycle. Its public service asks Platform Account to authenticate the session-owned Installation id and kind, owns challenge/pending/confirmed state transitions, serializes mutations, and grants only `companion-surface` Device Principals after Desktop confirmation. Branded ids distinguish challenges, rendezvous, completions, pending pairings, Personal Pairings, Device Principals, and active key references. Callers never assert their own Installation role.

Desktop and Mobile crypto behavior enters through `PairingHandshakeProvider`. The lifecycle passes it a fresh 32-byte invitation secret, derives display words only from the returned handshake hash, and requires a unique key reference at activation. Terminal results and resource cleanup are separate: retries return the committed result without repeating handshake or activation, while failed destruction remains cleanup-owned and provider disposal aggregates every retained resource. Challenge expiry is scheduled at creation, and generated-id collisions cannot replace existing records.

`remote-access-http` consumes `ctx.remoteAccess`; `remote-access-client` validates its JSON and branded ids for the Host-owned Desktop controller and Mobile controller. The assembled Loader scenario runs the provider, HTTP Consumer, and shared transport through a real loopback server with an explicitly unreviewed keyless handshake provider. Desktop and Mobile development entrypoints may select their real controllers through explicit environment flags. Production remains fail-closed until the independent Snow review admits a product provider, and no production path imports the keyless implementation.

The existing Desktop `手机配对` Settings section owns the Mobile Access toggle, QR/full-link challenge, authentication words, confirmation, rejection, and paired-device list. QR generation uses the maintained `qrcode` encoder. Mobile accepts the same complete link or native QR payload and waits for Desktop confirmation. No new Session header, sidebar, approval, composer, or offline presentation is registered.

## Alternatives considered

**Integrate the proof-local Snow WebAssembly directly.** This would cross the independent review requirement and turn reproducibility evidence into an unreviewed product dependency. The replaceable adapter keeps product composition fail-closed.

**Treat Platform Account identity as Desktop authorization.** This would collapse identity and capability boundaries. Remote Access compares Account ids only during pairing and creates a separately keyed, independently revocable Device Principal.

**Offer a short manual code.** A low-entropy fallback would create a second weaker protocol. Camera and non-camera flows carry the same full invitation link.

**Add pairing status to ordinary Desktop chrome.** Persistent Session UI would widen the feature beyond Settings and alter unrelated offline and approval states. The existing Settings slot is the only Desktop presentation owner.

## Consequences

The public lifecycle and real Settings/Mobile controllers can be reviewed and tested without claiming product encryption. Cross-account, Installation-role, expiry, cancellation, rejection, concurrency, cleanup retry, pre-confirmation, collision, and narrow-authority behavior are fixed at one interface and one authenticated HTTP Consumer. Production pairing remains blocked on the independent security review; the single-process provider and keyless scenario are not deployment persistence or the cross-instance Relay planned for issue #32.
