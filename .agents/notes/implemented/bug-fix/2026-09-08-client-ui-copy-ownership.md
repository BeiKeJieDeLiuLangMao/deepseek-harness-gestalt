# Agent Note: Client UI copy ownership enforcement

Status: implemented

English | [中文](2026-09-08-client-ui-copy-ownership.zh.md)

## Problem

Client view source contained visible English literals for annotation pins, pairing payloads, member roles, runtime errors, and control titles. The source gate also treated full HTML documents and stable brand, protocol, and diagnostic literals as ordinary UI copy, which made a correct fix indistinguishable from suppressing the file.

## Decision

Visible copy lives in each feature's typed English and Chinese locale dictionaries. Image annotation pins receive a translated label callback, pairing payloads use Desktop locale copy, Workspace role options use Workspace locale keys, and Better Sidebar owns its render, missing-chunk, and save-title text. Conversation presentation consumes its existing locale owner instead of duplicating common keys. The unused UI Renderer document-title implementation is removed; UI Layout remains the browser-title owner.

The source gate accepts the standard `translate="no"` attribute for invariant HTML subtrees and `data-ui-i18n="brand"` for SVG brand text whose React type has no `translate` attribute. Variable declarations may use `@uiI18n brand`, `@uiI18n protocol`, or `@uiI18n diagnostic` when the literal belongs to that named category. Complete HTML document literals are scanned for visible body text and static `alt`, ARIA, placeholder, and title attributes while structural markup remains valid. These rules do not exempt files.

## Verification

The source-gate unit tests cover accepted and rejected category tags, invariant JSX with adjacent visible copy, structural HTML, and HTML body and accessible copy. Focused locale tests switch Better Sidebar between English and Chinese and assert the new runtime errors and shared save title. Component tests assert the translated image-pin label and the existing pairing payload label through their rendered accessible names.

## Alternatives considered

**Rename variables or exempt files.** This would hide visible literals without assigning them to a locale owner and would let later copy bypass the gate.

**Ignore every complete HTML literal.** This would avoid structural false positives but miss static text and accessibility labels embedded in generated documents.

**Translate stable brands and durable protocol values.** Translation would change identities or persisted matching values rather than user-facing language.

## Consequences

Client copy has one typed locale owner and changes with the active locale. Authors must classify the small set of invariant literals explicitly, and the gate keeps checking visible JSX and HTML text around those invariants.
