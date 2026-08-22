# DeepSeek Gestalt Mobile

English | [中文](README.zh.md)

Mobile account and Personal Pairing shell for the current Installation. It shows the bilingual retention notice before GitHub authorization, opens authorization outside the app, polls Platform with P-256 proof, restores only a server-confirmed Account Session, and signs out this Installation without deleting Personal Pairings. The product entry keeps pairing and Relay unavailable until the reviewed Companion channel is composed; keyless handshake code exists only as a named test fixture.

The entry accepts one operated production identity through `VITE_PLATFORM_ORIGIN`, `VITE_PLATFORM_CALLBACK_URL`, `VITE_PLATFORM_GITHUB_CLIENT_ID`, `VITE_PLATFORM_CREDENTIAL_REFERENCE`, `VITE_PLATFORM_DATABASE_IDENTITY`, and `VITE_PLATFORM_IDENTITY_NAMESPACE`. Missing fields, localhost, non-HTTPS origins, and callback mismatch fail before local storage, rendering, or network traffic.

The shared Mobile entry includes the `@capacitor/browser` adapter and calls it directly from the prepared authorization button's user activation. It has no `window.open`, popup, or custom-URL token fallback. `IndexedDbInstallationAccountStore` uses the selected database identity in its database name; native packaging supplies the stable WebView origin.

`apps/mobile/src/companion-cache.ts` is an unwired library: it seals opened Workspace/Session metadata and transcripts at rest per Paired Desktop with AES-GCM keys injected through the Personal Pairing seam, and stores rows in an IndexedDB database named by `companionCacheDatabaseName` (`${accountStorageNamespace(environment, accountId)}:companion-cache`) so account switch isolates caches and receipts from the pairing-key store. Attachment bytes, terminal content, spill files, and credentials never enter the cache. `CompanionUncertainOperationSettlement` requires foreground synchronization before sending any mutation, stores an Operation Receipt only after a mutation left the device, consults existing receipts before send, reconciles unknown receipts through `query-operation-status`, and never replays an operation.

```sh
pnpm --filter @deepseek-ai/dsh-mobile build
pnpm --filter @deepseek-ai/dsh-mobile exec vite --host
```

Vite resolves workspace packages through [`tsconfig.base.json`](../../tsconfig.base.json) paths so those commands run on the source plane. An Android emulator must `adb reverse` the Vite port and open `http://127.0.0.1`; `10.0.2.2` is not a secure context and cannot create an Installation id.

## Known Limitations and Deferred Work

- Production pairing remains unavailable until the independent Noise review admits a reviewed handshake provider. The shipped entry has no keyless or development selection.
- The Companion Cache library is not wired into the Mobile entry: the composition does not construct `companionCacheDatabaseName`, inject #31 pairing-derived keys, answer Desktop `query-operation-status` queries, or expose composer, offline-receipt, or clear-cache UI.
- Remote Companion traffic and attachment flows are outside this shell. `CompanionForegroundRuntime` is the sole Relay start/stop owner: pairing and visibility share one transition queue, backgrounding stops WSS, and `unpair()` drops the grant so a later visibility change cannot start the socket. Every physical attachment ready/lost transition creates or invalidates one synchronization generation, and transport errors also clear `socketOpen` and `synchronized`. Arbitrary Relay ciphertext cannot complete synchronization. The authenticated Encrypted Companion decoder owned by #217 must decode a supported versioned Desktop resync message and call the receiver returned by `MobileCompanionSurface.bindValidatedDesktopResync`; a receiver from an earlier attachment cannot authorize a replacement socket or replace the last authenticated projection. The shipped `main.tsx` and the keyless snapshot both call `mountMobileEntry`, which constructs that surface and supplies it to the shared Web components. The snapshot uses an operated production identity fixture, retains a previously authenticated Session across a physical reconnect, and pins Session creation, prompts, cancellation, approvals, Ask User answers, and attachment controls as disabled until current-generation resynchronization. The final transmission controller also fails closed. Mobile ships no background notification delivery; opening or foregrounding the application is how it learns current Desktop state.
- Native iOS/Android project generation and device packaging remain outside this shell; the checked-in composition includes the Capacitor system-browser adapter and shared WebView Account lifecycle.
