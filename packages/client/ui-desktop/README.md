---
description: "Desktop-only chrome plus Platform Account state in the Mobile Pairing Settings section."
kind: "package-reference"
---

# `@deepseek-ai/dsh-client-ui-desktop`

English | [中文](README.zh.md)

## Summary

Desktop-only Session Surface chrome and Mobile Pairing plus Sub2API Settings sections. The Desktop Host `--patch` overlay inserts this row; browser `dsh web` does not. It elects the GESTALT wordmark on `sidebar.brand`, fills `sidebar.chrome.drag`, registers the Update Control on `sidebar.footer.action`, and contributes the `手机配对` and `账号池` Settings sections. The preload bridge also carries `chromeOverlayShow` so Host chrome can ask a native overlay `WebContentsView` to paint Settings and the sidebar `+` menu. The pairing section projects Host-owned current-installation Account and Personal Pairing state, displays both privacy languages before authorization, and sends Account and pairing verbs through `window.dshDesktop`; no private or pairing key enters the renderer. While Account status is `authorizing` or `polling`, the waiting panel exposes `accountCancelLogin` as 取消登录 / Cancel sign-in. Its pairing panel owns the Mobile Access toggle, complete QR/link invitation, authentication-word confirmation, rejection, and paired-device list. The `账号池` section is a render-only projection of the Host-pushed Sub2API component snapshot (`missing → downloading → verifying → installed → starting → running / error`): it states the offer with the data-directory and uninstall semantics before enablement, renders the native Sub2API account workspace by default while running, keeps status, disable, and two-step uninstall controls in the upper-right header, and shows actionable errors with retry. The account workspace reuses Sub2API account, proxy-management, and Composite-route components and APIs, follows the Desktop light/dark theme and Chinese/English locale, and never navigates the Session Surface. The normal sidebar gains no Account, pairing, or Sub2API entry. The Update Control mounts for an available, downloading, preparing, downloaded, or installing update and for an error after version discovery; disabled, idle, checking, and pre-discovery errors occupy no sidebar seat. Inactive phases expose their phase only through a hidden `data-desktop-updater-state` marker with no text or accessibility role; visible phases expose `data-desktop-update-control` on the button. All updater, window, and privileged Sub2API verbs go through the preload bridge; the workspace iframe uses the current Host's same-origin proxy.

The macOS chrome reserves 28px above the unchanged DSH sidebar header and center Session content for the native traffic lights. The Windows row spans the viewport and keeps its three caption buttons outside the drag region without changing the Session content inset. Other development platforms render no custom Window Chrome and keep their system frame.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through Account, Personal Pairing, and Remote Access controls that admit mobile-origin work into Host Sessions.

#### KV Cache effect

The chrome adds no stable request prefix; paired mobile work enters model context through the receiving Host services it controls.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- **The plugin is a no-op without `window.dshDesktop`** — Mobile Pairing Account state, Update Control, and Window Chrome render nothing; their sources stay in initial states.
- **Tests value-import `SlotRegistry` from `@deepseek-ai/dsh-client-ui-renderer/client`** — production `apply` types the root context from Cordis and does not import the renderer.
- **Assembled Desktop Web E2E installs `installDesktopBridgeFixture`** — a required preload member missing from that fixture fails typecheck instead of a browser timeout ([typed DesktopBridge fixture](../../../.agents/notes/implemented/testing/2026-08-21-typed-desktop-bridge-e2e-fixture.md)).
- **Product pairing is endpoint-owned** — the Host mounts the opaque mailbox, endpoint Snow owners, durable key vault, sealed Mobile authority delivery, and the real Relay lifecycle. Independent review and physical WebView runs remain release evidence.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
