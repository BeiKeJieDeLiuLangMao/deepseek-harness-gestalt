# Agent Note: Snow Companion channel library

Status: implemented

English | [中文](2026-08-22-snow-companion-channel-library.zh.md)

## Problem

The selected Snow proof exercises XKpsk3 and IK but exposes only a stable report. Personal Pairing needs a reusable endpoint library without treating the public handshake hash as a secret, wrapping Relay authority in an unrelated AES-GCM construction, or admitting an untyped byte as foreground synchronization. Product composition also cannot claim end-to-end encryption if Platform owns the Desktop or Mobile private keys.

## Decision

`@deepseek-ai/dsh-noise-channel` compiles pinned Snow 0.10.0 to one committed WebAssembly module. XKpsk3 completes three messages and uses its responder transport state to seal the Mobile Relay grant. The handshake hash supplies authentication words only. After the grant transition, each endpoint retains its local static key and the authenticated peer static public key; invitation PSK, ephemerals, and transcript state are zeroed.

Each physical Relay attachment establishes a new IK handshake with a Snow-generated ephemeral. Its prologue binds the Relay route, a non-secret Personal Pairing selector, independent Desktop and Mobile attachment ids, and connection generation. The resulting ordered transport encrypts only versioned Encrypted Companion Protocol values. Foreground synchronization is the `foreground-sync` projection with a positive connection generation and Desktop revision.

Each Mobile Relay credential record binds its pairing selector beside a P-256 public-key digest. Every physical socket requests a fresh challenge containing the route, attachment id, endpoint kind, public SPKI, challenge id, nonce, and expiry, then proves its endpoint-private key by signing that complete domain-separated tuple. The WSS owner accepts the proof only on the socket that received the challenge, and Relay persists no replayable bearer authority. After proof authentication, Relay `ready` projects the route, the local attachment, and current opposite-endpoint attachment, selector, and connection generation. The generation is derived from both ephemeral directory connection tokens, the route, and the selector. Platform sees only existing opaque routing metadata and the non-secret selector; Snow static authentication still decides whether the projected peer owns the paired endpoint key.

The first pairing uses an endpoint-owned opaque mailbox. Platform first allocates a challenge id and routing link containing no invitation payload. Desktop then creates and retains its XKpsk3 static key, ephemeral, and invitation PSK and appends the complete invitation only to its local QR projection; Mobile decodes it and creates messages 1 and 3 locally. Platform enforces Account ownership, expiry, ordering, single use, idempotency, per-installation capacity, terminal retention, and disable cleanup while storing only routing metadata and opaque handshake bytes. After Desktop authenticates message 3, it creates the Mobile Relay signing credential locally. Registration and attachment authorization derive the same digest from its public SPKI. Platform commits a prepared publication record before registering Relay authority or publishing Mobile authority, then finalizes mailbox and pairing state in a second transaction; confirm retries and Mobile status polling reconcile a process loss between those commits. Desktop retains one confirmation transaction across lost confirm or delivery responses and persistence failure. Mobile retains one post-open transaction across durable-save or Relay-start failure, so its one-shot grant opening is never repeated. Both sides discard retry secrets only after sealed delivery, durable reconnect-state persistence, and lifecycle startup settle.

Production Platform mounts the durable PostgreSQL pairing authority, PostgreSQL Relay route store, Redis directory and coordination adapter, pairing HTTP, and Relay WSS. It supplies no pairing crypto implementation: the legacy Platform-mediated operations fail closed while the product endpoints use only the mailbox operations. Desktop retains reconnect state in an Electron `safeStorage`-protected owner-only atomic file. Mobile retains its reconnect state and Mobile-only Relay grant in an Account-scoped IndexedDB record. Physical reconnect uses new attachment ids and fresh IK ephemerals.

Relay sends a content-free `peer-update` to already-connected counterparts after attachment registration, replacement, and close, including across Platform Instances. A new projection starts a candidate IK handshake but does not replace an active channel until Snow authenticates the exact route, selector, attachment ids, and generation. Desktop sends the IK response followed by a versioned encrypted `foreground-sync`; Mobile mutation authority remains closed until that projection authenticates.

## Alternatives considered

**Use the XKpsk3 handshake hash as pairing key material.** Rejected because the transcript hash authenticates the exchange but is not a secret transport key.

**Seal Relay authority with a separate Web Crypto AES-GCM key derived outside Snow.** Rejected because it creates another application cipher and key-derivation construction instead of using the reviewed Noise transport.

**Mount the Snow provider on Platform and call the result end-to-end encryption.** Rejected because Platform would own the endpoint private state and could derive the Companion channel.

**Keep a one-byte synchronization signal.** Rejected because a byte has no application version, authenticated fields, Desktop revision, or connection-generation binding.

## Consequences

The shipped Desktop, Mobile, and Platform entries now select the endpoint-owned pairing and attachment channel. Repository evidence covers opaque-mailbox loss and replay, digest-only Relay authority, two Mobile selectors, cross-instance late attachment and replacement, durable endpoint state, real XKpsk3 grant opening, fresh IK, stale transcript rejection, and authenticated foreground synchronization. Release acceptance still requires an independent review of the exact implementation plus physical WKWebView and Android WebView evidence; package tests, local Vite, and the proof executable do not replace those external records.
