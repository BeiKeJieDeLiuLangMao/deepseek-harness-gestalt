---
description: "Desktop and Mobile installation client for Platform Account login, proof, storage isolation, and sign-out."
kind: "package-reference"
---

# `@deepseek-ai/dsh-platform-account-client`

English | [中文](README.zh.md)

## Summary

Sign Desktop or Mobile installations into Platform Account through a browser-based, signed polling flow. The client shows the retention notice, creates a P-256 key, prepares a five-minute attempt, validates stored sessions, and resumes valid pending login. Installation secrets remain isolated from ordinary storage, and late loads cannot replace a newly prepared login.

## Table of Contents

- [Package contract](#package-contract)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="package-contract"></a>
## Package contract

Installation client shared by Desktop and Mobile. It displays one canonical bilingual retention notice before authorization, creates a P-256 key, prepares the five-minute attempt before a user activation opens the system browser, and completes authorization by signed polling. `load()` confirms a stored session with Platform before publishing it, resumes a still-valid pending login as polling when no session exists, and clears an expired pending attempt. A late `load()` keeps a newly prepared login ready while the current process still holds its authorization URL for the required user activation.

`PlatformAccountHttpTransport` accepts only an identity selected from a validated development/production pair, keeps the default Fetch implementation bound to the global so browsers can call it, copies request headers as records so Host callers never construct Chromium `Headers`, and parses every response variant from `unknown`, including `QUOTA` and `PLATFORM_CAPACITY` with optional `retryAfter`. `PlatformAccountTransport.beginLogin` and the HTTP implementation accept an optional `{ signal?: AbortSignal }` that aborts the login-attempt POST; `SystemBrowser.open` may take the same optional signal so a Desktop cancel can wait until `shell.openExternal` is quiescent. `PlatformAccountInstallation.authorizeCurrentInstallation()` refreshes when required and signs a fresh `current` proof without exposing the Installation private key; Desktop implements the same authority inside its Electron Host-owned Account controller. `IndexedDbInstallationAccountStore` parses durable records, requires a genuine private signing P-256 `CryptoKey`, and persists non-exported Mobile WebCrypto keys and Account Sessions; Desktop uses the same transport with its encrypted store. One closeable `AccountLifecycleTransitions` owner serializes load, login, polling, refresh, switching, sign-out, and current-installation authorization so concurrent restoration cannot clear or resurrect a newer session and shutdown can drain admitted work. Snapshot publication contains each subscriber independently and reports failures only after later subscribers run. `accountStorageNamespace` gives pairing keys, caches, and receipts disjoint account/environment prefixes when one Installation switches Accounts.

<a id="model-experience"></a>
## Model Experience

Indirectly, through the authenticated Account Session and installation proof that Project Membership and Personal Pairing consumers use for model-facing work.

#### KV Cache effect

Account state adds no stable request prefix by itself; authorization changes which membership and paired-device data can reach later model-facing consumers.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- This library supplies current-Installation Account authorization to Personal Pairing but does not grant Desktop or Companion authority.
- Mobile native packaging must supply a stable WebView storage origin; the Mobile composition owns its Capacitor Browser adapter.

No runtime invariant companion is published because its request, socket, and snapshot state is private to the controller and has no independent event stream.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
