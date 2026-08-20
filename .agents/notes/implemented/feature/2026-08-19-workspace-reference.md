# Agent Note: First-party Workspace References

Status: implemented

English | [中文](2026-08-19-workspace-reference.zh.md)

## Problem

The Web composer has no first-party way for a user to point at a workspace path so the model can treat that path as an explicit, validated reference. Users type or paste paths by memory. The closest shipped pieces do other jobs: [inline-code File Mentions](../feature/2026-08-07-web-inline-file-mentions.md) open files the assistant already produced; [image attachments](../feature/2026-07-22-web-multimodal-image-input-and-durable-attachments.md) persist raster bytes, not paths; [Session References](../feature/2026-07-21-cross-session-references.md) snapshot another conversation; `AGENTS.md` `@path` imports are deliberately not interpreted.

The community plugin [omdsh-dev/dsh-at-file](https://github.com/omdsh-dev/dsh-at-file) already fills the gap on Web. It is an unofficial out-of-tree bundle, not a `vendor/` candidate, and it diverges from first-party conventions (raw `node:fs`, custom `at-file-mention` source, unscoped name, committed `lib/`). First-party scan, ranking, ignore lists, and confinement include portions derived from dsh-at-file 0.6.3 (MIT); each package keeps that copyright in `NOTICE`.

## Decision

**Workspace Reference** is a first-party default on the shipped web profile. It is a user-authored pointer to one path that exists inside the current session workspace. It names the workspace-relative path and whether that path is a file or a directory. It is not the file's bytes and not the directory's children. Domain language lives in [`packages/context/CONTEXT.md`](../../../../packages/context/CONTEXT.md).

The model-visible payload is one sourced `user/message` whose text is:

```xml
<workspace-reference path="docs/spec.pdf" kind="file" />
```

`@deepseek-ai/dsh-workspace-reference` validates tokens at `agent/pre-step` with `ctx.fs`. It rejects workspace escape: absolute paths, Windows drive-relative tokens (`C:foo`), a `path.relative` result that leaves cwd, an intermediate-segment symlink whose realpath leaves cwd, and a final-component symlink. A basename such as `foo..bar.ts` is not an escaping `..` segment. It never reads file contents or lists directory children for the marker. Unknown tokens stay ordinary prose. An `@` immediately after a word character is not a path token (`user@host.com`).

The Web `@` trigger stays shared. `@deepseek-ai/dsh-client-ui-workspace-reference` registers the `workspace` `InputTriggerSource` through [`ctx.inputTriggers`](../architecture/2026-07-25-web-input-machine-and-slash-pipeline.md). A pick inserts a `ReferenceInsert` chip whose label is the basename. Submit and clipboard expand the chip to `@rel/path` (directories keep a trailing `/`) through the source codec, so the host pre-step still sees the token. ArrowRight on a highlighted directory inserts `@path/` and keeps the menu open. While paste ignore is on, pasted `@` tokens receive U+2060 so the host scanner skips them; a hand-typed existing path still becomes a marker. Settings expose enable, paste ignore, and Exact/Regex basename filters; the copy never says "File mentions". The browser ranks a session-scoped index from `workspaceReference.search` and shows at most `menuLimit` rows (default 12). The host walk uses layered `listDir` and skips built-in ignore directory names and a directory `FS_PERMISSION_DENIED`.

A Markdown Session Reference `@[label](dsh-session:…)` is never a Workspace Reference. The scanner matches `@` that is not immediately after a word character, then `[^\s@[\]]+`. The durable source is `{ kind: 'workspace-reference', path, pathKind }`, documented on [docs/subsystems/workspace-reference.md](../../../../docs/subsystems/workspace-reference.md). Transcript provenance labels the row with the path.

The web-app bundle mounts both packages. Image drop stays an attachment. The community plugin is not detected or refused; two `@` path groups appear if both remain loaded.

## Deferred

The product-visible Web GIF for the basename chip, paste ignore, folder descent, and settings is recorded from this ticket's pull-request runtime by the delivery flow before merge and attached to that PR.

## Alternatives considered

- **Vendor dsh-at-file under `vendor/`.** Vendoring is the pinned Cordis framework layer. This plugin is a DSH product feature that must pass first-party gates, use `ctx.fs`, and ship a scoped workspace package.

- **Depend on the GitHub tarball or a future npm publish.** The package is unpublished, single-maintainer, and peer-locked to DSH internals.

- **Copy the repository into `packages/` unchanged.** The unscoped name, committed `lib/`, custom esbuild, raw `node:fs`, and custom message source fail first-party layout.

- **Inject file bytes or a directory listing at submit time.** dsh-at-file already retreated from that design. The archived TUI `@path` feature rejected the same idea.

- **Picker only, with no Host marker.** Hand-typed `@src/foo.ts` and replay would lose the validated reference.

- **One dual-entry package, or a full capability seam.** A dual-entry package ties the Node index to React. A seam needs a second Service Provider; none exists.

- **`{ kind: 'plugin' }` source, or a new session event.** Plugin id is not the producer identity; the path is.

- **Scan every host's user text in the first landing.** The community product is Web-only.

- **Reuse the source name `at-file` to mutex the community plugin.** First-party identifiers should not encode an unofficial package name.

- **Keep `@path` visible in the composer.** The chip is the UI projection; serialize still emits `@path` for host scan. A refresh restores the clipboard form.

## Consequences

Users who leave the community plugin installed see two `@` path groups until they remove it. The private index walk can omit paths beyond `maxIndexedFiles` and can disagree with `gitignore`. Some users will expect `@` or a file drop to attach bytes; the marker text and the existing unsupported-drop path keep that from becoming content injection.

The headless Loader composition pins the sourced marker. Keyless Web snapshots pin the `@` picker menu, the basename chip insert, paste ignore, folder descent, and the settings section.

## Testing

- Package unit coverage on host scan, ranking, index, and the browser source.
- `packages/context/workspace-reference/tests/workspace-reference.e2e.ts` sends `@README.md` through a real Loader composition and asserts the sourced marker.
- `apps/web/tests/workspace-reference-picker.e2e.ts` snapshots the Workspace `@` menu after typing a seeded basename, asserts a pick inserts a basename chip (`U+FFFC` plus the label) whose serialize/clipboard form is `@rel/path`, and snapshots paste ignore, folder descent, and the settings section.
