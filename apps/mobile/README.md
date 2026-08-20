# DeepSeek Gestalt Mobile

English | [中文](README.zh.md)

Mobile account and Personal Pairing shell for the current Installation. It shows the bilingual retention notice before GitHub authorization, opens authorization outside the app, polls Platform with P-256 proof, restores only a server-confirmed Account Session, and signs out this Installation without deleting Personal Pairings. After sign-in, the pairing controller sends the exact complete one-time link from either paste or the native QR scanner through the same authenticated Remote Access transport, displays authentication words, and polls the Mobile-owned pending id until explicit Desktop confirmation produces the paired state. Confirmation carries Mobile-specific Relay authority sealed to the pairing key; the Mobile crypto adapter opens it and starts the bounded WSS lifecycle without receiving the Desktop credential.

The entry validates the complete development and production identity pair before rendering: each side supplies `ORIGIN`, `CALLBACK_URL`, `GITHUB_CLIENT_ID`, `CREDENTIAL_REFERENCE`, `DATABASE_IDENTITY`, and `IDENTITY_NAMESPACE` under its `VITE_PLATFORM_DEVELOPMENT_*` or `VITE_PLATFORM_PRODUCTION_*` prefix, and `VITE_PLATFORM_ENV` explicitly selects one side. Every paired field must differ. Missing, unknown, shared, non-HTTPS, or callback-mismatched configuration fails before rendering or network traffic.

The shared Mobile entry includes the `@capacitor/browser` adapter and calls it directly from the prepared authorization button's user activation. It has no `window.open`, popup, or custom-URL token fallback. `IndexedDbInstallationAccountStore` uses the selected database identity in its database name; native packaging supplies the stable WebView origin.

`apps/mobile/src/companion-cache.ts` is an unwired library: it seals opened Workspace/Session metadata and transcripts at rest per Paired Desktop with AES-GCM keys injected through the Personal Pairing seam, and stores rows in an IndexedDB database named by `companionCacheDatabaseName` (`${accountStorageNamespace(environment, accountId)}:companion-cache`) so account switch isolates caches and receipts from the pairing-key store. Attachment bytes, terminal content, spill files, and credentials never enter the cache. `CompanionUncertainOperationSettlement` stores an Operation Receipt only after a mutation left the device, consults existing receipts before send, reconciles unknown receipts through `query-operation-status`, and never replays an operation.

```sh
pnpm --filter @deepseek-ai/dsh-mobile build
```

## Known Limitations and Deferred Work

- Production pairing remains unavailable until the independent Noise review admits a reviewed handshake provider. `VITE_PERSONAL_PAIRING_KEYLESS=1` selects the real development controller and explicitly unreviewed keyless Mobile handshake only when the selected Platform environment is development. That mode also requires `VITE_REMOTE_RELAY_WSS_URL`, `VITE_REMOTE_RELAY_ATTACH_TIMEOUT_MS`, `VITE_REMOTE_RELAY_HEARTBEAT_INTERVAL_MS`, `VITE_REMOTE_RELAY_RECONNECT_DELAY_MS`, `VITE_REMOTE_RELAY_INBOUND_MAX_BYTES`, and `VITE_REMOTE_RELAY_INBOUND_MAX_MESSAGES`; all are validated before the app renders.
- The Companion Cache library is not wired into the Mobile entry: the composition does not construct `companionCacheDatabaseName`, inject #31 pairing-derived keys, answer Desktop `query-operation-status` queries, or expose composer, offline-receipt, or clear-cache UI.
- Remote Companion traffic and attachment flows are outside this shell. `CompanionForegroundRuntime` is the sole Relay start/stop owner: pairing and visibility share one transition queue, Mobile `onCiphertext` after Desktop resync calls `synchronize()`, and `unpair()` drops the grant so a later visibility change cannot start the socket. `settleCompanionInteraction` requires foreground reconnect plus that sync; native APNs/FCM registration and real-device delivery remain outside this shell.
- Native iOS/Android project generation and device packaging remain outside this shell; the checked-in composition includes the Capacitor system-browser adapter and shared WebView Account lifecycle.
