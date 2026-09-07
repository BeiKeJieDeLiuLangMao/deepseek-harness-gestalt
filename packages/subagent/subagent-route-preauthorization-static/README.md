---
description: "Static Provider that contributes deployment-owned exact child LLM routes."
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent-route-preauthorization-static

English | [中文](README.zh.md)

## Summary

This package is the Static Provider for `ctx.subagentRoutePreauthorization`. Its required `allowedModels` array is deployment configuration, independent of user Settings.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this default-export Service Provider with non-empty provider and model ids. Direct programmatic construction and Loader configuration both reject malformed entries. The Provider copies, deduplicates, and sorts its routes before publishing the immutable service snapshot.

Disposing this Provider removes the service. A Consumer already composed against an absent snapshot keeps its recorded empty policy; a later Provider cannot authorize that Session. Reinstalling publishes one fresh snapshot for subsequently composed Sessions.

<a id="model-experience"></a>
## Model Experience

Indirectly, through the Consumer that snapshots the contributed routes into a fresh top-level Session.

#### KV Cache effect

The Provider adds no tokens directly. A recorded Session policy keeps the Consumer's route-selection schema stable after Provider replacement.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- **Static lifetime configuration** — changing routes requires replacing the Provider fiber; existing Session policies remain unchanged.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
