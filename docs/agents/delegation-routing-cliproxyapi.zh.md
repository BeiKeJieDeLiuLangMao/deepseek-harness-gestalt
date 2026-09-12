# 可选 CLIProxyAPI 委派 profile

[English](delegation-routing-cliproxyapi.md) | 中文

provider 无关派发与 owner 复用使用[委派路由与上下文复用](delegation-routing.zh.md)。当前交付角色优先链、排除项、pool 处理和模型切换规则使用交付 skill 的 [CLIProxyAPI 模型路由权威](../../.agents/skills/orchestrate-dsh-delivery/references/model-routing-cliproxyapi.md)。

两份参考都依赖实时 catalog 与已验证能力。它们不定义静态账号数量、不检查凭据、不实现产品路由或 failover，也不授权根会话改变自己的模型。
