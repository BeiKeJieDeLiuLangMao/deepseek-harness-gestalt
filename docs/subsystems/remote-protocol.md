# Remote Protocol

English | [中文](remote-protocol.zh.md)

[`@deepseek-ai/dsh-remote-protocol`](../../packages/platform/remote-protocol/README.md) defines the only wire vocabulary shared by Mobile, Desktop, and the opaque Relay. It is a pure protocol module rather than a Cordis service.

## Independent protocols

Relay Transport version negotiation is independent from Encrypted Companion application negotiation. Relay can parse only attachment, forwarding, heartbeat, revocation, and transport-error metadata; its forwarding payload remains bytes. Companion messages become available only after both endpoints select the highest safe shared major among major 2 and 1 with authenticated encryption, pairing-key separation, and replay protection.

The negotiation result is an unforgeable process-local capability required by `encodeCompanionMessage` and `decodeCompanionMessage`. `COMPANION_UPDATE_REQUIRED` and `COMPANION_SECURITY_CAPABILITY_MISSING` identify the endpoint that must update. Callers cannot produce an application message before successful negotiation, so the failure path carries only version and capability metadata.

## Wire values

Relay route and attachment ids and Companion operation, Session-projection, and transcript-entry ids are distinct branded strings parsed from `unknown`. Companion uses protocol-native identifiers and does not import Harness domain types. Both codecs reject unknown discriminants, extra fields, unsafe numbers, malformed UTF-8/JSON, excessive parser depth, large containers, excessive encoded values, oversized messages, and oversized ciphertext. Transcript pages have an additional 200-entry ceiling.

The package owns no encryption implementation. Endpoint adapters encrypt offers and application messages with the reviewed paired channel. The keyless Loader example uses a harness-local cipher only to prove that Relay decoding and forwarding never require application plaintext.
