---
description: "Service Definition and registry for deployment-owned exact child LLM route authorization."
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent-route-preauthorization

English | [中文](README.zh.md)

## Summary

This package declares the abstract `ctx.subagentRoutePreauthorization` Service Definition for one deployment-owned exact child LLM route snapshot. Consumers sample it only while composing a fresh top-level Session; the service does not read or write user Settings.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount one Provider such as [`dsh-subagent-route-preauthorization-static`](../subagent-route-preauthorization-static/README.md). The Provider owns service lifetime. A Consumer samples `snapshot()` once from the Agent or preset scope while composing a fresh top-level Session; it does not inject the Provider or resample after detach or replacement.

`snapshot()` returns detached immutable `{ provider, model }` records. A Consumer unions this deployment snapshot with any enabled user authorization, sorts and deduplicates the result, and records it durably before exposing route selection. Resumed and child Sessions read only that recorded policy.

<a id="model-experience"></a>
## Model Experience

Indirectly, through a Consumer that records the snapshot as a Session route-selection policy.

#### KV Cache effect

The service itself adds no model tokens. A Consumer may expose stable route-selection schemas from the durable Session policy.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- **One Provider per service scope** — combine deployment routes inside the Provider configuration; user authorization remains a separate Consumer-owned union input.

No runtime invariant companion is published because this Service Definition owns only an immutable deployment snapshot and no independently observable event or mutable-data relationship.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
