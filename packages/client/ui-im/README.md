---
description: "IM Accounts settings, workspace takeover and simulation cards, and the Better Sidebar IM conversation tab."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-im

English | [中文](README.zh.md)

## Summary

This plugin adds the accepted IM GUI: Settings → IM Accounts for DingTalk DWS and Wangwang credential-reference connection, Workspace Settings cards for takeover routes and simulation targets, and a Better Sidebar IM conversation tab. Native approval stays the only approval surface. Secrets never appear in the list, toast, or snapshot.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Connect a DingTalk or Wangwang account under Settings → IM Accounts. Add takeover rules under Workspace Settings → IM Takeover; new rules start disabled, and disabling a specific rule keeps the binding. Select a configured target under Workspace Settings → IM Simulation before simulation tools appear. Open the IM conversation tab to inspect sender badges and delivery state, send manually when automatic handling is off, and switch between the simulated-user and tested-agent sessions.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`apply` registers `settings.section` id `im-accounts`, two `workspace.settings.section` cards (`im-takeover`, `im-simulation`), and one official Sidebar tab (`@deepseek-ai/dsh-client-ui-im/conversation`). Accounts, routes, and simulation targets persist through `ctx.remote.imConfig`. The conversation stream refreshes from `ctx.remote.imDelivery` (`queryHistory`, `listOutbound`); manual send calls `registerManualOutbound` and does not flush adapters. The strip Enable/Disable affordance writes `updateRouteRule({ enabled })` and, on disable, `cancelPendingAiOutbound`. Simulated-user and tested-agent buttons open the bound workspace through `uiWorkspace.openWorkspace`. Simulated-user role reads a running instance from `ctx.remote.imSimulation`; Create simulation instance calls `createInstance({ workspaceId })`; Send as member calls `injectMemberMessage` and does not flush adapters. Wangwang secrets mint a credential reference and are discarded. Feishu is not offered. Composition: `tsconfig.client.json` references the package; `packages/bundle/web-app/cordis.patch.yml` carries the `ui-im` browser row.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [IM Account Takeover Specification](../../../.agents/design/im-takeover/specification.md)
- [ui-workspace](../ui-workspace/README.md) — workspace settings modal that hosts `workspace.settings.section`
- [ui-settings](../ui-settings/README.md) — settings section slot
- [ui-sidebar-right](../ui-sidebar-right/README.md) — official Sidebar tab registry

<a id="model-experience"></a>
## Model Experience

None, as this package is a browser GUI plugin and registers no prompt, tool schema, or session event.

#### KV Cache effect

None; UI state never alters a model request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Conversation stream is Host-backed, not live outbound** — accounts, routes, and simulation targets persist through `imConfig` remotes. The Sidebar stream lists `imDelivery` history and queued outbound; `registerManualOutbound` does not flush adapters. `presentation.ts` maps assembled domain records onto sender badges and delivery states; `result_unknown` is never success. `IM_LIVE_LANE_BEHAVIORS` names live DingTalk login, live Wangwang reads, live outbound, real model calls, and native Desktop GUI computer-use.
- **No operations board** — native approval is the only approval surface.
- **No Feishu** — first-period platforms are DingTalk and Wangwang only.

<a id="dev-note"></a>
### Dev Note

None.
