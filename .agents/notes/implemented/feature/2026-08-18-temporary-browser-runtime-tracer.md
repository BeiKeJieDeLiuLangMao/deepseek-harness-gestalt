# Agent Note: Temporary Browser Runtime tracer

Status: implemented

English | [中文](2026-08-18-temporary-browser-runtime-tracer.zh.md)

## Problem

Browser control needs a provider-neutral seam before persistent profiles, multi-tab orchestration, Electron integration, or Browser Dock UI can evolve independently. The first vertical slice must prove identity, operation ordering, deferred discovery, durable model-visible facts, generic presentation, and lifecycle teardown without requiring a browser installation, login, or API key.

## Decision

`dsh-browser-runtime` defines `ctx.browserRuntime` with Service Definition methods for create, navigate, observe, screenshot, focus, and close. Browser Profile, Browser Workspace, browser instance, and tab identities use distinct `Branded<B>` types and travel together as one `BrowserTarget`. Open and closed states carry a monotonic revision. Mutations require `expectedRevision`; Providers serialize operations and reject stale callers instead of accepting last-writer-wins changes from concurrent Agent and human actors.

`dsh-browser-runtime-deterministic` is the first Provider. It admits temporary and named persistent Profiles, each with one tab. Close discards a temporary identity and retains a named persist map until Provider disposal. Each Provider generation has an independent owner token for its authoritative state reader and synchronous invariant validator. The invariant seeds from current state on initial load and hot reload, then validates per-target identities, exact revision succession, and terminal closure before assignment; rejection leaves the previous state authoritative. The Provider recognizes only configured pages, returns deterministic observations and PNG data, and publishes each committed state through contained post-commit fan-out for ordinary observers. Disposal stops admission, drains the operation queue, closes every open Profile, and drops persist memory. Configuration owns identity prefixes, fixture pages, and screenshot data; screenshots must be non-empty canonical base64 with the PNG signature, and invalid or ambiguous configuration fails at load.

`dsh-tool-browser` is the model-facing Consumer. Its six ordinary tool definitions use `deferLoading: true`. `tool_search` returns their exact schemas through the existing deferred discovery path and does not activate them; current eligibility continues to govern discovery and execution. Each result renders every model-visible identity, revision, page, screenshot, focus, and close fact into the ordinary durable `tool/result`. Request headers already record the assembled tool schemas, so the Session log reconstructs both discovered schemas and Browser facts without a new Session event. The Consumer supplies no presentation methods, leaving Host clients on the generic tool-card path.

The keyless headless example mounts the shipped base and headless profile, deterministic Provider, Consumer, and replay adapter. It performs discovery and the complete tracer, disposes the Loader tree, then reloads the same Session and verifies deferred-schema reconstruction. The shared fixture runner waits for asynchronous configured-Agent restoration by observing `agent/created` and `agent-loop/config-start-failed`, which prevents a fast Provider from racing the restart driver.

## Alternatives considered

**Treat tool search as activation.** Rejected because discovery is model-visible evidence, while eligibility is the existing authorization and dispatch authority. An activation set would introduce redundant mutable state.

**Persist Browser Runtime state with new Session events.** Rejected for this tracer because every fact that reaches the model already resides in durable tool results and request headers. A future product projection may justify its own state events when it has readers beyond the model transcript.

**Add Browser-specific conversation cards.** Rejected because the product decision is to present Browser tools like ordinary MCP tools. A dedicated card would create UI behavior before Browser Dock work owns that experience.

**Start with native Electron automation.** Rejected because it would combine the capability interface, operating-system backend, persistence policy, and UI projection in one change, preventing keyless replay and obscuring the smallest useful seam.

## Consequences

The repository has a complete Browser Runtime capability seam whose interface, deterministic Provider, and model Consumer can evolve independently. Session replay can reconstruct what the model learned, concurrent mutations have an explicit conflict result, terminal identity cannot resurrect, and post-commit observer failures cannot change an operation's result. The deterministic Provider is a keyless store rather than a production browser. Named persistent Browser Profiles reuse isolated partitions through this seam; several Workspaces and tabs, native Electron control, Browser Dock UI, catalog policy, and migration/release work remain separate features. See the [persistent Browser Profile Agent Note](2026-08-19-persistent-browser-profiles.md).
