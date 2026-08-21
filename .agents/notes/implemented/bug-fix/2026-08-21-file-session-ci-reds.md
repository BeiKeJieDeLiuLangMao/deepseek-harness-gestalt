# Agent Note: Repair File/Session Reference CI reds

Status: implemented

English | [中文](2026-08-21-file-session-ci-reds.zh.md)

## Problem

The File/Session Reference sync against official Host `@path` / `file-reference-local` plus `session-reference` left four merge-blocking reds on Gestalt `#204`. Linux coverage reported a pwsh backend that treated the echoed `PWSH_PROMPT_SETUP` source as the installed `dsh> ` prompt, so `tool-pwsh-persistent` later extracted no command marker and the relay first-frame test closed an oversized frame with `1008` instead of `1009`. The consumers lane failed publint on a hashed `remote-access-client` chunk, Web settings goldens that still listed the deleted Workspace-reference nav item, and Composer image-pin e2e that opened a preview with no `Annotate image` control. Refreshing the persistent-pwsh snapshot to clipped bootstrap, or widening the package `files` list for hashed chunks, would hide those failures.

## Decision

**pwsh spawn waits for a ready-probe marker; command idle waits for a prompt after output.** Linux pwsh reports `inputWaiting` at the default prompt before the line runs, and the first bytes of setup echo are also output. Treating that wait as ready returns leftover setup; requiring `dsh> ` on every path starves spawn because Linux often reprints `PS …>` only on the next write. A pwsh `acceptsStdinWait` or OSC `stdin_read` therefore settles only after the active send's last non-empty line is `CONTROLLED_PROMPT` (`dsh> `) or the persistent-tool prompt. A default `PS …> ` reprint is not an installed prompt. Setup and ready-probe sends set `bootstrap: true` so `inferred_idle` can settle on any output. Spawn then writes `Write-Output "__DSH_PWSH_READY__"` and returns only when that marker (or a last-line `dsh> `) appears. Setup echo plus silence is not spawn-ready. Ordinary command sends leave `bootstrap` unset and settle idle only after a prompt line plus at least one non-prompt line, so a lone `PS …>` reprint cannot settle before the command runs. The spawn `timeoutMs` bounds the whole loop. The [persistent pwsh note](../architecture/2026-08-11-pwsh-persistent-pty.md) still owns the two-layer prompt install.

**Relay payload-size uses the default first-frame deadline.** The idle-timeout assertion still starts a 10 ms server. The oversized-frame assertion starts a separate server at the default 1000 ms so attach-timeout cannot pre-empt the 1009 close.

**`remote-access-client` emits one file per entry.** Each published file is its own tsdown face with `outputOptions.codeSplitting: false`, matching compaction and the JSON-RPC demo. A multi-entry face cannot disable splitting. The package `files` whitelist and `packageFileExtras` stay unchanged.

**Settings goldens drop the deleted Workspace-reference row.** The nav item is absent after `ui-workspace-reference` was removed; the expected trees no longer include `工作区引用`.

**Composer previews restore the official pin overlay, and InputBar keeps the Gestalt annotation chip.** `InputBar` passes `useComposerImagePinOverlay` through `pinOverlayFor`. `ComposerAttachments` owns pin-mode state and sets `annotation.gifRefuse` only when the user toggles annotate on `image/gif`. Opening a preview does not show that alert. History pins keep `source: 'history'`; Composer pins keep the default `composer` source. The two overlay hooks share `useImagePinOverlay` so jscpd does not treat the Composer restore as a clone of the history hook. Taking official `InputBar` dropped the `{count} annotation` summary and discard control the Web e2e uses; the chip, per-item edit/delete, and annotation-only send enablement stay on the composer card. A parent-offline continuable child keeps a disabled Send beside independent Stop. Empty-draft steering waits until the textarea is visible and not `submitting`/`adjudicating`, then uses Playwright `fill` plus `Enter` for both queued rows.

## Alternatives considered

**Refresh `persistent-pwsh-tool-turn` to the clipped bootstrap transcript.** Rejected: that records the false-ready failure as success. The tool must still extract `PWSH_OK` after a real second prompt install.

**Add hashed `lib/relay-*.js` names to `files`.** Rejected: `check-workspace-constraints` generates the expected file list. A split chunk is an emit defect, not a packaging exception.

**Set `codeSplitting: false` on the three-entry browser face.** Rejected: tsdown refuses multiple inputs when splitting is off. Each published file is its own face.

**Keep first-frame and payload-size on one 10 ms server.** Rejected: under coverage-partition load the attach deadline wins and closes 1008 before the size check.

**Leave the Workspace-reference golden rows and close the settings dialog between cases.** Rejected: the product nav no longer has that row. Shared-page overlay failures were a symptom of the stale first golden.

**Show the GIF refuse alert as soon as the preview opens.** Rejected: the annotate control is the refuse moment. A PNG preview must not show an alert.

**Wrap the mirrored pin hooks in `jscpd:ignore`.** Rejected: the overlay construction is one function. Ignore comments would hide a real clone.

## Consequences

Official File/Session Reference stays the only `@` file source. Persistent pwsh spawn waits for a ready-probe marker (or last-line `dsh> `), and ordinary command idle waits for a prompt after output. A stuck banner loop fails at `timeoutMs` instead of hanging the coverage worker. Relay, publint, settings goldens, Composer pin e2e, and the annotation-count chip exercise the repaired paths. The deleted Workspace-reference picker goldens stay deleted.

## Testing

`packages/terminal/terminal-bash/tests/session.spec.ts` keeps a pwsh stdin-wait from settling on command echo, accepts `dsh> ` or the tool prompt, lets inferred idle settle after output plus a prompt line, and refuses a lone `PS …>` reprint. `packages/terminal/terminal-bash/tests/index.spec.ts` rejects a last line that only contains the prompt marker, ignores a trailing space-only cursor row, treats `stdin_read` as spawn-ready, sends a ready probe after setup-echo silence, submits setup once then probes when a follow-up viewport is empty, and bounds a never-ready idle loop with `timeoutMs`. `packages/client/ui-attachment/tests/message-image.client.spec.tsx` covers history pin overlay, refuse, and place. Empty-draft steering waits for the single queued row text — the count header exists only at two or more items — then Playwright `fill` plus `Enter` queues the second row. `packages/platform/remote-access-http/tests/relay.spec.ts` still closes idle at 1008 and oversized at 1009 on separate servers. `packages/client/ui-attachment/tests/composer-attachments.client.spec.tsx` and `packages/client/ui-conversation/tests/composer-image-pins.client.spec.tsx` cover annotate, GIF refuse-on-toggle, and the composer overlay factory. `pnpm run duplication` owns the shared `useImagePinOverlay` extraction. `packages/client/ui-conversation/tests/input-bar.client.spec.tsx` covers the annotation-count chip, discard, per-kind delete, and in-flight lock. Web settings goldens no longer list `工作区引用`. `pnpm exec tsx scripts/gen-client-catalog.ts --check` owns the `ComposerAttachmentsOwnerProps.pinOverlayFor` catalog text.
