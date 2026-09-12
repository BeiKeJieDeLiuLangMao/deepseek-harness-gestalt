# Agent Note: Operated Platform launcher classification

Status: implemented

English | [中文](2026-09-08-operated-platform-launcher-classification.zh.md)

## Problem

Profile applications need one lifecycle and customization owner. The operated Platform backend instead owns production identity validation and transactional acquisition of shared PostgreSQL and Redis resources. Treating its accepted infrastructure executable as an unclassified profile application leaves the launcher check inconsistent with the deployed composition.

## Decision

The [single dsh application launcher](2026-08-22-single-dsh-application-launcher.md) owns Agent, SDK, ACP, and Web profile applications. The operated backend keeps the exact `apps/platform/package.json` bin mapping `dsh-platform` to `./dist/boot.mjs`. Its entry-owned composition, production identity validation, resource acquisition, and teardown remain governed by [operated Companion identity](2026-08-22-operated-companion-platform-identity.md). This classification grants no other package an application bin.

[Application entrypoint verification](../../../../scripts/verify-application-entrypoints.ts) also classifies the existing Desktop build, release, and test executables by exact source path and role. New files and altered Platform bin names, targets, or additional entries fail the check. Root application demos still select the dsh CLI.

This partially supersedes the single-launcher note's Node-wide scope. That note retains profile composition, SDK customization, packaging, and shutdown rationale; the operated-identity note retains the independent production trust and resource obligations. Both remain active.

## Alternatives considered

**Delete the operated Platform executable or force it through an Agent profile.** Rejected because its accepted production infrastructure composition owns shared stores and identity independently of user Agent customization. Launcher classification does not authorize changing that ownership.

**Allow every application bin or every Desktop executable.** Rejected because directory-wide exemptions admit new launchers without an explicit role or ownership decision.

## Consequences

The check accepts the maintained backend and tooling inventory while rejecting new unclassified launch paths. Focused fixtures pin the exact Platform mapping, rejection of new Desktop scripts, and continued rejection of package-launching demos. Production boot, launch, and Docker sources retain their existing behavior and product-entry verification; classification alone is not deployment evidence.
