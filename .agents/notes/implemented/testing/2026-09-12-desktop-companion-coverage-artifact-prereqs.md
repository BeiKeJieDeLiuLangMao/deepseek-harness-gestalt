# Desktop and Companion coverage artifact prerequisites

English | [中文](2026-09-12-desktop-companion-coverage-artifact-prereqs.zh.md)

Date: 2026-09-12
Status: implemented
Area: testing

## Context

In PR #659 coverage runs, tests in `apps/desktop` failed on a clean source tree when attempting to run under the coverage gate:
1. Assembled Companion Host tests (`apps/desktop/tests/companion-host-*.assembled.spec.ts`) failed during `dsh web` startup with:
   `Error: dsh: plugin tree failed to load: failed to apply loader entry typert-loader: 3 typert contributor(s) failed to register`
   The 3 packages `@deepseek-ai/dsh-api-workspace-files`, `@deepseek-ai/dsh-client-file-upload`, and `@deepseek-ai/dsh-command-feedback` export `./typert` pointing to `lib/typert.host.js`, but were missing from the fixture helper's `TYPERT_PACKAGES` list that generates host typert artifacts before starting the test web host.
2. `apps/desktop/tests/packaged-main-bundle.spec.ts` failed because `build-main.mjs` could not resolve `@deepseek-ai/dsh-client-ui-desktop/protocol`. The package exports `./protocol: "./lib/protocol.js"`, but root `tsconfig.base.json` paths mapping had only `"@deepseek-ai/dsh-client-ui-desktop": ["./packages/client/ui-desktop/src"]` without an explicit subpath alias for `./protocol`. Without built `lib/` artifacts, esbuild failed to resolve the subpath import.

## Decision

1. In `apps/desktop/tests/shipped-web-host.ts`, add `@deepseek-ai/dsh-api-workspace-files`, `@deepseek-ai/dsh-client-file-upload`, and `@deepseek-ai/dsh-command-feedback` to `TYPERT_PACKAGES`. When `generateDesktopHostTypertArtifacts()` runs during `beforeAll`, it generates their `typert.host.js` and `typert.remote-client.js` artifacts into their respective `lib/` directories on a clean tree.
2. In `tsconfig.base.json`, add the explicit subpath alias:
   `"@deepseek-ai/dsh-client-ui-desktop/protocol": ["./packages/client/ui-desktop/src/protocol.ts"]`
   so esbuild and TypeScript source tools resolve `./protocol` directly to source without requiring prebuilt `lib/` artifacts.

## Consequences

- On clean unbuilt checkouts, `apps/desktop/tests/packaged-main-bundle.spec.ts` builds `main.mjs` cleanly without missing package exports.
- `dsh web` started by `apps/desktop/tests/shipped-web-host.ts` no longer crashes on missing typert contributor exports for the file upload, workspace files, and command feedback packages.
- No global build step was injected before coverage; source plane resolution is preserved.
