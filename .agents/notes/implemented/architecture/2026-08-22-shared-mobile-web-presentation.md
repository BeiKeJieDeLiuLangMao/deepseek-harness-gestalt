# Agent Note: Share Web presentation with Mobile Companion

Status: implemented

English | [中文](2026-08-22-shared-mobile-web-presentation.zh.md)

## Problem

Mobile Companion rendered a private `MobileContentBlock` union with its own Markdown, code, image, Tool, diff, Approval, Ask User, terminal, and composer markup. Shared colors could make that tree resemble the Desktop Session Surface, but behavior, accessibility, failure handling, unknown content, and future render-intent changes still had two implementations. The prototype projection also accepted labels and lines that no Desktop-authoritative Client Runtime projection produced.

## Decision

The Web presentation owners expose explicit `./presentation` entries. `ui-conversation` owns assistant Markdown, user bubbles, terminal failures, Approval, and the narrow `InputBarPresentation` interface; `ui-tool` owns recursive Tool presentation, the built-in keyed roster, and unknown-Tool fallback; `ui-user-questions` owns Ask User; and `ui-attachment` owns message images. `ui-theme` exposes stable stylesheet subpaths. These entries are public product interfaces, while plugin-only skeleton paths and CSS Modules remain private.

Dynamic Client plugin packages build these browser ESM entries with `browserSubpath`. That build face keeps bare dependencies and emitted CSS under the importing product shell without classifying the package as a Desktop static-linked package; its primary `dsh.client` module-table entry remains unchanged.

Mobile detail composition accepts the Client Runtime's `ConversationSnapshot`, `ConversationNode`, `ToolCallBlock`, and `PendingWait` values. `main.tsx` accepts the production `MobileCompanionPresentation` interface: Desktop-confirmed Session rows, a required Session-addressed image loader, and optional submit/cancel/load callbacks. Mobile adds phone navigation and environment-derived locale/theme selection. It does not define a transcript content union, infer interaction authority from `companion-push`, or mount Desktop columns, Settings, model selection, plugin configuration, or terminal input.

The full Desktop `InputBar` and `ConversationComposer` use the same owner-defined editor and primary-action presentation implementations. `ConversationComposer` owns a local `InputMachine` draft and delegates admitted prompt and cancellation operations to the caller; it supplies no annotation, attachment, slot, projection, command, or Host stand-ins. The encrypted Companion Session transport remains responsible for supplying authoritative snapshots and callbacks to the bundled Mobile entry.

Desktop keyed slots and `ToolPresentation` use one built-in Tool roster. Bash, read, write/edit, grep/glob, Web, todo, and question calls mount their specialized owner rows; `GenericToolCard` renders only unclaimed wire names. Direct composition passes the authoritative `ToolCallBlock`, cwd, and home values into `DirectToolCallTree` without constructing a Chat Node or Host description.

## Verification

Mobile component tests feed real `ConversationSnapshot` and `PendingWait` values through the public entries and cover Markdown, highlighted code, images, specialized ordinary and unknown Tools, diff, bounded terminal presentation, Approval, Ask User, Host failure copy, locale, theme, narrow composition, overflow, and the absence of privileged Desktop controls. The keyless browser snapshot builds the bundled `main.tsx` entry, completes Account lifecycle through intercepted HTTPS responses, then opens an authoritative development projection through `MobileCompanionPresentation` in English/dark and Chinese/light contexts at 390 px. It runs no model round and does not prove encrypted Desktop transport. Neither test uses `prototype-companion` or ports 5173/5174.

## Alternatives considered

**Share only CSS and domain labels.** Rejected because two rendering trees would continue to diverge in semantics, keyboard behavior, unknown content, and structured Tool output.

**Mount the complete Desktop slot tree at phone width.** Rejected because Desktop navigation, details columns, Settings, model selection, plugin configuration, and terminal affordances exceed Companion Surface authority and produce an unusable narrow layout.

**Create a new generic Mobile transcript model between the Runtime and React.** Rejected because it would duplicate the authoritative Client projection and require another conversion whenever a Conversation Node or render intent changes.

## Consequences

One presentation fix now reaches Desktop and Mobile components, and Mobile tests exercise the same implementation files as Desktop. Public presentation entries enlarge the supported package interface and therefore require package documentation, build/export checks, and deliberate compatibility changes. The Mobile bundle also includes the shared Markdown and syntax-highlighting assets, increasing its initial artifact size. This decision does not complete the encrypted Session transport; until that transport supplies the authoritative projection and mutation adapters, the bundled account/pairing entry cannot claim a live Paired Desktop conversation.
