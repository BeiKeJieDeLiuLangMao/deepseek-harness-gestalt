# Agent Note: Isolate the built-in CLIProxyAPI runtime and provider authority

Status: proposed

English | [中文](2026-09-09-built-in-cliproxyapi-runtime-slice.zh.md)

## Problem

Desktop needs a package-owned CLIProxyAPI process without reading or controlling an existing CLIProxyAPI installation. The process must start from a verifiable bundled executable, keep management and inference authority out of renderer code, publish only models the local core actually advertises, and reach quiescence during shutdown.

## Proposal

Desktop packages a native CLIProxyAPI executable built from the `catalog/cliproxyapi` gitlink. A generated manifest records the source SHA, Node platform and architecture, relative executable name, and SHA-256. Packaged startup rejects a missing, mismatched, or modified resource and never downloads a replacement or searches `PATH`. Development starts the component only when an explicit fixture executable is provided.

Each Desktop instance generates one private runtime generation below its own `userData` and starts the core with that generation as its cwd, so automatic dotenv loading cannot reach a repository or user workspace `.env`. The child receives an explicit operating-system environment allowlist rather than ambient storage, provider, or credential configuration. The generation contains its config, auth directory, logs, management key, and inference key. The config binds IPv4 loopback on a Host-selected ephemeral port, disables the management control panel, and carries no reference to Sub2API or the user's CLIProxyAPI home.

The supervisor first verifies through the operating system's listener table that the spawned child PID owns the selected port, then proves application readiness through the authenticated `/v1/models` endpoint before it exports an inference capability. It never sends the inference key to a listener that is not owned by that child. Management and inference keys remain separate. Only the inference endpoint and key enter the Web Host child environment; renderer protocol, settings, diagnostics, and model metadata receive neither value.

The Web Host plugin owns the stable route `gestalt-account-pool`. It registers no route for an empty or unavailable catalog, atomically publishes or withdraws the route when the live model list changes, and lets the LLM registry reject collisions. Disposal stops catalog refresh and removes the registration.

The Host reserves an ephemeral loopback port before spawn because the pinned core accepts `port: 0` at `net.Listen` but retains zero in its configuration, preventing management code from reconstructing its own URL. Closing the reservation before spawn leaves a bounded allocation race; a competing listener causes startup to fail without terminating or reusing that process.

## Alternatives considered

**Use a fixed product port.** Rejected because concurrent isolated Desktop instances and unrelated services would conflict, and the product must not stop the existing listener.

**Use `port: 0` directly.** Rejected for this pin because the listener receives a dynamic port while the core configuration still records zero, so management callback URLs cannot establish the listening address.

**Reuse the user `cliproxyapi` provider id.** Rejected because the built-in product authority must not replace a user-configured route. The dedicated id also lets registry collision checks fail loud.

## Acceptance criteria

- The packaged executable matches the manifest source SHA, platform, architecture, path, and SHA-256; development requires an explicit fixture path.
- Config, auth files, logs, management key, and inference key remain below the Desktop instance's private state root; the child cwd and allowlisted environment prevent external `.env`, storage configuration, CLIProxyAPI, or Sub2API state from entering startup.
- OS listener ownership by the spawned child PID and authenticated readiness both precede capability publication; shutdown cancels recovery, joins the exact process group, removes generated state, and leaves unrelated listeners untouched.
- `gestalt-account-pool` appears only for a non-empty live model catalog, updates through the LLM notification mechanism, withdraws on failure or empty results, rejects collisions, and disappears on disposal.
- Native macOS arm64 builds from the pinned submodule and runs keylessly through the real supervisor; native macOS x64 and Windows x64 release runners build their own target binaries before packaging.

## Risks

Reserving and releasing a dynamic port before spawn cannot make allocation atomic across unrelated processes. A collision is handled as an explicit startup failure rather than by taking over the listener.

The current model endpoint supplies identifiers but not complete capability metadata. The provider exposes conservative text catalog entries until a verified core response supplies richer facts.

This slice does not expose account login, OAuth callbacks, quota observations, or renderer controls. Those consumers require separate Host operations and acceptance evidence.
