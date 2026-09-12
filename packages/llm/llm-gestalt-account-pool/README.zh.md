# @deepseek-ai/dsh-llm-gestalt-account-pool

[English](README.md) | 中文

Desktop 仅为其拥有的 CLIProxyAPI 进程组合此插件。Host 通过子进程环境提供 IPv4-loopback HTTPS `/v1` 端点、仅用于 inference 的 key，以及作为 `NODE_EXTRA_CA_CERTS` 的运行代证书；这些值既不存入 settings，也不暴露给 renderer 代码。

插件以 Grok Shell 身份认证访问 `/v1/models`，以便 listing 保留当前已加载账号的名称、context window 与 think level 范围。Desktop 存在 settings 与 credentials 时，写入模型页 `llm-pi-ai` provider `gestalt-account-pool`，带上这些字段。Host 注入的 inference key 已占用进程环境中的 `DSH_GESTALT_ACCOUNT_POOL_API_KEY`，插件不会再写入 credentials 文件；凭据写入失败也不会跳过目录同步。没有这些 seam 时，仅在目录至少包含一个模型时于 `ctx.llm` 发布同一 route。Registry 冲突会在注册时失败，而不会替换用户 provider。

## Model Experience

### 账号池请求

#### What the model sees

所选模型通过 provider `gestalt-account-pool` 接收普通 Harness system prompt、message history、tool schema、stop sequence 与 call configuration。本地端点与 inference key 属于传输事实，绝不进入模型输入。

#### Token effect

精确用量由 provider tokenizer 决定。此插件不添加 prompt token。

#### KV Cache effect

插件不修改组装后的前缀。模型选择或普通 prompt、schema、history 与 call configuration 的变化都可能影响 provider cache 复用。

## Known Limitations and Deferred Work

- 账号登录、renderer 投影与额度观测属于 Desktop Host 账号池表面。
- think level 范围来自核心 listing（`supported_reasoning_levels` 或 `reasoning_efforts`）；未知 effort 名会被省略。
