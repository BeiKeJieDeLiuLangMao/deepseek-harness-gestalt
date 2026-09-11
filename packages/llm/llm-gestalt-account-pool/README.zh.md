# @deepseek-ai/dsh-llm-gestalt-account-pool

[English](README.md) | 中文

## Summary

Desktop 仅为其拥有的 CLIProxyAPI 进程组合此插件。Host 提供 loopback HTTPS `/v1` 端点、仅用于 inference 的 key，以及作为 `NODE_EXTRA_CA_CERTS` 的运行代证书；这些值既不存入 settings，也不暴露给 renderer 代码。目录至少有一个模型时发布 `gestalt-account-pool`，核心不可用时撤回 route。

## Composition

插件认证访问 `/v1/models`，目录变化后重新发布拓扑，并在核心不可用时撤回 route。Registry 冲突会在注册时失败，而不会替换用户 provider。不发布运行时 invariant 伴生体，因为本适配器没有独立于 `dsh-llm` 已断言注册表契约之外的事件流或可变数据。

## Model Experience

### 账号池请求

#### What the model sees

所选模型通过 provider `gestalt-account-pool` 接收普通 Harness system prompt、message history、tool schema、stop sequence 与 call configuration。本地端点与 inference key 属于传输事实，绝不进入模型输入。

#### Token effect

精确用量由 provider tokenizer 决定。此插件不添加 prompt token。

#### KV Cache effect

插件不修改组装后的前缀。模型选择或普通 prompt、schema、history 与 call configuration 的变化都可能影响 provider cache 复用。

## Known Limitations and Deferred Work

- 账号登录、renderer 投影、额度观测与 provider 专用模型元数据属于后续账号池 slice。
- 在核心提供经验证的能力元数据前，目录项按支持文本的模型 id 处理。
