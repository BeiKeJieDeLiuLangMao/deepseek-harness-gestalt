# Agent Note: Select Snow WebAssembly for the cross-runtime Noise security path

Status: implemented

English | [中文](2026-08-17-cross-runtime-noise-security-path.zh.md)

## Problem

Mobile Companion requires the fixed `Noise_XKpsk3_25519_ChaChaPoly_SHA256` pairing flow and `Noise_IK_25519_ChaChaPoly_SHA256` reconnect flow to behave identically in Node 22, Node 24, iOS `WKWebView`, and Android `WebView`. Choosing unrelated native and JavaScript implementations would multiply audit surfaces and make a successful handshake poor evidence of cross-runtime compatibility. Building X25519, ChaChaPoly, SHA-256, or Noise state transitions from primitives would create security-sensitive owned code contrary to the repository's [dependency decision](../process/2026-07-26-dependencies-over-hand-rolling.md).

The implementation choice also needs evidence beyond a happy path: official vectors, remote-static authentication, fresh ephemerals, active attack rejection, exact resource bounds, downgrade refusal, and wording that does not confuse hardware-backed wrapping at rest with X25519 execution.

## Decision

Select Snow 0.10.0, pinned by a proof-local `Cargo.lock`, and compile its pure-Rust 25519, ChaChaPoly, and SHA-256 resolver once to WebAssembly. The same committed module runs in all four runtime families. The thin Rust adapter may select protocols, provide keys and prologues, drive Snow's public handshake and transport APIs, and compare results; it may not copy, fork, or replace Noise or cryptographic primitives.

Keep the bounded proof under `scripts/noise-security-path` rather than creating a product package. Product code must not depend on it. The proof owns two exact Cacophony vectors, XKpsk3 and IK flows, bidirectional transport, fresh-ephemeral comparison, tamper/replay/order/cross-pairing/downgrade cases, a 65,535-byte maximum message round trip, and repeated 65,536-byte rejection. A keyless snapshot pins the stable result while native disposable hosts prove the actual WebView executions.

The [cross-runtime security proof](../../../../docs/security/noise-cross-runtime-proof.md) is the independent review entry point. Snow is the selected implementation, but product integration and release remain gated on an independent reviewer reproducing the proof, auditing the dependency and adapter, recording exact environments, and resolving findings. Simulator evidence never implies physical-device hardware protection.

The storage statement has two independent parts: native product code may wrap private material at rest using an operating-system hardware-backed facility where available; X25519 in this path executes in Snow WebAssembly process memory and is not claimed to be hardware-backed or non-extractable.

## Alternatives considered

- **Separate native Noise libraries plus a JavaScript library:** this creates multiple implementations and behavior surfaces, and cross-runtime parity becomes an interoperability project rather than one artifact check.
- **An existing JavaScript Noise package:** the evaluated package did not support the fixed PSK suite and did not provide the required maintained, vector-backed path, so it could not satisfy the accepted protocol names.
- **Implement the fixed suites from Web Crypto or low-level curve and AEAD primitives:** this maximizes owned protocol and cryptographic state-machine code and is rejected even if a prototype passes its own tests.
- **Treat successful WebView loading as proof:** loading establishes only artifact compatibility; it does not establish vector agreement, authentication, fresh ephemerals, attack rejection, or fixed resource behavior.

## Consequences

- One reviewed WASM artifact and one dependency graph become the candidate security implementation across desktop and mobile runtimes.
- The proof adds Rust and `wasm-bindgen-cli` build prerequisites, plus native simulator and emulator prerequisites for the full matrix; the ordinary keyless snapshot consumes the committed artifact without those native tools.
- The committed WASM must be reproducible from the locked source, and dependency updates require rerunning every vector, attack, resource, and runtime check plus independent review.
- Product integration still owns challenge lifecycle, relay framing, native storage, credential and revocation behavior, background behavior, and operational denial-of-service controls.
- No existing Agent Note is superseded; the dependency-over-hand-rolling decision remains the governing general rule.
