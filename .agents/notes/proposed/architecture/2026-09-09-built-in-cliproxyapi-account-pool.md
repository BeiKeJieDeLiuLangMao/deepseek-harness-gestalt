# Agent Note: Build the Desktop account pool around an embedded CLIProxyAPI core

Status: proposed

English | [中文](2026-09-09-built-in-cliproxyapi-account-pool.zh.md)

## Problem

DeepSeek Gestalt currently offers a Desktop-only Sub2API component that the user downloads and enables after installation. The Desktop Host installs an out-of-tree Harness plugin and a runtime pack, restarts the Web Host, and renders the sidecar's management workspace inside Settings. That design pays for an independent plugin release, PostgreSQL and Redis, an installation state machine, and an embedded foreign UI before the user can add an account.

The replacement must make the account pool part of the Desktop Bundle. It must supervise one local CLIProxyAPI core, present a Gestalt-owned account and quota experience, and publish one usable model provider without exposing management credentials to the renderer. The product also needs a durable source relationship with the upstream core while carrying a Gestalt GLM subscription addition whose source and license are still under review.

## Proposal

DeepSeek Gestalt will ship CLIProxyAPI as a built-in Desktop component. The Desktop Bundle will contain a platform binary built from an exact commit of [`gestaltrun/CLIProxyAPI`](https://github.com/gestaltrun/CLIProxyAPI), a GitHub fork whose parent and source remain [`router-for-me/CLIProxyAPI`](https://github.com/router-for-me/CLIProxyAPI). The harness repository will record that core as a Git submodule pin. Application startup will not download, install, or enable the core, and Settings will not retain an Offer card.

The official manager UI will be imported into a first-party client package in this repository and then evolve as Gestalt source. It will use the existing Desktop Settings shell, slots, components, locale, and theme. It will not be a UI submodule, a runtime download, an iframe, or a remote management page. Prototype conclusions and the experience route will specify its final presentation separately; this proposal fixes ownership and trust boundaries rather than visual layout.

The replacement starts with an empty CLIProxyAPI home. It will not read, convert, import, or remain compatible with Sub2API accounts, credentials, statistics, quota history, Composite groups, routes, or data formats. Removing old user data is a separate destructive operation and is not implied by this proposal.

## Package and source topology

The CLIProxyAPI source pin will be a catalog child outside `pnpm-workspace.yaml` and TypeScript project references. CI jobs that build or inspect the core will initialize submodules recursively and verify that the gitlink resolves to an existing commit in `gestaltrun/CLIProxyAPI`. Jobs that do not need the core source may retain an uninitialized child.

Gestalt-owned TypeScript code will remain in the harness repository. It will contain the Desktop process supervisor, the narrow management gateway, the LLM adapter integration, the renderer projection, and the native Settings UI. The Go fork will contain upstream CLIProxyAPI plus the accepted GLM subscription implementation. No Host or renderer package will import Go source through workspace paths.

A fork update will use a reviewable branch and pull request in `gestaltrun/CLIProxyAPI`. The update will identify the upstream base, retain or deliberately revise the Gestalt GLM delta, and pass the fork's checks before the harness gitlink moves. Moving the harness pin will be a separate reviewed change with Desktop packaging and runtime evidence. Neither repository will float on upstream `main` or the latest release tag.

The existing proposal to catalog out-of-tree plugins remains useful for independently released Harness plugins, but its Sub2API-specific topology is superseded for this account pool by this proposal. The implemented [Sub2API Offer-card decision](../../implemented/architecture/2026-08-28-sub2api-offer-card-installer.md) continues to describe the shipped product until the replacement lands; implementation will then update or consolidate that record rather than rewriting it in advance.

## Runtime ownership and lifecycle

The Desktop Host will own one CLIProxyAPI process per isolated Desktop instance. A supervisor with a small lifecycle interface will hide binary selection, configuration generation, loopback addressing, process spawning, readiness, crash recovery, shutdown, and diagnostic identity. The renderer and the Web Host will not spawn or discover the process independently.

The process will bind only to loopback on a per-instance dynamic port. The exact allocation mechanism remains contingent on the core's verified command-line support: the supervisor may request port zero from the core or reserve a loopback port without publishing it before spawn. The selected mechanism must avoid a fixed product port and must fail explicitly if ownership cannot be established.

Desktop startup will admit the account pool only after the core reports readiness from the expected binary and configuration identity. A startup failure will leave the rest of Desktop available with an actionable account-pool failure state. Unexpected exit will enter bounded crash recovery under the same supervisor; repeated failure will stop respawning and preserve diagnostics without claiming that the provider is usable. Desktop shutdown will cancel recovery, terminate only the process tree owned by that instance, and wait for the port and process identities to disappear.

The Desktop Bundle will carry the binary for each supported packaging target. The initial required matrix is macOS arm64, macOS x64, and Windows x64; any additional target requires an explicit product decision and a matching build lane. Packaging will reject a missing binary, an architecture mismatch, or a binary whose recorded source identity does not match the submodule pin. First launch will require no Go toolchain, PostgreSQL, Redis, or core download.

## Management authority and renderer projection

The Desktop Host will create and retain separate CLIProxyAPI authorities for management and inference. The management secret will be available only to the Host management gateway. The inference API key will be available only to the local LLM integration that needs to call the OpenAI-compatible inference endpoint. Neither value will enter renderer props, browser storage, session logs, screenshots, diagnostics, or retained artifacts.

The management gateway will expose only product operations: read the redacted account roster, begin a supported login, observe its status, cancel its OAuth session, apply supported auth-file mutations, and request quota refresh where a verified provider probe exists. It will not expose CLIProxyAPI's generic management request facility to the renderer. Login URLs and device authorization data will be returned only in the minimum form required for the Desktop Host or UI to complete that provider's verified flow.

One Host-owned immutable snapshot will project component health, redacted account identities, login operations, quota observations, freshness, and actionable failures. External changes will be published only after their operation commits. Components will consume the snapshot through the client slot injection machinery and send intents through narrow callbacks; they will not poll CLIProxyAPI, mirror secrets, or become a second account authority.

The account cards will support the accepted interaction rule: a page-level control switches all cards between management and quota faces, while each card retains an individual flip action. A global switch will reset card-specific exceptions and establish one predictable face for the whole grid; subsequent individual flips create visible local exceptions until the next global switch. The prototype may vary placement, density, and motion but may not remove either operation.

## Provider registration

The integration will publish one stable DSH provider route for CLIProxyAPI rather than one route per account source or a replacement Composite concept. Kimi, Codex, Anthropic, Antigravity, xAI, and the proposed GLM subscription are account-pool sources behind that route. CLIProxyAPI remains responsible for choosing an eligible account for a model request.

The adapter will derive its model catalog from the local core's `/v1/models` response and will register, replace, or withdraw its single route atomically through `ctx.llm`. Provider-topology notifications will cause Models and Composer consumers to re-read the existing provider and model directories. An empty account pool, an unavailable core, or a catalog that cannot substantiate a usable model will not publish a falsely usable route. The final route id and collision policy must be fixed before implementation; the current recommendation is the stable id `cliproxyapi` without taking over an unrelated user-owned route.

Management and inference remain separate authorities even though they address the same local process. UI account mutations must not be required for ordinary inference after the adapter has captured a valid endpoint and key, and an inference consumer must not gain management operations by possessing its request configuration.

## Quota observations

CLIProxyAPI does not currently provide one uniform active quota endpoint. Some account types expose passive rate-limit headers, while provider-specific active checks may require the management API's request facility. The Host will normalize only verified observations and will retain their provenance and collection time.

A quota value will distinguish known, partial, probing, stale, unknown, unsupported, and failed states. Unknown or unsupported data will never render as zero, full, or a fabricated balance. A quota line may show remaining capacity only when a source supplies the required numerator and denominator. The overlaid time-window percentage may be calculated only when the source supplies enough information to establish the window duration and reset position; a reset timestamp without a duration will not produce a time percentage.

The provider probe matrix, refresh cadence, cache lifetime, rate limits, and side effects remain open pending the quota investigation. Those details must be recorded before the proposal freezes. The UI prototype may use labeled fixtures for every state but may not imply that a fixture field exists upstream.

## GLM subscription status

The GLM subscription addition belongs in the Gestalt CLIProxyAPI fork so routing and model execution remain inside the core. Its source revision, copied behavior, credentials, endpoints, model mapping, quota fields, and redistribution license are unresolved. No implementation, binary distribution, or acceptance claim may proceed until the dedicated investigation records those facts and confirms that the intended reuse is permitted.

GLM will remain an account source behind the single CLIProxyAPI provider unless verified protocol constraints require a separate route. A normal API-key integration will not be labeled as a subscription login, and the UI will not invent OAuth or refresh-token behavior.

## Alternatives considered

**Retain the downloadable Offer card and out-of-tree sidecar plugin.** Rejected because the user chose a built-in Desktop capability. The single Go core no longer justifies a separate enablement download, Web-profile surgery, or a plugin release train carrying PostgreSQL and Redis.

**Embed the official manager UI in an iframe or keep it as a UI submodule.** Rejected because the account-pool experience must use Gestalt components and evolve independently from core updates. An embedded manager would also put a broad management client in the renderer instead of preserving the Host authority.

**Vendor the CLIProxyAPI source directly into the harness repository.** Rejected because a submodule records an exact foreign-source commit while preserving the fork's review and upstream relationship. Copying the Go tree would obscure upstream synchronization and mix its build graph into the TypeScript workspace.

**Keep the core integration in another Gestalt sidecar repository.** Rejected for the present design because process lifecycle, management projection, provider registration, and native UI are one Desktop capability, while the external executable already has its own fork. A second Gestalt repository would add a protocol and release boundary without an independently evolving consumer.

**Register one DSH provider per account vendor or retain Composite.** Rejected because CLIProxyAPI exposes one inference gateway and one model catalog. Account sources are routing inputs inside the core, not independent adapter authorities in Harness.

**Expose the generic management API to the browser client.** Rejected because it would widen the renderer from a product UI into an administrator for arbitrary core operations and would make management credentials reachable from browser code.

**Synthesize a single quota percentage for every provider.** Rejected because the upstream evidence is heterogeneous. A uniform number would erase missing fields and misrepresent unknown capacity or time windows.

## Acceptance criteria

- A fresh recursive checkout resolves the harness gitlink to an existing commit in `gestaltrun/CLIProxyAPI`, whose GitHub parent and source are `router-for-me/CLIProxyAPI`; ordinary TypeScript workspace discovery does not include the Go child.
- Each supported Desktop package contains the binary built from the recorded pin, starts from a fresh isolated home without a Go toolchain, database service, or core download, and rejects missing, mismatched, or unidentifiable binaries.
- One Desktop instance owns one loopback CLIProxyAPI process and dynamic port; readiness, bounded crash recovery, shutdown, and cleanup are observable, and one instance never terminates another instance's process.
- The renderer receives no management secret, inference API key, auth-file secret, or raw management escape hatch; credential-like values remain absent from logs, session data, screenshots, and retained artifacts.
- The first-party Settings UI renders the accepted global management/quota switch and per-card flip behavior, the five verified login entries, truthful login states, and quota unknown/partial/stale/failure states without an iframe or runtime UI download.
- The LLM integration publishes one provider route from the live local model catalog, withdraws or marks it unusable when the core cannot serve models, does not take over a user-owned conflicting route, and can complete a separately authorized real model request.
- No replacement path reads or converts Sub2API data. Removal of old files, if later authorized, is verified as a distinct operation.
- Fork synchronization preserves an auditable upstream base and the accepted Gestalt delta; the harness pin moves only after fork, packaging, deterministic UI, and required native evidence pass.
- The frozen UI draft and experience route cover empty state, login cancellation/success/failure, global switching, individual flipping, quota freshness distinctions, provider catalog changes, core failure, and restart recovery.

## Risks

A built-in binary increases Desktop Bundle size and makes each supported platform part of the core build matrix. The packaging lanes must fail before publication when one target cannot be reproduced from the pin.

Upstream management endpoints and auth-file fields may change faster than the Gestalt UI. The narrow Host gateway limits the affected code, but every fork update still needs protocol and redaction review.

A fork-carried GLM implementation can make upstream synchronization conflict-prone and may be impossible to distribute under the intended terms. The unresolved license and protocol investigation is a freeze blocker, not an implementation detail.

Provider-specific quota probes may consume upstream requests, trigger rate limits, or expose only approximate data. Until the investigation fixes the matrix and cadence, the product must prefer an explicit unknown state over aggressive refresh.

Native prototype and final acceptance require a legal callable Codex computer-use session. The DSH registration has been observed, but delegated native calls are currently denied by the fixed sandbox and no callable Codex task connector is available. This blocks native fidelity and experience-route acceptance, not review of this proposal or fixture-based draft work.
