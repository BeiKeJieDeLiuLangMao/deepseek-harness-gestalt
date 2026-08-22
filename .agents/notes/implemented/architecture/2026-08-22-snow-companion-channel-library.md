# Agent Note: Snow Companion channel library

Status: implemented

English | [中文](2026-08-22-snow-companion-channel-library.zh.md)

## Problem

The selected Snow proof exercises XKpsk3 and IK but exposes only a stable report. Personal Pairing needs a reusable endpoint library without treating the public handshake hash as a secret, wrapping Relay authority in an unrelated AES-GCM construction, or admitting an untyped byte as foreground synchronization. Product composition also cannot claim end-to-end encryption if Platform owns the Desktop or Mobile private keys.

## Decision

`@deepseek-ai/dsh-noise-channel` compiles pinned Snow 0.10.0 to one committed WebAssembly module. XKpsk3 completes three messages and uses its responder transport state to seal the Mobile Relay grant. The handshake hash supplies authentication words only. After the grant transition, each endpoint retains its local static key and the authenticated peer static public key; invitation PSK, ephemerals, and transcript state are zeroed.

Each physical Relay attachment establishes a new IK handshake with a Snow-generated ephemeral. Its prologue binds the Relay route, a non-secret Personal Pairing selector, independent Desktop and Mobile attachment ids, and connection generation. The resulting ordered transport encrypts only versioned Encrypted Companion Protocol values. Foreground synchronization is the `foreground-sync` projection with a positive connection generation and Desktop revision.

Each Mobile Relay credential record binds its pairing selector beside the credential digest. After credential authentication, Relay `ready` projects the route, the local attachment, and current opposite-endpoint attachment, selector, and connection generation. The generation is derived from both ephemeral directory connection tokens, the route, and the selector. Platform sees only existing opaque routing metadata and the non-secret selector; Snow static authentication still decides whether the projected peer owns the paired endpoint key.

The Mobile production entry selects the endpoint-owned IK owner and admits Companion messages only after that owner completes. Desktop remains fail-closed because the current HTTP pairing provider still owns the Desktop static state on Platform; mounting that provider would misrepresent Platform-mediated encryption as end-to-end encryption. Desktop-owned durable pairing state and its first-pairing message path must replace that provider before the Desktop product entry can select the responder.

The non-sticky XKpsk3 HTTP transition rebuilds Snow state with a Snow-generated single-use ephemeral through `fixed_ephemeral_key_for_testing_only`. This exact use, the generated binding, and the committed WASM remain in the independent review scope.

## Alternatives considered

**Use the XKpsk3 handshake hash as pairing key material.** Rejected because the transcript hash authenticates the exchange but is not a secret transport key.

**Seal Relay authority with a separate Web Crypto AES-GCM key derived outside Snow.** Rejected because it creates another application cipher and key-derivation construction instead of using the reviewed Noise transport.

**Mount the Snow provider on Platform and call the result end-to-end encryption.** Rejected because Platform would own the endpoint private state and could derive the Companion channel.

**Keep a one-byte synchronization signal.** Rejected because a byte has no application version, authenticated fields, Desktop revision, or connection-generation binding.

## Consequences

The repository has executable XKpsk3 grant sealing, credential-bound peer projection, fresh attachment-bound IK, replay and ordering rejection, route/selector/attachment transcript rejection, and versioned authenticated synchronization without a second application cipher. Remote Access also supports an idempotent third handshake message and prevents Desktop confirmation before it completes. Product activation still depends on Desktop endpoint ownership, native durable storage, physical-device evidence, and an independent review of the exact adapter; local package tests and the existing proof do not satisfy those release conditions.
