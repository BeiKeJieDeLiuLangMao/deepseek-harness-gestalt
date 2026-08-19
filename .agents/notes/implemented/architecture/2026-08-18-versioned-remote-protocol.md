# Agent Note: Own the versioned Remote Protocol in one deep module

Status: implemented

English | [中文](2026-08-18-versioned-remote-protocol.zh.md)

## Problem

Mobile and Desktop release independently, while Platform Relay must forward traffic without receiving Harness authority or application plaintext. Reusing the complete Host HTTP or WebSocket interface would expose settings, credentials, plugins, terminal input, model selection, and other capabilities outside the approved Companion catalog. Scattering codecs and compatibility logic through composition roots would let the same wire rule drift across endpoints.

## Decision

`@deepseek-ai/dsh-remote-protocol` owns Relay and Companion codecs, branded wire identifiers, stable errors, fixed limits, and independent version negotiation. It is a pure deep module with no Cordis service and no import from Workspace, Session, prompt, tool, model, approval, Host API, or WebSocket packages.

Relay Transport version 1 accepts only route attachment, opaque ciphertext forwarding, heartbeat, revocation, transport errors, and transport-version negotiation. Every decoded object uses an exact field set. Encrypted Companion accepts only its explicit projection, operation, and result unions plus application-version offers. Protocol-native Companion ids are adapted to Desktop authority outside this package rather than reusing authority-bearing Harness ids on the wire.

Companion major 2 and immediately preceding major 1 negotiate only when both offers contain authenticated encryption, pairing-key separation, and replay protection. Negotiation chooses the highest safe shared major regardless of offer-array order and skips an unsafe shared major when the immediately preceding major remains safe. Each logical endpoint connection owns a negotiation channel and at most one active unforgeable process-local token required by application encode and decode. Starting a negotiation invalidates the channel's prior token before evaluating its offers; failure leaves that channel inactive without revoking unrelated channels. No safe overlap raises a stable error naming the Mobile or Desktop endpoint that must update before application plaintext can be encoded.

The codecs bound complete message bytes, ciphertext bytes, parser depth, container values, total encoded values, string bytes, and transcript page entries. Base64url wire fields require their canonical unpadded spelling. Companion application data is capped at 60 KiB before encryption, leaving 4,095 bytes for encryption overhead under the fixed 65,535-byte Noise message ceiling. Complete encoded transcript-page messages are capped at 50 entries or 48 KiB of UTF-8 wire bytes. They reject malformed UTF-8/JSON, unsafe numbers, unknown discriminants, and extra fields before dispatch.

The Loader-assembled keyless example encrypts Mobile and Desktop payloads with a harness-local AES-GCM adapter and passes only ciphertext through the Relay codec. The adapter proves assembly and plaintext isolation, not product cryptography. The [Snow cross-runtime decision](2026-08-17-cross-runtime-noise-security-path.md) remains proof-local, and product integration or release still requires the independent review recorded by its security entry point. Platform Account and Installation authorization remain owned by the [Account decision](../feature/2026-08-17-platform-account-installation-sessions.md).

## Alternatives considered

**Tunnel the Host interface.** This would grant remote access to capabilities outside the accepted Mobile Companion authority and make Relay framing depend on Harness business types.

**Define endpoint-local codecs.** Mobile, Desktop, and Platform could disagree on limits, stable errors, downgrade behavior, or field rejection. A single protocol module makes those rules one implementation and one test surface.

**Integrate Snow into product code from this ticket.** The committed Snow artifact is a bounded proof whose independent security review has not authorized product integration. Keeping the protocol independent preserves the review gate and lets later endpoint adapters supply the approved channel.

**Negotiate one shared transport/application version.** Relay deployment compatibility and independently released Companion behavior evolve for different reasons. Coupling them would either force unnecessary Relay upgrades or allow application downgrade through a transport fallback.

## Consequences

Relay implementations can route and reject frames without linking Harness domains, while endpoint adapters share one application parser and compatibility decision. New Companion operations require explicit protocol union and parser changes, so the current narrow catalog cannot silently inherit a Host route. The package deliberately leaves pairing, encryption, credential persistence, blob capabilities, Desktop adaptation, and operation receipts to service or reviewed endpoint integrations; [stateless two-instance Relay](2026-08-18-stateless-two-instance-remote-relay.md) owns attachment authority and forwarding.
