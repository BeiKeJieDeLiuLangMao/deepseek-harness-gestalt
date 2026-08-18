# Agent Note: Composer text and image annotations

Status: proposed

English | [中文](2026-08-17-composer-text-and-image-annotations.zh.md)

## Problem

The Web Composer cannot turn a precise passage of a completed assistant response or a point on an image into a focused user prompt. People must quote text manually or describe image locations imprecisely, which loses the direct manipulation available in the text-annotation prior art and the image-pin interaction observed in Gestalt.

The external text plugin is not a suitable runtime dependency: it edits rendered DOM, intercepts Enter outside the input state machine, stores pending annotations only in browser memory, and reconstructs presentation by parsing and hiding protocol text. Gestalt's image-pin flow gives the model an original image plus percentage coordinates, but its structured pins are lost on the successful echo path. Importing either implementation would retain host coupling and incomplete persistence.

## Proposal

Annotation remains Composer-owned input state inside `@deepseek-ai/dsh-client-ui-conversation`. It is not a service, capability package, Cordis plugin, Session event, message source, or content block. Submission compiles the draft into an ordinary user message; after submission no runtime value identifies that message as annotated.

### Draft and targets

- Each Session owns one client-persisted Annotation Draft. Text, anchors, order, notes, historical image references, staged image bytes, and pins survive Session switches and page reloads in the current browser profile; tabs do not synchronize live and the last persisted writer wins.
- A text annotation selects visible text within one completed assistant response. It may cross rendered Markdown spans inside that response but not another message, image, reasoning row, or tool card. The draft retains the exact quote and surrounding context rather than a DOM range.
- An image pin may target a current Composer image or a durable image visible in the same Session history. Historical images are reattached by their existing content-addressed reference. Coordinates are normalized against the displayed, EXIF-oriented raster; animated GIFs remain sendable but cannot receive pins.
- Notes may be empty. Annotation order is creation order across text and images; deleting an item recalculates display numbers without changing draft identity. Text highlights and image pins remain visible and editable only while the draft exists, then disappear after successful submission or discard.

### Submission

- An Annotation Draft can be submitted without separate question text; the compiled message then asks the model to address the annotated locations.
- The compiler emits ordinary localized natural-language paragraphs, with separate question text first when present, followed by the ordered quotations, image identities, percentage coordinates, and notes. It emits no structural tags, hidden marker, answer-format instruction, or model-response numbering requirement, and no client later parses the message back into annotations.
- Image pins send the original image plus percentage-coordinate prose rather than a marked derivative raster. A historical source image is included again in the submitted message so compaction or context selection cannot leave only a dangling coordinate reference.
- Annotation adds no count, quote, note, or aggregate byte limit and never truncates content. When the selected model advertises a context capacity, submission preflights the assembled request and rejects an overflow with the draft intact; without advertised capacity, an actual provider overflow remains the visible failure.
- Question text, images, and compiled annotation prose form one submit attempt. The Composer may clear optimistically, but every rejection restores the exact text, order, anchors, staged images, and pins; successful submission disposes the draft state.

### Presentation and placement

- A submitted message uses the existing user bubble and shows the complete natural-language question and annotations without chips, folding, height caps, per-item copy, source jumps, or annotation actions. The existing copy action copies the complete message. Automatic titles use the leading question when present and otherwise the first annotation text.
- Forks inherit only the ordinary text and image messages already in their seed. They do not inherit annotation objects or source decorations because none exist after submission.
- Text-selection, draft-decoration, image-editor, serialization, and persistence modules live inside `client-ui-conversation` and extend its input machine, Markdown renderer, and image viewer through typed internal interfaces. They do not scan or rewrite rendered messages, register global Enter interception, or modify `agent-loop`.
- The Web Session Surface receives the feature through its existing `client-ui-conversation` composition, and DeepSeek Gestalt inherits it from the Web Host. Mobile Companion editing is outside the proposal.
- The external text plugin is neither installed nor registered, and its repository is not vendored. The implementation reuses its user journey and Gestalt's point-editor behavior as prior art while rewriting against current TypeScript and React owners. Any material source port retains the external MIT notice and pinned source revision.

## Alternatives considered

**Vendor the external repository.** Rejected because `vendor/` owns pinned Cordis foundations, while this feature is product UI whose external implementation depends on private DOM structure and carries no tests.

**Install the external repository as a built-in plugin.** Rejected because its capture listener races the Composer input machine, its send failure handling can lose pending annotations, and its presentation depends on parsing and deleting message DOM.

**Create an Annotation service, package, event, or content block.** Rejected because annotations need structured identity only before submission. The ordinary compiled user message already reconstructs the exact model input, while durable annotation vocabulary would add Session, SDK, compaction, provider, and compatibility work for behavior the product discards after send.

**Parse submitted natural language to restore annotations.** Rejected because a parseable template would be another protocol marker and could not recover authoritative message, Markdown, or image-source identity from arbitrary text.

**Burn pins into a derived raster.** Rejected in favor of sending the original image plus percentage coordinates, preserving the chosen Gestalt interaction and avoiding duplicate or transformed image assets.

**Keep highlights and pins after submission.** Rejected because permanent decorations accumulate across turns and imply durable annotation identity. Draft marks disappear at the same commit point as the draft.

## Acceptance criteria

- Selecting text in one completed assistant response opens an annotation editor, accepts an empty or non-empty note, and paints an editable draft highlight without accepting excluded targets.
- Composer images and durable history images open the point editor, preserve displayed-orientation coordinates through resizing and reload, reattach historical images on submit, and refuse GIF pins without blocking ordinary GIF sending.
- Mixed text and image annotations retain creation order, support edit and delete, survive Session switches and a page reload in one browser profile, and converge by last persisted writer across independent tabs.
- Annotation-only and question-plus-annotation submissions produce ordinary natural-language user messages and original image blocks, with no annotation event, message metadata, content block, hidden marker, or requested response format.
- A rejected submit restores the exact Annotation Draft; a successful submit removes every draft highlight and pin and leaves only the ordinary user message.
- History, copy, title fallback, resume, and fork use ordinary message behavior and never parse submitted text into annotations.
- Focused unit and client integration tests cover anchoring, coordinates, ordering, persistence, serialization, failure restoration, and exclusion rules; a real Web composition snapshot covers the model-visible message.
- Browser acceptance covers text and image creation, reload recovery, historical-image resubmission, send cleanup, and provider overflow where capacity is known; the product-visible change includes a GIF recorded from the real Web flow.

## Risks

- Submitted messages cannot offer per-annotation source jumps, editing, deletion, grouping, or structured export. Reintroducing any of those behaviors requires a new durable-data decision rather than parsing old messages.
- Percentage-coordinate prose may be less reliable for a vision model than visible raster markers, especially near dense image content or when a provider interprets orientation differently.
- Unbounded annotation content can exceed a model whose capacity is unknown until dispatch; the product reports that provider failure without truncation or automatic retry.
- Browser-local draft persistence does not synchronize live across tabs, browsers, devices, or Mobile Companion, and last-writer persistence can replace an unsent draft from another tab.
- Keeping the feature inside `client-ui-conversation` deliberately trades independent composition and unloading for one coherent input state machine and no new runtime vocabulary.
