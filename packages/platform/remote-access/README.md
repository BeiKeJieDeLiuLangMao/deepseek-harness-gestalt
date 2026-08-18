# `@deepseek-ai/dsh-remote-access`

English | [中文](README.zh.md)

Remote Access Service Definition and single-process Personal Pairing Service Provider. `ctx.remoteAccess` keeps Mobile Access disabled per Desktop Installation until Settings enables it, creates two-minute single-use invitations, authenticates each Account Session's installation id and kind through `AccountService.currentInstallation()`, requires both Installations to resolve to the same Account, and grants a Device Principal only after explicit Desktop confirmation. Callers cannot assert their own installation identity or role.

The QR payload and full one-time HTTPS link are identical and carry a 256-bit invitation secret, Desktop fingerprint, rendezvous id, expiry, and protocol major. A completed handshake remains pending while both installations display the same six authentication words derived from its handshake hash. Expiry, cancellation, account mismatch, rejection, successful completion, and disablement destroy the corresponding crypto-provider capability. Completion and confirmation ids make retries idempotent, and serialized mutation gives one concurrent completion the invitation.

Terminal state is committed before provider cleanup. Failed challenge, pending-key, or active-key destruction remains in a retryable cleanup record, while client retries observe the original completion, confirmation, cancellation, rejection, or expiry result without repeating a handshake or activation. Each authenticated Installation may own at most four live challenges and four pending pairings; cleaned replay projections expire after five minutes, while cleanup-failed tombstones remain until destruction succeeds. Expiry is scheduled when a challenge is created, and provider disposal attempts every active and retained resource with all-settled error aggregation. Generated opaque-id and key-reference collisions fail without replacing retained records; any newly allocated resource remains cleanup-owned.

`PairingHandshakeProvider` is the only cryptographic adapter. The package does not implement Noise or derive pairing keys. Each activation returns a public branded key reference and a distinct provider-private allocation handle; collision rollback destroys only that new allocation and cannot address an existing pairing's key. The resulting Device Principal has only `companion-surface` authority. The HTTP Consumer and shared HTTP transport connect `ctx.remoteAccess` to the Desktop Settings and Mobile controllers. Mobile retains one prepared completion until success or invitation expiry so response-loss retries reuse its completion id and handshake bytes. Both controllers stop timers, drain in-flight work, and reject pairing verbs after sign-out or unmount. The Loader example runs that controller/HTTP path with an explicitly unreviewed keyless provider; it is not product cryptography.

## Model Experience

None, as pairing metadata, Device Principal origin, and Settings state never enter a model request.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Production activation remains fail-closed until an independent reviewer accepts the Snow proof and a reviewed `PairingHandshakeProvider` is assembled.
- The included provider owns single-process state. Durable multi-instance persistence, Relay routing, and revocation fan-out remain outside this package; it does not implement the cross-instance Relay planned for issue #32.
