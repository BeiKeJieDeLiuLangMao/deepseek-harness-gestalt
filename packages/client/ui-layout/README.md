---
description: "Shell layout for the Web GUI: the three-column AppFrame, frame-owned workbench hosts, panel geometry service, and theme presentation."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-layout

English | [中文](README.zh.md)

## Summary

This package provides the Web GUI's AppFrame, column and row geometry, stable DOM hosts for the Session workbench, and `ctx.layout` presentation control. The frame measures its own box, protects the conversation's center column, and reserves tracks only from the workbench's current presentation reports. The theme presenter owns color scheme, alias tokens, content font size, and document metadata.

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

The root slot composes `sidebar`, `conversation`, one Session-scoped `workbench`, and the additive `shell.overlay`. The sidebar spans 264–420px, defaults to 280px, and retains a 56px rail when collapsed. Below 1024px it collapses automatically. The right surface first requests 45% of the frame and keeps the user's pixel preference, capped at 70%. To protect 400px for the center, the frame reduces the right surface to 300px and then reports insufficient room. Dragging the right edge writes through the frame's clamp.

The frame owns two DOM hosts. The right host spans the full frame height in the right column. The bottom host is the second row of the center column, so its height never reduces the right surface. Their stable ids, measured viewport width and height, actual center and right-track widths, prospective right-panel width, eligibility, and width callback form the `workbench` owner props. The workbench resolves those ids and portals its surfaces from one React and store tree. The Desktop native overlay document omits the workbench and conversation.

`ctx.layout.openRightbar(track, fullscreen)` reports the right surface. A wide fullscreen surface may retain its underlying track; automatic narrow fullscreen requests none. `openBottombar(height, fullscreen)` reports the bottom surface. A visible push bottom reserves its height inside the center; a fullscreen or hidden bottom reserves zero. `closeRightbar()` and `closeBottombar()` release their tracks. The right resize handle belongs to the frame; the bottom surface owns its height and shared-corner gestures.
The root slot composes the sidebar, main content, and right column. The sidebar spans 264–420px, defaults to 280px, and retains a 56px rail when collapsed; below 1024px it collapses automatically, and opening the right panel collapses a manually expanded sidebar. The right panel first opens at 45% of the viewport, then retains the user's pixel preference, capped at 70%. To protect 400px for the center, the frame first reduces the right panel to 300px, then reports insufficient room so its occupant closes it, and only then compresses the center further. Dragging has no transition delay; the right handle is absent while closed or fullscreen.

Global panels occupy the root-scoped `main` keyed slot; `conversation` is the reserved key for the Conversation. `ctx.layout.selectPanel(id)` selects a registered panel, and `null` selects the Conversation without changing the current Session. No global panel is registered by the shipped composition.

### Theme presentation

The presenter consumes resolved theme snapshots and projects them onto the document: `html { color-scheme }` for native UA chrome, `body[data-ds-dark-theme]` from the active color scheme, the theme's alias tokens and `--dsh-content-font-size` as inline variables on body, and one owned `<meta name="theme-color">` whose content follows the computed body background. Disposing the presenter removes its metadata node with its other global writes.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The layout store owns the last positive frame width and height, left and right width preferences, and presentation reports for both workbench surfaces. Responsive concessions never rewrite a width preference. AppFrame derives three columns and two center rows from those facts. It passes the prospective normal right width separately from the actual reserved right track, which is zero when the workbench requests no track. Bottom fullscreen always produces a zero-height row. A `ResizeObserver` coalesces measurements through one animation frame.

The `workbench` slot replaces the former right-column entry because the right and bottom surfaces share one Session owner. AppFrame renders the slot once under `SessionProvider`; without a current Session both hosts stay empty. The owner props carry ids and JSON-safe geometry values and callbacks rather than elements or React producers. Fullscreen presentation suppresses frame geometry transitions while the destination tracks settle.
`selectPanel(id)` checks the live `main` registry before changing selection; an absent key throws and leaves the current panel intact. `beginNavigation()` returns an abort signal for an asynchronous UI navigation. A later call, a valid panel selection (including repeated selection), or layout disposal aborts that signal without cancelling underlying Session creation. Consumers check the signal before committing navigation or moving drafts.

One registration declares four child slots and binds `ctx.layout` methods `selectPanel`, `toggleSidebar`, `openRightbar(track, fullscreen)`, and `closeRightbar`. One root store separates `panelInfo` selection from `layoutInfo` measurements, width preferences, and presentation reports. `usePanelInfo` subscribes to the stable selection object; AppFrame subscribes to the stable layout object. The `rightbar` owner supplies actual `width`, `viewportWidth`, and normal-presentation eligibility `canShow`; insufficient room causes a deterministic close, never automatic reopening on widening. Fullscreen hides the width handle without releasing a track the occupant retains. AppFrame keeps the column containers mounted. The right column's root controller renders `rightbar.session` through `SessionProvider` only while the Conversation is selected; its unmount report releases the track. The independent title component uses the selected Session title only while the Conversation is visible, with the build-configured product title or localized `common.brand.localBuild` as its fallback; locale revisions update that fallback. The theme presenter is a second effect: pure DOM writes from resolved snapshots — initial state through the getter once, then event-driven only, with no React path. It applies palette, font-size, and token variables before measuring the rendered background as the single color authority. Fullscreen presentation suppresses grid and handle transitions; its occupant reports the new columns only after covering the frame. Fullscreen exit keeps transitions suppressed while the frame installs its destination geometry: close removes the right track, and restore retains it. Subsequent normal geometry actions restore ordinary transitions.

The conversation slot renders inside a real flex item that owns the complete center width. The framework's boxless `display: contents` slot anchor cannot make the Conversation root shrink to its capped content width.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-sidebar](../ui-sidebar/README.md) occupies the `sidebar` column and its seats.
- [ui-conversation](../ui-conversation/README.md) occupies the conversation row.
- [ui-sidebar-right](../ui-sidebar-right/README.md) owns the Session workbench and portals both dock surfaces into this frame.
- [ui-theme](../ui-theme/README.md) owns the resolved theme snapshots consumed here.
- [Web client architecture](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) explains how browser plugins register slots.
Read these pages when the layout surface is not enough. They move from the frame to the columns it renders and the theme it presents.

- [ui-sidebar](../ui-sidebar/README.md) — occupies the `sidebar` column and its seats.
- [ui-conversation](../ui-conversation/README.md) — occupies the `main` key `conversation`.
- [ui-sidebar-right](../ui-sidebar-right/README.md) — occupies the `rightbar` column with one docking surface per session.
- [ui-theme](../ui-theme/README.md) — the theme seam whose resolved snapshots the presenter consumes.
- [Web client architecture](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) — how browser plugin rows load and register slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the layout shell manages browser viewing state; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Frame geometry is transient.** Reload restores the sidebar default and clears right and bottom presentation reports. Session workbench topology is persisted by `ui-sidebar-right`.
- **Extremely narrow windows.** After the right surface releases its track, the center may still fall below 400px; the left 56px rail remains.
- **No scroll anchoring during squeeze reflow.** Track changes may move the reader's viewport.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The frame store behind `ctx.layout` emits no Cordis events; package tests assert measurements, clamps, host identity, track reports, and transition sequencing directly.
