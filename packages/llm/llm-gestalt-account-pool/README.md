# @deepseek-ai/dsh-llm-gestalt-account-pool

English | [中文](README.zh.md)

Desktop composes this plugin only for the CLIProxyAPI process it owns. The Host supplies an IPv4-loopback HTTPS `/v1` endpoint, an inference-only key, and the generation certificate as `NODE_EXTRA_CA_CERTS`; none of those values are stored in settings or exposed to renderer code.

The plugin authenticates `/v1/models` as Grok Shell so the listing keeps names, context windows, and think-level ranges for every account currently loaded in the owned core. When Desktop settings and credentials are present, it writes the Models-page `llm-pi-ai` provider `gestalt-account-pool` with those fields. A Host-injected inference key already occupies `DSH_GESTALT_ACCOUNT_POOL_API_KEY` in the process environment, so the plugin does not rewrite it into the credentials file; a failed credential write does not skip the catalog. Without those seams it publishes the same route on `ctx.llm` only while the catalog contains at least one model. Registry collisions fail during registration rather than replacing a user provider.

## Model Experience

### Account-pool request

#### What the model sees

The selected model receives the ordinary harness system prompt, message history, tool schemas, stop sequences, and call configuration under provider `gestalt-account-pool`. The local endpoint and inference key are transport facts and never enter model input.

#### Token effect

The provider's tokenizer determines exact usage. This plugin adds no prompt tokens.

#### KV Cache effect

The plugin does not alter the assembled prefix. Model selection or any ordinary prompt, schema, history, or call-configuration change can affect provider cache reuse.

## Known Limitations and Deferred Work

- Account login, renderer projection, and quota observation belong to the Desktop Host account-pool surface.
- Think-level ranges come from the core listing (`supported_reasoning_levels` or `reasoning_efforts`); unknown effort names are omitted.
