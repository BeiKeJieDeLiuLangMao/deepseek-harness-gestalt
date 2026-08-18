# `@deepseek-ai/dsh-platform-account-client`

English | [中文](README.zh.md)

Installation client shared by Desktop and Mobile. It displays one canonical bilingual retention notice before authorization, creates a P-256 key, prepares the five-minute attempt before a user activation opens the system browser, and completes authorization by signed polling. A restored session is displayed only after Platform confirms its access token or rotates its refresh token.

`PlatformAccountHttpTransport` accepts only an identity selected from a validated development/production pair and parses every response variant from `unknown`. `PlatformAccountInstallation.authorizeCurrentInstallation()` refreshes when required and signs a fresh `current` proof without exposing the Installation private key; Desktop implements the same authority inside its Electron Host-owned Account controller. `IndexedDbInstallationAccountStore` parses durable records, requires a genuine private signing P-256 `CryptoKey`, and persists non-exported Mobile WebCrypto keys and Account Sessions; Desktop uses the same transport with its encrypted store. One closeable `AccountLifecycleTransitions` owner serializes load, login, polling, refresh, switching, sign-out, and current-installation authorization so concurrent restoration cannot clear or resurrect a newer session and shutdown can drain admitted work. Snapshot publication contains each subscriber independently and reports failures only after later subscribers run. `accountStorageNamespace` gives pairing keys, caches, and receipts disjoint account/environment prefixes when one Installation switches Accounts.

## Model Experience

None, as the controller never contributes model-visible state.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- This library supplies current-Installation Account authorization to Personal Pairing but does not grant Desktop or Companion authority.
- Mobile native packaging must supply a stable WebView storage origin; the Mobile composition owns its Capacitor Browser adapter.
