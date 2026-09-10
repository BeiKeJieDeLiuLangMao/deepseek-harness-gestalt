# Agent Note: Terminal single scroll owner

Status: implemented

English | [中文](2026-09-10-terminal-single-scroll-owner.zh.md)

## Problem

DockKit made every pane body a generic vertical scroll container. The Terminal body also filled the pane and gave xterm its own vertical viewport, so terminal output produced an outer pane scrollbar beside xterm's scrollbar. Scrolling could move the complete Terminal body instead of only its buffer.

## Decision

DockKit supports a tab-body root marked `data-dockkit-scroll-owner`. A pane containing that marker becomes a clipped flex column and delegates vertical scrolling to the child. The descendant match crosses the `display: contents` wrappers inserted by keyed Slots; bodies without the marker keep the generic pane scrollbar.

Better Sidebar marks the Terminal root with this attribute. Its existing flex and minimum-height rules fill the pane while xterm's viewport remains the only vertical scroll container.

## Alternatives considered

**Hide overflow on every pane body.** Rejected because documents and viewers without an internal scroller rely on DockKit's generic pane scrolling.

**Target Terminal through a generated CSS class.** Rejected because DockKit does not own Better Sidebar's hashed class names and the relationship would be implicit across package stylesheets.

**Hide the xterm scrollbar.** Rejected because xterm owns buffer scrolling and must retain its native scroll position and interaction.

## Consequences

Terminal output scrolls only inside xterm, while other tab bodies preserve their prior DockKit scrolling. A future self-scrolling body can opt in only by filling the pane and placing the marker on its root.

## Testing

Desktop acceptance checks that the marked Terminal root is contained by the pane body, the pane body has hidden overflow with equal scroll and client heights, and the xterm viewport retains vertical scrolling.
