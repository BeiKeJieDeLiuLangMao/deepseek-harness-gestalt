# Agent Note: GitHub Platform Account and installation sessions

Status: implemented

English | [中文](2026-08-17-platform-account-installation-sessions.zh.md)

## Problem

Desktop and Mobile need one Platform identity before Personal Pairing and Remote Access can authorize work. A GitHub browser login by itself does not define which provider fields Platform retains, how an app safely receives the result, how concurrent Platform processes agree that an installation signed out, or whether switching Accounts can expose pairing keys and receipts from the previous Account.

The two installation forms also have different trusted storage. Mobile WebCrypto can persist a non-exported key under a stable WebView origin. Desktop's renderer origin follows its loopback Web Host, so renderer storage cannot own a stable private key across launches.

## Decision

`@deepseek-ai/dsh-platform-account` is the Service Definition for Platform Account and the current Installation's Account Session. The core provider stores the immutable numeric GitHub id in an environment identity namespace and refreshes only public login and avatar. Its OAuth App request uses random state and S256 PKCE without a scope parameter; a non-empty returned scope is rejected, and the GitHub token is discarded after `/user` returns the public identity.

An Installation starts a five-minute Login Attempt. GitHub returns to one fixed HTTPS Platform callback. The app receives no OAuth code or provider token: it polls with a signed, single-use attempt token and a fresh P-256 proof. Successful polling creates one Account Session for the Installation and replaces any earlier session for that Installation. Access tokens last 15 minutes; refresh tokens rotate on each use and expire after at most 30 days. Current-account reads, refresh, and sign-out require a timestamped, replay-protected proof.

The Account provider commits revocation before publishing the Account Session id through `AccountInvalidationBus`. Every Platform Instance closes connections tracked for that id. Sign-out clears only the current Installation's authorization. Personal Pairings and account-scoped material remain in namespaces that include environment and Account id; switching Accounts selects another namespace instead of overwriting or sharing the previous one.

Desktop Host owns its private key, session tokens, system-browser invocation, and `safeStorage`-encrypted environment file. The renderer receives only an Account snapshot and lifecycle verbs through preload. Desktop presents Account state only in the `手机配对` Settings section; the normal sidebar and Session interaction remain unchanged. Mobile owns a non-exported WebCrypto key in IndexedDB and receives the system-browser adapter from native packaging. Both presentations display the complete Chinese and English retention notice before authorization and state that the first version has no account deletion.

Development and production use different HTTPS origins, fixed callbacks, GitHub OAuth Apps, credential namespaces, database namespaces, and identity namespaces. Configuration rejects equality for any of those identities; clients select one explicit environment and never fail over between them.

## Alternatives considered

**Redirect an OAuth code or token to a custom application URL.** This makes an application handler a credential transport and complicates replay and installation binding. Signed polling keeps the provider callback and credentials on Platform.

**Use a GitHub token as the Platform session.** Provider-token lifetime, scope inheritance, and revocation would become Platform authorization semantics. The separate proof-of-possession session lets Platform retain only public identity and revoke one Installation independently.

**Store the Desktop key in renderer IndexedDB.** The Desktop Web Host uses a loopback URL whose port can change. Electron Host storage gives the installation a stable owner and keeps signing material outside web content.

**Delete Pairings on sign-out or Account switch.** Sign-out would become destructive and would conflate identity authorization with the independent Personal Pairing relationship. Account-scoped namespaces preserve material without making it visible to another Account.

**Share development and production identity infrastructure.** A client or credential mistake could authenticate or persist into the other environment. Distinct identities make cross-environment acceptance fail before runtime traffic.

## Consequences

Platform deployment must supply atomic Account persistence, distributed invalidation, OAuth credentials, signing keys, rate limits, audit retention, and HTTPS edge behavior. The in-memory backend and bus are acceptance/development adapters, not production durability. Native Mobile packaging must supply the system-browser opener and stable WebView origin. Account deletion, session lists, remote sign-out, sign-out-all, recovery, identity linking, Personal Pairing, and Remote Access remain separate capabilities.

## Testing

Core tests cover PKCE/no-scope authorization, single-use polling, expiry values, proof replay, refresh rotation, environment separation, callback state, and cross-instance connection closure. Installation tests cover privacy gating on Desktop and Mobile, server-confirmed restoration, refresh during restoration, Account namespace isolation, and sign-out preservation. Desktop integration tests pass Host-generated P-256 proofs through the real Account provider. The `examples/platform-account/cordis.yml` Loader snapshot runs the complete keyless flow through two provider instances and records the 15-minute/30-day lifecycle and cross-instance sign-out.
