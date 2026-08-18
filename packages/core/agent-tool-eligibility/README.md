# dsh-agent-tool-eligibility

English | [中文](README.zh.md)

The allow-only row an agent preset carries to declare its base tool eligibility.

```yaml
- id: tool-eligibility
  name: '@deepseek-ai/dsh-agent-tool-eligibility'
  config:
    allow: [bash, str_replace_editor]
```

`allow` is required and is the only configuration field. The row contributes names to the preset's standing scope; Workspace and Session settings may add names later through [`dsh-tools-eligibility`](../tools-eligibility/README.md). An empty list means the preset allows no end tool. Names may refer to tools registered later, so dynamic tool registration does not require remounting the preset.

## Model Experience

### Preset allowance

#### What the model sees

Only tool schemas named by the preset allowance or by more specific Workspace and Session additions enter the request through [`dsh-tools`](../tools/README.md). An empty preset allowance contributes no schemas until a more specific setting adds them.

#### Token effect

The row adds no prompt text. It removes every ineligible tool schema and its repeated per-request token cost from the preset's Sessions.

#### KV Cache effect

The allowance is fixed when the preset is composed. A changed eligible schema set invalidates the request prefix at the first changed tool schema.

## Known Limitations and Deferred Work

- The row names exact tool ids; it does not define aliases, patterns, categories, or a deny list.
