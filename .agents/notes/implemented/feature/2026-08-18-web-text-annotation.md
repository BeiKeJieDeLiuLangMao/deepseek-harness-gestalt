# Agent Note: Web Text Annotation Drafts

Status: implemented

English | [中文](2026-08-18-web-text-annotation.zh.md)

## Problem

Users can refer to assistant prose by copying it into the Composer, but that loses the relationship between a comment and the exact passage it describes. Keeping a browser `Range` as draft state would preserve the visual selection only until Markdown rerenders or the page changes. Sending a bespoke annotation envelope would also make the model-facing message differ from the ordinary user message shown in the transcript.

## Decision

Completed assistant text blocks are the only text-selection targets. During settled Markdown rendering, the renderer registers selectable text leaves and images in a typed mapping. The selection target uses only that mapping and the browser Range endpoints; it never reconstructs the rendered message DOM. Both endpoints must resolve to registered text in one block, and any image intersecting the selected fragment rejects the selection, including an image with empty alt text. The draft stores a Text Anchor containing the completed message/block identity, exact quote, and bounded prefix and suffix context. DOM ranges remain presentation-only values used by the page-wide CSS Highlight aggregate; each mounted target contributes its own ranges, so removing one target cannot remove another target's Draft Marks.

Selecting text first opens a two-action toolbar containing Add annotation and Copy. Add annotation opens the shared anchored note editor. Composition Enter does nothing, ordinary Enter and the submit button save, and Shift+Enter inserts a newline. Notes may be empty. The Composer owns annotation creation order, editing, deletion, and the `N annotations` summary; its named interactive region reveals complete draft contents on hover or keyboard focus.

Submission compiles the current question and annotation snapshot into localized ordinary prose. The question is first when present, followed by numbered annotations containing the exact quote and optional note. The Host receives this prose through the existing message sink, so the durable `user/message`, model request, and user bubble agree. One object-identity reservation owns the submitted annotation ids until Host admission settles. The Composer remains read-only during that interval, repeated submission and annotation edits are refused, a stale settlement cannot affect a later reservation, success removes only the owned annotations, and failure releases the same drafts for retry. Draft Marks and the summary remain until Host admission succeeds; a failed send restores the original question instead of the compiled prose.

Unsent annotation drafts remain resident Composer state. They do not add a Session event or browser persistence format. Draft durability remains an independent concern, while every successfully admitted model-visible message is logged.

## Alternatives considered

**Retain DOM ranges as the anchor.** Ranges are renderer objects whose identity is invalidated by Markdown remounts. They are suitable for transient highlighting, not draft meaning.

**Send structured annotation metadata.** The current model needs readable context rather than a new protocol. A structured envelope would add parsing obligations and make ordinary transcript presentation incomplete.

**Persist drafts in the Session log.** Unsent browser drafts are not yet Session history. Logging them would introduce recovery and synchronization semantics beyond text annotation mechanics.

## Verification

Focused component tests cover repeated-quote anchor resolution, keyboard selection across Markdown spans, image-intersection rejection with an empty alt, adjacent valid selection, toolbar contents, Safari IME settlement, compilation order, duplicate-submission exclusion, in-flight edit refusal, owned success and failure settlement, admission clearing, and cross-target Draft Mark aggregation. The GUI suite covers the conversation and Composer lock surfaces.

A keyless assembled Web scenario starts the real server and Chromium against the replay model, creates a completed Markdown response, selects across plain and bold nodes, saves and reopens the shared editor, edits the note, sends a question plus annotation, and pins the exact model-visible ordinary prose. It also verifies that the Composer summary and Draft Mark disappear after admission.

## Consequences

- Annotation meaning survives Markdown rerenders without storing renderer nodes.
- The model and transcript receive one localized ordinary user message rather than parallel annotation state.
- Empty notes remain valid, while question-first ordering is deterministic.
- Reloading the page discards unsent annotations until draft durability is added by its owning capability.
