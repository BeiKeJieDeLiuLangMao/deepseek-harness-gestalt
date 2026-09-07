# Prebuilt hidden phone acceptance

English | [中文](README.zh.md)

The test-only [runner](../../scripts/run-hidden-phone-acceptance.mjs) starts only with a root-reviewed complete input graph, a clean matching published SHA, and an ownership inventory younger than 60 seconds at the launcher spawn. Missing build artifacts, incomplete component files, changed hashes or realpaths, credential fallback files, and stale or malformed inventory refuse the launch before WDIO starts.

## Runnable checks

```sh
export PATH=/Users/yishu.cy/.nvm/versions/node/v24.16.0/bin:/usr/bin:/bin
node --test --test-concurrency=1 apps/desktop/tests/e2e-electron/hidden-acceptance-*.test.mjs
```

These Node tests exercise only synthetic fixtures and runner policy. They do not start Electron or prove the Desktop route.

## Completion and recovery

The launcher owner records the directly created WDIO child before readiness and observes its `exit` independently of inherited pipe `close`. A zero exit passes only after the verifier finds one ready Host, that exact Host's `requestedStop=stop` exit, exactly one `shutdown complete` receipt, zero model requests, unchanged input hashes, and closed Host, fake, and CDP listeners. The runner then removes its exact private scratch; evidence remains under `.artifacts`.

Timeout and interruption recovery may send TERM only to the captured WDIO child. Recovery, a nonzero or signaled exit, missing shutdown evidence, changed inputs, or surviving listeners fails and retains scratch. PID discovery, command substrings, parent lineage, process-group membership, ports, and fixture observer endpoints never grant signal authority.

## Reviewed input graph

The manifest names canonical approved roots and every consumed file with its resolved path and SHA-256. Each Host, Client, Web, Desktop, Electron, WDIO, and Node component names a non-empty file list and an entry; its identity is the digest of that list rather than an unchecked label. Host, Client, and Web entries bind the consumed `apps/cli/src/bin.ts`, `packages/client/web/lib/index.js`, and `apps/web/dist/index.html` files. The graph must include the actual Node, WDIO and Electron executables, Desktop main/config/helper outputs, source Host launcher inputs, acceptance wrapper/owner/config/helpers/spec, and the complete build-owner Host/Client/Web closure. The operated Platform source and emitted config must contain equal JSON values. The runner rechecks the graph immediately before spawn and after graceful exit.

The child environment is an explicit keyless allowlist with a fresh empty `HOME`, `DSH_HOME`, and `TMPDIR`, pinned fake mobilecli, tool-denying PATH prefix, and rejecting loopback model provider. No user settings or credentials are copied. Checkout and scratch `.env` or `.credentials.yaml` fallbacks are rejected by path metadata without reading them.

## Scope

The route opens a real built Desktop Session Surface, chooses the fixture-classified iPhone, waits for actual nonuniform H264 canvas pixels, observes decoded MJPEG fallback, refreshes into a new waiting owner, repaints, and requests `app.quit()`. Production phone runtime owns and joins the fake mobilecli child; [hidden-phone-fake-owner.mjs](../../scripts/hidden-phone-fake-owner.mjs) remains a separate direct-child fixture test and is not wired into this route.

This lane proves the built Desktop user path over deterministic fixture device bytes. It does not prove physical-device behavior, stale decoder rejection, failed MJPEG, model `device_act`, native Host-SIGKILL containment, or same-user filesystem/network confinement. No complete build-owner manifest is stored in this source tree; the launch remains refused until root supplies and reviews one for the exact final revision.
