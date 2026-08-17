# `@deepseek-ai/dsh-platform-account-client`

English | [中文](README.zh.md)

Installation client shared by Desktop and Mobile. It displays one bilingual retention notice before authorization, creates a P-256 key, opens the GitHub URL through an injected system-browser adapter, and completes the five-minute attempt by signed polling. A restored session is displayed only after Platform confirms its access token or rotates its refresh token.

`PlatformAccountHttpTransport` selects one trusted HTTPS origin from a build-owned development/production pair. `IndexedDbInstallationAccountStore` persists non-exported Mobile WebCrypto keys and Account Sessions; Desktop uses the same transport with its Electron Host-owned encrypted store. `accountStorageNamespace` gives pairing keys, caches, and receipts disjoint account/environment prefixes when one Installation switches Accounts.

## Model Experience

None, as the controller never contributes model-visible state.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- This library does not implement Personal Pairing or Remote Access.
- Mobile native packaging must supply a system-browser opener and stable WebView storage origin.
