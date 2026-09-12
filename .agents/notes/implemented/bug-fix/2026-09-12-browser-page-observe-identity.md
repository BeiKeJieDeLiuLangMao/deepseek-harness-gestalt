# Agent Note: Browser page observe and screenshot ignore callback identity

Status: implemented

English | [中文](2026-09-12-browser-page-observe-identity.zh.md)

## Problem

Official Browser chrome in the Sidebar tab observed the URL but never painted the deterministic PNG. `useBrowserPage` listed `observe`, `screenshot`, `onMissingTarget`, and the `target` object in its effect dependencies. Official workbench bodies rebuild those functions and pass a new target object on each render, so the effect cancelled the in-flight screenshot after observe settled.

## Decision

`useBrowserPage` stores observe, screenshot, missing-target recovery, and the current target in refs. The effect re-runs only when the tab key or listed revision changes. A new function identity or a new target object with the same tab key leaves an in-flight capture running. Official workbench chrome still memoizes recovery and retry; that is not required for capture to complete.

## Alternatives considered

**Keep the remotes in the effect dependency list and require every caller to memoize them.** Rejected: official tab bodies reconstruct bound remotes from `useTabInfo()` on each render; memoizing every caller still leaves a new `target` object.

**Paint page text instead of waiting for the screenshot.** Rejected: the Dock goldens pin the PNG alt text, and Host `screenshot` already returns it.

## Consequences

Observe and screenshot for one tab run once per tab key and listed revision. Tests that previously relied on a new `observe` identity to retrigger a load must change `listedRevision` or the tab key instead.
