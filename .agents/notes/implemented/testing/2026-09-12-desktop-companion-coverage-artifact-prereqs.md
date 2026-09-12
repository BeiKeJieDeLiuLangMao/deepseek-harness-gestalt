# Agent Note: Desktop and Companion coverage artifact prerequisites

Status: implemented

English | [中文](2026-09-12-desktop-companion-coverage-artifact-prereqs.zh.md)

## Problem

In pull request #659 coverage runs, tests in `apps/desktop` failed on a clean source tree when attempting to run under the coverage gate:
1. Assembled Companion Host tests (`apps/desktop/tests/companion-host-*.assembled.spec.ts`) failed during `dsh web` startup with:
   `Error: dsh: plugin tree failed to load: failed to apply loader entry typert-loader: 3 typert contributor(s) failed to register:`
   The 3 packages `@deepseek-ai/dsh-api-workspace-files`, `@deepseek-ai/dsh-client-file-upload`, and `@deepseek-ai/dsh-command-feedback` export `./typert` pointing to `lib/typert.host.js`, but were missing from `TYPERT_PACKAGES` in `apps/desktop/tests/shipped-web-host.ts`.
2. `apps/desktop/tests/packaged-main-bundle.spec.ts` failed because `build-main.mjs` could not resolve `@deepseek-ai/dsh-client-ui-desktop/protocol`. Root `tsconfig.base.json` mapped only the package root to `src` without an explicit subpath alias for `./protocol`.
3. `apps/desktop/tests/host-rpc-assembled.spec.ts` statically imported `companion-product.ts`, which statically imports `@deepseek-ai/dsh-api-workspace-controller/remote` and `@deepseek-ai/dsh-api-session-controller/remote` before `beforeAll` runs `generateDesktopHostTypertArtifacts()`.

## Decision

1. In `apps/desktop/tests/shipped-web-host.ts`, add `@deepseek-ai/dsh-api-workspace-files`, `@deepseek-ai/dsh-client-file-upload`, and `@deepseek-ai/dsh-command-feedback` to `TYPERT_PACKAGES`.
2. In `tsconfig.base.json`, add the explicit subpath alias:
   `"@deepseek-ai/dsh-client-ui-desktop/protocol": ["./packages/client/ui-desktop/src/protocol.ts"]`
3. In `apps/desktop/tests/host-rpc-assembled.spec.ts`, defer loading `companion-product.ts` until `beforeAll` after `generateDesktopHostTypertArtifacts()`, matching the dynamic import pattern established in `companion-host-business-error.assembled.spec.ts`.

## Alternatives considered

- **Full repository build before coverage**: Running `pnpm run build` before the coverage gate would mask source-plane vs artifact-plane boundaries and violate the invariant that tests resolve workspace imports through source paths on a clean checkout.

## Consequences

- On clean checkouts without prebuilt `lib/` artifacts, `packaged-main-bundle.spec.ts` resolves `@deepseek-ai/dsh-client-ui-desktop/protocol` to source.
- `dsh web` started by `apps/desktop/tests/shipped-web-host.ts` no longer crashes on missing typert contributor exports for the 3 packages.
- `host-rpc-assembled.spec.ts` generates host artifacts before importing `companion-product.ts`.
- Other non-artifact failures in full coverage partitions (such as missing optional platform packages in third-party notice tests) remain separate and unaddressed.
