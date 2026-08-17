# dsh-tools-eligibility

English | [中文](README.zh.md)

The host-plane resolver for allow-only tool eligibility. Preset allowances form the base; the `tool-eligibility` settings section adds Workspace and then Session entries by stable id.

```yaml
tool-eligibility:
  workspaces:
    workspace-id: [bash]
  sessions:
    session-id: [str_replace_editor]
```

All configured lists are positive additions. The effective set is the sorted union of the preset, matching Workspace, and matching Session lists. If none exists, the Session remains unrestricted for compatibility. Any declaration activates allow-only eligibility; an empty effective union allows no end tool. Settings updates apply to live Agents without restart.

The service contributes settings entries through `ctx.tools.allowEligible()`. The registry uses the resulting view for model schemas, lookup, and dispatch, so an ineligible or stale call resolves as an unknown tool before its body runs. The exact schemas sent to a model already live in the durable `request/header` event; replay can therefore reconstruct the model-visible eligibility without consulting current settings.

`session.toolEligibility` exposes the same effective union and schema catalog to Host clients. The settings schema contains `workspaces` and `sessions` only; the internal deny-capable `ctx.tools.restrict()` API is not projected into user configuration.

## Model Experience

### Effective eligible schemas

#### What the model sees

The model receives only the exact positive union of preset, matching Workspace, and matching Session [tool schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tools). Code Mode's reserved `run_code` transport remains presentation infrastructure; eligibility filters the end tools projected through its generated SDK.

#### Token effect

The service adds no prompt text. It removes every ineligible end-tool schema and its repeated per-request token cost; Code Mode likewise omits those bindings from the generated SDK.

#### KV Cache effect

A settings change that changes the effective schema set invalidates the request prefix from the first changed tool schema or SDK token.

## Known Limitations and Deferred Work

- Workspace matching uses the Session header's canonical cwd and the live Workspace registry. A Session outside a registered Workspace receives only preset and Session entries.
