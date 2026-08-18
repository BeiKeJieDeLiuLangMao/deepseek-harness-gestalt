# Agent Note: Web Text Annotation Drafts

Status: implemented

English | [中文](2026-08-18-web-text-annotation.zh.md)

## Problem

Users can refer to assistant prose by copying it into the Composer, but that loses the relationship between a comment and the exact passage it describes. Keeping a browser `Range` as draft state would preserve the visual selection only until Markdown rerenders or the page changes. Sending a bespoke annotation envelope would also make the model-facing message differ from the ordinary user message shown in the transcript.

## Decision

Completed assistant text blocks are the only text-selection targets. During settled Markdown rendering, the renderer registers ordinary text, inline code, fenced code, raw HTML literals, and images in one typed text projection. Contributions retain source order while locally rerendered leaves replace the same contribution; null refs remove detached endpoints. The selection target uses that projection for both Text Anchor context and Draft Mark restoration; it never reconstructs the rendered message DOM or ranks quotations against a separately normalized string. Both endpoints must resolve to registered source text in one block. Generated math and footnote chrome are excluded, and any selection crossing either is rejected; any image intersecting the selected fragment also rejects the selection, including an image with empty alt text. The draft stores a Text Anchor containing the completed message/block identity, exact quote, and bounded prefix and suffix context. DOM ranges remain presentation-only values used by the page-wide CSS Highlight aggregate; each mounted target contributes its own ranges, so removing one target cannot remove another target's Draft Marks.

Selecting text first opens a two-action toolbar containing Add annotation and Copy. Add annotation opens the shared anchored note editor. The floating toolbar and editor follow the anchored selection: scroll and resize recompute their placement on the next animation frame until the selection resolves or its target unmounts. Composition Enter does nothing, ordinary Enter and the submit button save, and Shift+Enter inserts a newline. Notes may be empty. The Composer owns annotation creation order, editing, deletion, and the `N annotations` summary; its named interactive region reveals complete draft contents on hover or keyboard focus.

Submission compiles the current question and annotation snapshot into localized ordinary prose. The question is first when present, followed by numbered annotations containing the exact quote and optional note. The Host receives this prose through the existing message sink, so the durable `user/message`, model request, and user bubble agree. One object-identity reservation owns the submitted annotation ids until the Host's prompt admission of the complete request settles it — the same acceptance signal the ordinary send path checks, never mere promise resolution. The Composer remains read-only during that interval, repeated submission and annotation edits are refused, a stale settlement cannot affect a later reservation, success removes only the owned annotations, and failure releases the same drafts for retry. Draft Marks and the summary remain until admission succeeds; a send that resolves without admission restores the full draft, question text included, instead of the compiled prose.

Unsent annotation drafts persist per Session as browser-local Composer state through the shared chat store's whole-value JSON entry: annotations, notes, identities, creation order, Text Anchors, image pins, and the id sequence sit beside the question text under the existing per-Session key. Staged image bytes required by image pins persist in IndexedDB so reload does not depend on object URLs. Drafts add no Session event and no Session-log format. Independent tabs do not synchronize live; the storage entry holds the last value-setting write (deterministic last-writer-wins). A reload or Session switch rehydrates the exact draft, and an anchor that no longer resolves unambiguously from its quotation and context renders a visible error at its source while the rest of the draft survives.

Composer-staged PNG, JPEG, and static WebP images expose an annotation mode on the existing preview. Pins use percentage coordinates against the displayed, EXIF-oriented raster. Animated GIFs stay sendable and refuse pins. Submission sends the original image with localized coordinate prose and no derived raster.

## Alternatives considered

**Retain DOM ranges as the anchor.** Ranges are renderer objects whose identity is invalidated by Markdown remounts. They are suitable for transient highlighting, not draft meaning.

**Send structured annotation metadata.** The current model needs readable context rather than a new protocol. A structured envelope would add parsing obligations and make ordinary transcript presentation incomplete.

**Persist drafts in the Session log.** Unsent browser drafts are not yet Session history. Logging them would introduce recovery and synchronization semantics beyond text annotation mechanics.

## Verification

Focused component tests cover renderer-projection repeated-quote context, keyboard selection across Markdown spans, inline and fenced code, copy-state and lazy-grammar rerenders, detached-boundary disposal, raw HTML literals, generated-math exclusion, image-intersection rejection with an empty alt, adjacent valid selection, toolbar contents, Safari IME settlement, compilation order, duplicate-submission exclusion, in-flight edit refusal, owned success and failure settlement, admission clearing, and cross-target Draft Mark aggregation. The GUI suite covers the conversation and Composer lock surfaces.

A keyless assembled Web scenario starts the real server and Chromium against the replay model, creates a completed Markdown response, selects across plain and bold nodes, saves and reopens the shared editor, edits the note, sends a question plus annotation, and pins the exact model-visible ordinary prose. It also verifies that the Composer summary and Draft Mark disappear after admission. A sibling scenario drafts a question plus annotation, reloads the page, and asserts the exact draft, Draft Mark, and question text return; a forked Session stays draft-free, switching back restores the draft, and admission clears it. Component tests cover the store mirror and rehydration, identity and order restoration, malformed-value rejection, same-key last-writer-wins without live synchronization, the stale-anchor error preserving the other marks, and rejection restoration with newer input refused during flight.

## Consequences

- Annotation meaning survives Markdown rerenders without storing renderer nodes.
- The model and transcript receive one localized ordinary user message rather than parallel annotation state.
- Empty notes remain valid, while question-first ordering is deterministic.
- The draft survives reloads and Session switches in the browser profile; staged-image bytes remain deferred to their owning capability.
