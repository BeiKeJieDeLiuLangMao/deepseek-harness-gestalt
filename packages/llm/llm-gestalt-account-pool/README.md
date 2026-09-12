---
description: "Desktop-owned CLIProxyAPI provider that publishes gestalt-account-pool from a Host-injected loopback /v1 endpoint."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-gestalt-account-pool

English | [中文](README.zh.md)

## Summary

Desktop composes this plugin only for the CLIProxyAPI process it owns. The Host supplies a loopback HTTPS `/v1` endpoint, an inference-only key, and the generation certificate as `NODE_EXTRA_CA_CERTS`; none of those values are stored in settings or exposed to renderer code. It publishes `gestalt-account-pool` while the catalog has at least one model, and withdraws the route when the core is unavailable.

## Table of Contents

- [Composition](#composition)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="composition"></a>
## Composition

The plugin authenticates `/v1/models`, republishes topology after catalog changes, and withdraws the route when the core becomes unavailable. Registry collisions fail during registration rather than replacing a user provider. No runtime invariant companion is published because this adapter owns no independent event stream or mutable data beyond LLM registry contracts already asserted by `dsh-llm`.

<a id="model-experience"></a>
## Model Experience

### Account-pool request

#### What the model sees

The selected model receives the ordinary harness system prompt, message history, tool schemas, stop sequences, and call configuration under provider `gestalt-account-pool`. The local endpoint and inference key are transport facts and never enter model input.

#### Token effect

The provider's tokenizer determines exact usage. This plugin adds no prompt tokens.

#### KV Cache effect

The plugin does not alter the assembled prefix. Model selection or any ordinary prompt, schema, history, or call-configuration change can affect provider cache reuse.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Account login, renderer projection, quota observation, and provider-specific model metadata belong to later account-pool slices.
- Catalog entries are treated as text-capable ids until the core supplies verified capability metadata.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
