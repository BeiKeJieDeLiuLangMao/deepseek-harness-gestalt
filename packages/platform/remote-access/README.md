# `@deepseek-ai/dsh-remote-access`

English | [中文](README.zh.md)

Remote Access Service Definition and single-process Personal Pairing provider. `ctx.remoteAccess` keeps Mobile Access disabled per Desktop Installation until Settings enables it, creates two-minute single-use invitations, requires both Installations to resolve through the Platform Account public service to the same Account, and grants a Device Principal only after explicit Desktop confirmation.

The QR payload and full one-time HTTPS link are identical and carry a 256-bit invitation secret, Desktop fingerprint, rendezvous id, expiry, and protocol major. A completed handshake remains pending while both installations display the same six authentication words derived from its handshake hash. Expiry, cancellation, account mismatch, rejection, successful completion, and disablement destroy the corresponding crypto-provider capability. Completion and confirmation ids make retries idempotent, and serialized mutation gives one concurrent completion the invitation.

`PairingHandshakeProvider` is the only cryptographic adapter seam. The package does not implement Noise or derive pairing keys. Each activation must return a unique provider-owned key reference; the resulting Device Principal has only `companion-surface` authority. The keyless example is an assembled lifecycle proof, not product cryptography.

## Model Experience

None, as pairing metadata, Device Principal origin, and Settings state never enter a model request.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Production activation remains fail-closed until an independent reviewer accepts the Snow proof and a reviewed `PairingHandshakeProvider` is assembled.
- The included provider owns single-process state for acceptance and composition. Durable multi-instance persistence, Relay routing, revocation fan-out, and production HTTP transport belong to the Remote Access deployment work.
