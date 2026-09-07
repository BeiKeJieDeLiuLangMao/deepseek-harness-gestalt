# Agent Note: Merged workspace compiler-face completeness

Status: implemented

English | [中文](2026-09-04-merged-workspace-compiler-faces.zh.md)

## Problem

A mechanical upstream merge can retain valid package manifests while omitting their lockfile importers or root TypeScript Project References. The resulting installation may preserve stale links, and direct aggregate programs then report missing-source diagnostics that obscure the API migration errors owned by later tickets.

## Decision

The lockfile is generated from the complete pnpm workspace and contains every one of the 306 workspace projects discovered by pnpm. Clean installations select only host-executable binary payloads; cross-platform packaging remains responsible for overriding `supportedArchitectures` in an isolated tree.

Every retained Gestalt Host or Client project has an explicit root aggregate reference. Repository-owned discovery patterns classify retained downstream compiler projects independently from `GESTALT_COMPILER_FACES`; workspace constraints reject a project missing from either the explicit inventory or its matching aggregate. Split projects still require the matching leaf config; the Better Sidebar Client project therefore references `client/connection/tsconfig.client.json` rather than its solution root. The same executed constraint discovers every existing top-level Web test with a static direct `./scaffold.ts` import through the TypeScript AST, requires its exact path in both the Web project exclusion and root Host include, rejects stale exact Web test file entries in either list, and fails when discovery yields no consumers.

Client-only Cordis `Context` augmentations are reachable only from public Client entries. A shared snapshot type uses its package-specific name instead of exporting another `Context`, so Typert can index Host and Client compiler faces independently without resolving Host service signatures to a Client structural mirror. The Cordis catalog partition still scans every augmentation and requires each Host-rendered or explicitly Client-only service to have one owner.

Retained release-package manifests use the merged repository version and preserve package-specific publication files. Desktop, Mobile, and Platform applications remain private product assemblies rather than npm release-family members.

## Alternatives considered

**Use aggregate-wide source includes.** This would bypass package compiler ownership, mix unrelated source roots, and hide missing Project References instead of repairing them.

**Infer every compiler face from directory names or manifest exports.** Runtime entry points do not determine TypeScript environment: retained Platform client packages live outside `packages/client`, while some packages expose browser subpaths without belonging to the Client aggregate. The explicit downstream inventory keeps exceptional membership reviewable.

**Download every platform binary in a normal checkout.** This increases installation size and makes clean setup depend on binaries that cannot execute on the current host. Packaging lanes already own cross-platform materialization.

## Consequences

A frozen clean install relinks Zod and all workspace dependencies from the generated lockfile. Direct Host and Client aggregate programs report no `TS6307` missing-source diagnostic caused by absent compiler faces; their remaining failures belong to later API and migration work.

The explicit Gestalt compiler-face inventory and independent discovery classification are maintenance obligations. Adding or removing a retained downstream project updates its discovery pattern, aggregate, and inventory together; the focused regression test removes a project from both declared lists and still observes the omission. A Web test that statically imports the Host scaffold is discovered rather than manually sampled, so adding, removing, or renaming that test must keep the Web exclusion and Host include synchronized.

Host catalogs omit Client-only services while Client Typert discovery still resolves their declarations. A Client augmentation that becomes Host-reachable, or a snapshot mirror exported under the generic `Context` name, fails the face-specific catalog regressions instead of being hidden by a runtime exclusion.
