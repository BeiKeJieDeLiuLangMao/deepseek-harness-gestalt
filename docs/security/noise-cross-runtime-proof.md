# Cross-runtime Noise security proof

English | [中文](noise-cross-runtime-proof.zh.md)

This document is the reproducible security-review entry point for [Gestalt issue 28](https://github.com/BeiKeJieDeLiuLangMao/deepseek-harness-gestalt/issues/28) under [Mobile Companion Spec 27](https://github.com/BeiKeJieDeLiuLangMao/deepseek-harness-gestalt/issues/27). It records a bounded proof and implementation decision; it does not add a Mobile Companion transport to the product.

## Decision and scope

The selected implementation is [Snow 0.10.0](https://github.com/mcginty/snow/tree/v0.10.0), compiled once from Rust to WebAssembly and used unchanged by Node, `WKWebView`, and Android `WebView`. `Cargo.lock` pins Snow and its transitive dependencies. The adapter only configures Snow, drives handshakes and transport messages, and evaluates results; it does not implement Noise tokens, X25519, ChaChaPoly, SHA-256, or a new wire protocol. This follows the repository decision to prefer a maintained dependency when it deletes security-sensitive owned code.

The proof admits exactly `Noise_XKpsk3_25519_ChaChaPoly_SHA256` for first pairing and `Noise_IK_25519_ChaChaPoly_SHA256` for reconnect. Both use the `dsh-mobile-companion-v1` prologue. The protocol names, handshake roles, PSK position, maximum message size, and downgrade allowlist are constants in the reviewed adapter.

Product owner authorization to mount this path is recorded in [the product Snow handshake note](../../.agents/notes/implemented/architecture/2026-08-21-snow-product-handshake.md). That record is not the independent-reviewer form below. Companion frames, IK reconnect, and native key wrapping remain separate product work.

## Evidence inventory

The committed proof is [scripts/noise-security-path/src/lib.rs](../../scripts/noise-security-path/src/lib.rs). Its stable report is also exercised by the keyless runnable snapshot [noise-security-path.snapshot.ts](../../scripts/noise-security-path.snapshot.ts).

| Evidence | What is checked |
|---|---|
| Official vectors | All six messages, including exact handshake and transport ciphertexts and payloads, plus the handshake hash for each fixed protocol name are compared against the Noise v34 Cacophony vectors. |
| Target flows | XKpsk3 pairing and IK reconnect complete in both directions, authenticate the expected remote static keys, and exchange bidirectional transport payloads. |
| Fresh ephemerals | Two independently generated pairing handshakes and two independently generated reconnect handshakes expose different first ephemeral public keys. |
| Active attacks | Modified ciphertext, the authenticated third message from a completed XKpsk3 transcript replayed at the matching authentication stage of a fresh pairing, replayed transport messages, out-of-order transport messages, a different Desktop static identity during pairing, and non-allowlisted protocol names are rejected. The stale transcript's first message is accepted before the fresh responder emits a new second message, so this case is distinct from a generic state-order error. |
| Resource bounds | A 65,535-byte Noise message carrying a 65,519-byte payload round-trips, and sixteen consecutive 65,536-byte messages are rejected. The attempt count is fixed so the proof itself stays bounded. |
| Runtime parity | The same committed WASM module and JavaScript loader produce the same report in Node 22, Node 24, iOS Simulator `WKWebView`, and Android Emulator `WebView`. Native hosts only load assets and return the JSON result. |

The two selected complete vectors are committed at [official-noise-v34.json](../../scripts/noise-security-path/vectors/official-noise-v34.json). Their metadata records the Git blob and SHA-256 of the [Snow 0.10.0 copy of Cacophony's vectors](https://github.com/mcginty/snow/blob/v0.10.0/tests/vectors/cacophony.txt); the proof rejects either selected vector unless all six upstream messages are present. The Noise project documents Cacophony as an official vector generator and defines the vector format in its [test-vector guidance](https://github.com/noiseprotocol/noise_wiki/wiki/Test-vectors). The 65,535-byte message ceiling comes from the [Noise Protocol Framework](https://noiseprotocol.org/noise.html#message-format).

## Key storage claim

The proof deliberately separates storage at rest from cryptographic execution:

- Product integration may wrap private key material at rest with the native operating-system hardware-backed facility where that facility is available.
- X25519 operations in this selected path run inside Snow WebAssembly process memory. This proof makes no Secure Enclave, StrongBox, KeyMint, hardware-X25519, or non-extractability claim.
- Simulator success proves WebView compatibility, not physical-device hardware key protection. Native storage and zeroization require their own implementation and review evidence.

## Reproduce the review

Use a clean checkout on macOS with Rust, the `wasm32-unknown-unknown` target, `wasm-bindgen-cli` 0.2.127, pnpm, Xcode with an available iPhone Simulator, and an Android SDK containing platform 34, Build Tools 35.0.0, and an arm64 AVD named `GestaltTest`. The Node matrix defaults to Homebrew's Node 22 and 24 paths; set `DSH_NOISE_NODE22_BIN` and `DSH_NOISE_NODE24_BIN` for other installations. Android paths may be selected with `ANDROID_SDK_ROOT`, `DSH_NOISE_ANDROID_API`, `DSH_NOISE_ANDROID_BUILD_TOOLS`, and `DSH_NOISE_ANDROID_AVD`.

Run:

```sh
pnpm run proof:noise:build
git diff --exit-code -- scripts/noise-security-path/pkg
cargo test --locked --manifest-path scripts/noise-security-path/Cargo.toml
cargo clippy --locked --manifest-path scripts/noise-security-path/Cargo.toml --all-targets -- -D warnings
cargo tree --locked --manifest-path scripts/noise-security-path/Cargo.toml -i getrandom@0.3.4
pnpm run test:noise-runners
pnpm run proof:noise:node-matrix
pnpm run proof:noise:ios
pnpm run proof:noise:android
pnpm exec vitest run --config vitest.snapshot.config.ts scripts/noise-security-path.snapshot.ts
```

The build command must reproduce the committed JavaScript and WASM without a diff. The dependency query must show Snow and the proof crate on the same `getrandom` 0.3.4 graph, with no 0.2 branch. Each runtime command must return `allPass: true`, the two exact protocol names, every attack result as `true`, and the same resource limits. The iOS and Android runners build disposable native hosts, launch the actual platform WebView, validate the runtime label, then remove the proof app. Their keyless fake-command tests cover owned-resource cleanup after wait, boot, build, install, and launch failures; cleanup failures are aggregated and do not suppress the primary failure. They do not substitute a Node result.

An independent reviewer should also inspect the following items before approving product integration:

1. Confirm that `Cargo.toml`, `Cargo.lock`, and `THIRD_PARTY_NOTICES.txt` resolve Snow 0.10.0 from the expected registry source, that Snow uses the retained `getrandom` 0.3.4 graph, that no unused 0.2 branch remains, and that the upstream release and repository maintenance posture remain acceptable.
2. Compare all six messages in each committed vector with the pinned Cacophony Git blob and SHA-256 source, including ciphertexts, payloads, and handshake hashes, rather than trusting the proof's success label.
3. Confirm that the Rust adapter uses Snow's public builder and state-machine APIs and contains no copied Noise primitive or modified Snow source.
4. Inspect each negative case for the intended failure reason and confirm that the protocol allowlist has no negotiation fallback.
5. Re-run all five environments and retain exact tool, OS, simulator, emulator, and WebView versions with the review record.
6. Confirm that the storage wording does not imply hardware-backed X25519 execution or protection on simulators.

Record the independent result on the pull request using this minimum form:

```text
Independent Noise security review: PASS | FAIL
Reviewer and affiliation:
Reviewed commit:
Tool and runtime versions:
Vector provenance verified: yes | no
Attack and resource cases reproduced: yes | no
Thin-adapter and dependency-source audit: pass | fail
Storage-claim wording accepted: yes | no
Findings and required follow-ups:
```

Until that record is present and all findings are resolved, this proof is evidence for the implementation choice, not authorization to ship the Mobile Companion security path.

## Known limits

The proof does not test relay authentication, relay framing, credential refresh, reconnect scheduling, device revocation, QR challenge expiry, durable nonce storage, OS background behavior, or denial-of-service controls outside one Noise message. It also does not prove constant-time behavior of a WebView engine, native key zeroization, physical-device hardware behavior, supply-chain policy beyond the pinned dependency inventory, or interoperability with an implementation other than Snow. Those remain explicit review and integration work rather than implicit claims of this prototype.
