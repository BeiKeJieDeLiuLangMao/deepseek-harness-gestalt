---
description: "Platform Account Service Definition for GitHub identity and current-installation Account Sessions."
kind: "package-reference"
---

# `@deepseek-ai/dsh-platform-account`

English | [中文](README.zh.md)

## Summary

Service Definition for Platform Account identity and the Account Session bound to one Desktop or Mobile Installation. `AccountService` owns Login Attempt creation, GitHub callback completion, signed polling, access-token refresh, current-account reads, authenticated current-installation reads, current-installation sign-out, and connection tracking through `ctx.platformAccount`. A Mobile Login Attempt commits its bounded device name and iOS or Android platform into the resulting Account Session. `currentInstallation()` returns the provider-bound Installation id, kind, and Mobile presentation with the Account projection, so another capability never needs Account tables or caller-supplied identity fields. Quota admission checks an existing Installation by row existence rather than decoding its obsolete session payload, allowing a forced login to replace a pre-presentation Mobile row atomically.

The public types brand Account, Login Attempt, Account Session, Installation, and proof-JTI ids. Runtime `AccountError` exposes stable failure codes for invalid or expired attempts, invalid or replayed proof, expired or revoked sessions, and open-registration `QUOTA` / `PLATFORM_CAPACITY` failures that carry `retryAfter` in seconds; the `./types` subpath remains type-only. Spec-fixed ceilings are ten live Desktop installations, ten live Mobile installations, and twenty concurrent tracked connections per Account. An optional shared `PlatformCapacityState` sheds new login while established sessions remain usable.

`loadOperatedPlatformEnvironment` is the product-entry parser: it accepts one complete production identity and rejects local origins. `loadPlatformEnvironment` validates and selects a development/production pair only for bounded compositions such as examples and tests. Product clients supply the operated identity through deployment-owned build artifacts and have no runtime development selector.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

None, as Platform Account state adds no messages, tools, or prompt text.

#### KV Cache effect

None.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- Account deletion, session lists, remote sign-out, sign-out-all, recovery, and identity linking are not part of this service.
- Personal Pairings are a separate capability and are never deleted by `signOut`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
