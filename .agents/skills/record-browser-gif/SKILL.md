---
name: record-browser-gif
description: Record browser or Web UI interaction demos as optimized GIFs using the available browser-control workflow, optional Playwright Videos, and deterministic encoding, then publish onto the shared `gif-assets` branch when the task includes attaching the GIF to a pull request. Use when asked to make, record, or generate a GIF that demonstrates a browser workflow, and for every pull request that changes product-user-visible GUI behavior, which MUST include a GIF recorded from the pull request's real server and model flow.
---

# Record Browser GIF

Produce a short, truthful UI demonstration as a local GIF, and — only when the task includes attaching it to a pull request — publish it onto `gif-assets` at the end of this skill. Use the available browser-control workflow for interaction, optional Playwright Videos for continuous capture, and the bundled encoder for repeatable timing, dimensions, and size.

The [evidence-chain decision](../../notes/implemented/process/2026-08-08-browser-gif-evidence-chain.md) owns why one storyboard comes from one isolated run and why publication revalidates both the artifact and the demonstrated pull-request head. The [unified assets-branch decision](../../notes/implemented/process/2026-09-02-unified-gif-assets-branch.md) owns the single `gif-assets` home.

## Every GUI pull request includes a GIF

A pull request that changes product-user-visible GUI behavior MUST include a demonstration GIF recorded with this skill and embedded in the pull request body via [the `gif-assets` workflow](#publish-to-gif-assets).

The recording itself is part of the evidence: use a real server booted from that pull request's branch tree, a real API key, and real model rounds. Never substitute fixture queries, mock transports, synthetic event injection, or test-only hooks unless the user explicitly asked for a fixture recording. Next to the embed, state the exact demonstrated commit SHA, the tree and origin that served it, any mode flags or browser-state exceptions, and whether a real model round ran, so reviewers know exactly what the recording proves.

This skill records browser-visible evidence. A browser-operable backend does not replace the Codex computer-use acceptance of an in-scope native Electron route; that route must already pass through [`dsh-desktop-test-instance`](../dsh-desktop-test-instance/SKILL.md).

## Keep recording separate from publication

- Recording produces local video or screenshots and one `.gif` artifact only; it never mutates remote state.
- Publication — appending the GIF to `gif-assets` and embedding it in a pull request body — is the separate final step, performed only when the task includes attaching the GIF to a pull request. It never touches the pull request's own branch.
- Preserve the requested recording conditions. A real-server or real-API demo must not use fixture queries, mock transports, synthetic event injection, or test-only hooks. If credentials or the server are unavailable, report that limitation instead of substituting a fixture.
- Never read or expose credential values. Use the application's normal configuration path and a benign demonstration prompt.

## Record from a reviewed commit

Before invoking this skill for pull-request evidence, require both the complete acceptance flow to pass once without recording and semantic Standards and Spec review to have no code findings. Record the exact reviewed commit as the recording commit. This skill is the last expensive evidence step, not a debugging loop.

If code changes before recording, stop and run the affected checks and semantic review before recording from the new head. After publication, retain the GIF only when the delivery ledger maps the later change to behavior, route steps, and environment outside that storyboard. Keep the original demonstrated commit in its provenance; never relabel the GIF as evidence from the newer head. Re-record an affected storyboard from one coherent run, and broaden revalidation when impact is uncertain. Documentation-only pull-request metadata edits do not move the served commit or invalidate the recording.

## Stage the application

A GIF for a specific pull request demonstrates that pull request's tree, so stage per pull request:

1. Require a clean worktree, record its exact commit with `git rev-parse HEAD`, then use `pnpm run accept:web -- --copy-model-config`. The acceptance supervisor builds when the verified artifact record does not match HEAD, launches the built CLI with isolated state, registers the disposable Workspace through the supported API, and prints the expected visible revision.
2. Manage every requested port through that supervisor's `restart [port]` command; never boot a second Server beside it. Before the first real-model call or captured frame, verify that the page visibly shows the revision printed by `accept:web`. Give the browser a fresh isolated context or profile as well; if the browser workflow cannot create one, clear that origin's cookies and site storage before navigation so persisted client state cannot affect the evidence. `--copy-model-config` copies only the approved model settings and credential files without displaying their contents.
3. Treat one storyboard as one evidence run: every published frame comes from that server and those state roots, workspace, session, and model-backed scenario run. If capture automation fails, discard its frames and rerun from fresh roots; never splice frames from separate runs.
4. When switching between pull requests, stop the old server by PID or an exact match on its command line. A broad `pkill -f` pattern can match and kill the shell that launched it — including your own.

## Record the flow

Follow the available browser-control workflow's setup, interaction, and cleanup instructions. When it exposes `recordVideo`, enable video on the same controlled context to capture more intermediate frames. Otherwise use [screenshot capture](#screenshot-capture) within that workflow; video availability does not determine which browser-control workflow to use. Existing user browser state remains an explicit provenance exception.

Only when browser control is unavailable, use the repository-declared Playwright dependency in an isolated headless browser and state that fallback in the provenance. In this repository it resolves from `apps/web/package.json`; do not install another driver or open the user's browser.

Before recording, identify the origin, built or development server, transport, and any mode overrides. When a production default opens a native surface that automation cannot drive, select an official browser-operable production backend through normal application configuration and disclose the override.

Store the script, raw video, timing notes, QA frames, and GIF under the repository's gitignored `.playwright-mcp/` directory. Create the run directory first.

### Capture video

Match `viewport` and `recordVideo.size` explicitly: Playwright otherwise scales the video down to fit 800×800, which can make UI text unreadable.

Configure video through the chosen browser-control workflow. The standalone Playwright fallback uses:

```js
const { chromium } = createRequire(join(repo, 'apps/web/package.json'))('playwright')
const browser = await chromium.launch()
const size = { width: 1440, height: 900 }
const context = await browser.newContext({
  viewport: size,
  recordVideo: { dir: join(runDir, 'videos'), size },
})
try {
  const page = await context.newPage()
  const video = page.video()
  // Navigate and exercise the real application here.
  await context.close()
  await video.saveAs(join(runDir, 'demo.webm'))
} finally {
  await context.close()
  await browser.close()
}
```

Import `createRequire` from `node:module` and `join` from `node:path`; set `repo` and a fresh `runDir` to absolute paths in the recording script. Retain the page's video handle before closing it. Await `context.close()` before `video.saveAs()` or encoding; closing only the browser does not guarantee the video's flush. Each page has its own video: choose the demonstrated page explicitly and do not concatenate unrelated pages or runs. Failed runs are diagnostic only.

Choose a short story with three to six meaningful states. Wait for unique semantic locators before acting; use `exact: true` for accessible-name equality and exact-text completion predicates that cannot match a prompt echo. Fixed waits may provide a reading hold after the state is verified, but never establish readiness. When capturing video, preserve animations and scrolling.

When demonstrating a tool call, rejection, or recovery, open its detail or trajectory so the video shows the tool identity, status or stable error code, and downstream result. If a transient running state matters, prompt for a slow foreground operation and observe its concrete DOM marker; continuous video captures its intermediate frames. Give the model a short final sentinel to anchor completion. Stop an unnecessarily long real-API run after the demonstrated state is visible.

Capture no secrets, personal data, unrelated tabs, or notifications. Browser video contains page content, not browser chrome; avoid rendering credential-bearing URLs in the application. Review the whole selected interval, including intermediate states. Keep one viewport throughout.

## Encode the GIF

Require `python3`, `ffmpeg`, and `ffprobe`. If a media binary is missing, report the dependency instead of installing software without authorization. Export `GIF_SKILL_DIR` on its own line before using it; an inline assignment cannot affect argument expansion in the same command.

```sh
export GIF_SKILL_DIR=/absolute/path/to/this/skill
python3 "$GIF_SKILL_DIR/scripts/encode_gif.py" \
  /absolute/path/to/demo.webm \
  /absolute/path/to/demo.gif \
  --start 2 --end 32 --speed 2 --final-hold 3 \
  --fps 10 --max-width 1200 --colors 128
```

`--start` and `--end` select one continuous source interval in seconds. Defaults retain the full video at 1× speed and add a two-second final hold. `--speed` changes playback speed; disclose it and the selected interval beside the GIF so the demo cannot imply measured response latency. Use observed video times, not guessed wall-clock offsets, and preserve the complete cause and outcome of the demonstrated behavior. The final hold repeats the last selected frame. `--fps` sets the encoded GIF frame rate; increasing it cannot recover motion that the source recording did not capture. Keep the original WebM for QA; do not splice separate runs or synthesize missing states.

The encoder probes WebM container duration, applies trim and speed before palette conversion, and checks encoded duration, animation, width, and byte size. It refuses an empty or out-of-range interval, a selection shorter than two output frames, mode-inappropriate flags, and accidental overwrite. Reduce `--max-width`, then `--colors` or `--fps` for a large artifact; preserve readable text. Use `--force` only after resolving the exact output path.

### Screenshot capture

When continuous video is unavailable or the user requests a storyboard, follow the available browser-control workflow. Capture three to six verified states from one isolated run with the browser's screenshot API. Save returned image bytes directly under one run directory as `00-initial.png`, `01-typed.png`, and so on; use identical dimensions and crop. For a transient state, poll its DOM marker and capture within the same browser-script call.

```sh
python3 "$GIF_SKILL_DIR/scripts/encode_gif.py" \
  /absolute/path/to/frames /absolute/path/to/demo.gif \
  --durations 1.5,1.5,1.5,3.5 --fps 10 --max-width 1200 --colors 128
```

One duration applies to every screenshot; otherwise supply one positive duration per frame and hold the settled state longest. Directory input rejects fewer than two frames and mismatched dimensions or duration counts. Video timing flags apply only to video files; `--durations` and `--pattern` apply only to screenshot directories.

## Verify the artifact

1. Read the encoder's JSON summary and confirm the output path, source interval and speed (or screenshot count), encoded frame count, dimensions, duration, and byte size.
2. Visually read the encoded GIF itself, not only the source frames. Confirm that the transition is legible, the last state is held long enough, and no sensitive content appears. If the viewer renders only the first frame, decode representative frames from the encoded GIF with `ffmpeg` and inspect those; the pre-encode screenshots do not prove the encoded order, palette, or final hold.
3. Run `git status --short` and confirm raw video, QA frames, and the artifact landed only under ignored paths.
4. Return the absolute GIF path, render it when the client supports local media, and state whether the recording used a real API, fixture, or another transport. When the task does not include attaching the GIF to a pull request, stop here.

Encoder maintenance: run `python3 -m unittest discover -s "$GIF_SKILL_DIR/scripts" -p 'test_*.py' -v` with the media prerequisites installed. These local media tests do not run in repository CI.

## Publish to gif-assets

Perform this step only when the task includes attaching the GIF to a pull request.

Never commit a GIF to the pull request's own branch or any branch that merges into a long-lived branch: binary media committed there bloats the repository history for every future clone. All GIFs live on the single orphan branch `gif-assets` — a branch with no parent commit and nothing but media. Isolate recordings by path, not by extra branches: `pr/<number>/<name>.gif` for a pull request, `issue/<number>/<name>.gif` for an issue-only recording. Do not create another `*-assets` branch.

Work in a shallow scratch clone so the publication cannot touch the product working tree. Reuse `origin/gif-assets` when it exists; otherwise create the orphan branch once in that clone:

```sh
git clone --no-checkout --filter=blob:none --depth 1 <repo-url> /tmp/gif-assets-checkout
cd /tmp/gif-assets-checkout
if git ls-remote --heads origin gif-assets | grep -q gif-assets; then
  git fetch origin gif-assets --depth 1
  git checkout gif-assets
else
  git checkout --orphan gif-assets
  git rm -rf --ignore-unmatch .
fi
mkdir -p pr/<number>
cp /absolute/path/to/demo.gif pr/<number>/<name>.gif
git add pr/<number>/<name>.gif
git commit -m "assets: <what it shows> gif (#<pr>)"
git push origin gif-assets
```

Before that push, verify that `gif-assets` contains media only and that the staged GIF's checksum matches the verified local artifact. After pushing, use authenticated GitHub API or raw requests to confirm the remote path, byte size, checksum, `200` response, and `image/gif` content type. An anonymous `404` does not disprove a private-repository asset; authenticate the verification instead. This proves the repository-member review path, not public availability.

Immediately before first embedding the GIF, re-read the pull-request head and compare it with the recorded commit. Stop and re-record when it moved. After that edit, require the live head to remain at the recorded commit. If a later head retains this GIF under the impact rule above, keep the original commit provenance and record which unchanged behavior, route, and environment the GIF still demonstrates. Separately, render the body through GitHub's Markdown API and confirm that the expected `<img>` is present.

Embed the GIF in the pull request body with the raw blob URL; the `?raw=true` suffix is required, because the plain blob URL renders GitHub's file page instead of the image:

```markdown
![<alt text>](https://github.com/<owner>/<repo>/blob/gif-assets/pr/<number>/<name>.gif?raw=true)
```

Never rewrite or force-push `gif-assets`: merged pull request bodies reference its current blobs. Append new commits only. Historical `*-assets` series branches stay only while a live body still names them.
