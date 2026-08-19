# Remote Access HTTP

English | [中文](README.zh.md)

HTTP and WSS Consumers for the public Remote Access services. One fixed HTTP route accepts current-Installation Account proof headers, validates operation input, and delegates only through `ctx.remoteAccess`. The exact WSS path accepts only Relay Transport frames and delegates authenticated attachments through `ctx.remoteRelay`.

The Consumer reads no Account database fields and grants no authority itself. The Remote Access provider authenticates the Account and Installation role through the Platform Account public service before any pairing lifecycle mutation.

The WSS Consumer requires attach as its first frame, applies an explicit attach deadline and the protocol message-byte ceiling, disables compression, serializes frames, and sends a matching ready acknowledgement only after authorization and directory registration complete. It tears down the Relay attachment with the socket and returns only content-free stable transport errors. TLS termination and the single non-sticky endpoint remain deployment responsibilities. Assembled two-instance routing evidence lives in the [two-instance Remote Relay acceptance Agent Note](../../../.agents/notes/implemented/testing/2026-08-19-two-instance-routing-assembled-acceptance.md).

## Model Experience

None, as the HTTP Consumer handles pairing state outside model requests.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- The WSS Consumer forwards opaque Relay ciphertext only; it never accepts Host requests or Companion plaintext.
- Deployment TLS, edge limits, and audit policy remain Platform composition responsibilities.
