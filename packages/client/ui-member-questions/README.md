---
description: "Member-question composer takeover: the remote Decision Brief banner over the shared question presentation."
kind: "package-reference"
---

# ui-member-questions — member-question composer dock

English | [中文](README.zh.md)

## Summary

Presents member-directed `ask_user_question` requests as a composite card: the remote Decision Brief banner (remote tag, asker identity and role, project, source session, expiry countdown, clamped background, material chips) over the shared question presentation, which keeps pagination, multi-select, recommendation badges, custom answers, and settlement as its native behavior.

The package registers an additive `conversation.input.dock` entry above the product composer. A Host pending member-question row renders the Decision Brief there; `plan-review` and generic composer takeovers stay on the shared question chain. Observing the shared presentation's own minimize toggle folds the whole card to a 「远端 · 发起人」 strip and marks it collapsed; the presentation stays mounted, so its drafts survive.

Material chips open only the receiver-owned cached copy through Better Sidebar Files. The Host writes transferred bytes under `.dsh/member-questions/<questionId>/` so a same-named Workspace file is never overwritten or opened. Clicking a chip calls `ctx.betterSidebar.openFile` with the receiving Session id and cached path; a missing `cachedPath` is a no-op. Markdown, sandboxed HTML, and unsupported types reuse the ordinary Files viewers. When the Files editor tab is unregistered, the chip calls `ctx.remote.session.openWorkspacePath({ path: absolute })` and the Host system opener. There is no Member-Question-specific document dock.

`ReceivingQuestionBook` is the only Host snapshot owner. It stores Host pending views from generated `memberQuestion.snapshot`, settles through `memberQuestion.settle` after a successful Remote write, and refreshes on `member-question-receiver/changed`. The dock maps Host questions into JSON and declares `question.presentation` with Host answer and cancel callbacks. `PendingQuestion` and drafts stay in ui-user-questions. A failed Host settle leaves the Host pending view and the QuestionComposer drafts.

Answered, declined, expired, withdrawn, and superseded records remain visible as passive bands after the pending card disappears. An answer won by another Installation renders as answered elsewhere with the winning device name and settlement time. The unchanged product composer submits through the receiving face's single admission RPC; the card does not mount a second textarea and the renderer does not issue separate Session creation and prompt calls.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through answers it settles into the shared `ask_user_question` tool result.

#### KV Cache effect

It adds no stable request prefix; each submitted answer contributes retained tool-result tokens through the shared presentation.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- **Dock routing is all-or-nothing per batch** — the card renders only when every question in the batch declares the `member-question` intent; one generic or `plan-review` question sends the whole batch to the shared question composer, and no per-question split exists.
- **Material chips need a Files viewer or the Host system opener** — a registered Files editor tab opens the receiver-owned cache path in the receiving Session; a missing `cachedPath` is a no-op so a same-named Workspace file is never opened; otherwise the Host system opener is used. There is no second in-product document dock.
- **Admission failures remain on the receiving card** — the shared input state keeps the draft and exposes the Host diagnostic. Only a successful Host materialization unlocks ordinary model, command, and skill routes.
- **Receiving Session faces stay session-controller-owned** — `ReceivingQuestionBook` projects Host snapshot rows as JSON. This package does not keep a second Remote ledger.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
