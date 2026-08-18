# Agent Note: First-party Workspace References

Status: proposed

English | [中文](2026-08-19-workspace-reference.zh.md)

## Problem

The Web composer has no first-party way for a user to point at a workspace path so the model can treat that path as an explicit, validated reference. Users type or paste paths by memory. The closest shipped pieces do other jobs: [inline-code File Mentions](../../implemented/feature/2026-08-07-web-inline-file-mentions.md) open files the assistant already produced; [image attachments](../../implemented/feature/2026-07-22-web-multimodal-image-input-and-durable-attachments.md) persist raster bytes, not paths; [Session References](../../implemented/feature/2026-07-21-cross-session-references.md) snapshot another conversation; `AGENTS.md` `@path` imports are deliberately not interpreted.

The community plugin [omdsh-dev/dsh-at-file](https://github.com/omdsh-dev/dsh-at-file) already fills the gap on Web: type `@` to search the workspace, insert `@rel/path`, and inject an existence-only marker before the step. It is an unofficial out-of-tree bundle, not a `vendor/` candidate, and it diverges from first-party conventions (raw `node:fs`, custom `at-file-mention` source, unscoped name, committed `lib/`). Absorbing it as a pin or npm dependency would import that divergence. Reinventing the product from scratch would throw away a token grammar, ranking, paste protection, and ignore table that already match what users expect.

## Proposal

Ship **Workspace Reference** as a first-party default on the web profile. A Workspace Reference is a user-authored pointer to one path that exists inside the current session workspace. It names the workspace-relative path and whether that path is a file or a directory. It is not the file's bytes and not the directory's children. Domain language lives in [`packages/context/CONTEXT.md`](../../../../packages/context/CONTEXT.md).

The model-visible payload is one sourced `user/message` whose text is:

```xml
<workspace-reference path="docs/spec.pdf" kind="file" />
```

The Host confirms existence with `ctx.fs.lstat`, rejects workspace escape and final-component symlinks, and never reads file contents or lists directory children for the marker. The agent inspects the path with the session's existing tools when the task requires it. Unknown tokens stay ordinary prose. This is the same path-only stance the deleted TUI `@path` feature recorded in [its archived note](../../archived/feature/2026-07-23-tui-file-reference-autocomplete.md), and the same stance dsh-at-file took from 0.3.0 onward after dropping submit-time content injection.

User-visible Web behavior aligns with dsh-at-file 0.6.3: `@` picker, ArrowRight directory descent, composer dock, ignore of pasted `@` tokens by default, built-in ignored directory names, Exact/Regex basename filters, and hand-typed `@path` tokens that resolve inside the workspace. Architecture does not: first-party packages replace the plugin's wiring.

## Product contract

The Web `@` trigger stays shared. The first-party `InputTriggerSource` is named `workspace`, not `at-file`. It registers beside `subagent` and the optional cordis catalog through [`ctx.inputTriggers`](../../implemented/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md). A pick inserts plain-text `@rel/path` (directories keep a trailing `/`) plus a trailing space. Draft chips stay lexicon decorations; submit does not use U+FFFC `ReferenceInsert` serialization.

The Host scanner runs only in the web profile for the first landing. It scans `source.kind === 'user'` text. A Markdown Session Reference `@[label](dsh-session:…)` is never a Workspace Reference. Only a bare `@[^\s@[\]]+` token is a candidate, and only after `lstat` proves the path exists inside `session.header.cwd`.

The durable source is a dedicated `MessageSourceMap` kind `{ kind: 'workspace-reference', … }` carrying the relative path and `file` / `directory`. It is not `{ kind: 'plugin', plugin: '…' }` and not a new session event type. Transcript provenance can name the path the same way it names a Session Reference or skill invocation.

Settings copy must not say "File mentions". The community plugin's settings namespace and Typert namespace stay out of first-party identifiers.

## Absorption

Treat dsh-at-file as a specification and a source of tested pure functions, not as a repository to vendor or depend on. [Vendoring](../../implemented/process/2026-06-11-vendor-cordis-as-source.md) is the Cordis framework pin. [Preferring a dependency](../../implemented/process/2026-07-26-dependencies-over-hand-rolling.md) requires a maintained package that deletes owned code; this plugin is an unofficial single-maintainer bundle that peers onto unpublished DSH internals and is not on npm.

Port under MIT attribution: token scan and dedup, filename and path-segment ranking, built-in ignore directory names, Exact/Regex basename rules, paste word-joiner protection, XML attribute escape, and workspace-escape rejection. Rewrite host `apply`, Typert registration, settings, the client plugin, and the index walk. Existence and listing go through `ctx.fs` (`lstat`, layered `listDir`). Do not add a recursive index primitive to the filesystem seam. A single-directory `EPERM` skips that directory; it must not abort the whole index (dsh-at-file issue #19).

## Package cut

Two packages, not a capability seam and not one dual-entry plugin:

- `@deepseek-ai/dsh-workspace-reference` in `packages/context/workspace-reference` owns scan, validation, injection, the private index walk, the Typert search/settings remotes, and settings.
- `@deepseek-ai/dsh-client-ui-workspace-reference` in `packages/client/ui-workspace-reference` owns the picker, dock, folder navigator, settings section, and locale.

The web-app bundle mounts both. Other profiles do not mount the pre-step listener in the first landing. There is one Web consumer and one local walk; a second Index Provider is not in evidence.

## Coexistence

Image drop and paste remain attachments. Dropping a PDF is still an unsupported attachment, not a Workspace Reference. First landing does not turn a file drop into a path pointer.

Users who already installed the community plugin keep that bundle until they remove it. First-party registration does not use the source name `at-file`, so `registerSource` will not collide. Two pickers appear if both remain loaded; the upgrade note tells users to `dsh plugin --profile web remove dsh-at-file`. First-party code does not detect or refuse the community package.

`AGENTS.md` `@path` imports stay uninterpreted. The scanner never reads instruction files.

## Alternatives considered

- **Vendor dsh-at-file under `vendor/`.** Vendoring is the pinned Cordis framework layer. This plugin is a DSH product feature that must pass first-party gates, use `ctx.fs`, and ship a scoped workspace package.

- **Depend on the GitHub tarball or a future npm publish.** The package is unpublished, single-maintainer, and peer-locked to DSH internals. A version skew becomes a broken picker, not a deleted owned surface.

- **Copy the repository into `packages/` unchanged.** The unscoped name, committed `lib/`, custom esbuild, raw `node:fs`, custom message source, and `ctx.reflect.get('remote.atFile')` workaround fail first-party layout, coverage, and Loader composition rules.

- **Inject file bytes or a directory listing at submit time.** dsh-at-file already retreated from that design. It bypasses `read` / `read_image`, sandbox observation, and byte budgets, and it puts PDFs and binaries on the prompt. The archived TUI `@path` feature rejected the same idea.

- **Picker only, with no Host marker.** Hand-typed `@src/foo.ts` and replay would lose the validated reference. Pasted decoy `@path` tokens could not be distinguished from a real gesture without the Host check plus paste ignore.

- **One dual-entry package, or a full capability seam.** A dual-entry package ties the Node index to React. A seam needs a second Service Provider; none exists.

- **`{ kind: 'plugin' }` source, or a new session event.** Plugin id is not the producer identity; the path is. The marker is another sourced `user/message`, the same as skill invocation and Session Reference.

- **Scan every host's user text in the first landing.** The community product is Web-only. Scanning ACP or SDK text would turn an accidental `@token` that happens to name a workspace file into a reference.

- **Reuse the source name `at-file` to mutex the community plugin.** Load order would decide who wins. First-party identifiers should not encode an unofficial package name.

- **Structured `ReferenceInsert` chips for the first landing.** The input machine's current shipped path is plain-text `@path`. The plugin inserts the same literal. Chip serialization is an independent `@` consumption change.

## Acceptance criteria

- Shipped web profile: typing `@` lists workspace files and directories; picking one inserts `@rel/path`; the dock can open or remove it; ArrowRight enters a directory; Settings expose enable, paste ignore, and Exact/Regex filters without the phrase "File mentions".
- A submitted prompt that contains a validated `@path` records a `user/message` whose source kind is `workspace-reference` and whose text is the `<workspace-reference>` marker only. File bytes and directory children are absent from that message and from the model request.
- Missing paths, absolute paths, workspace escapes, and final-component symlinks stay prose. Markdown `@[label](dsh-session:…)` stays a Session Reference candidate, never a Workspace Reference.
- Pasted `@path` does not create a marker while paste ignore is on. A hand-typed path that exists inside the workspace still does.
- `ctx.fs.lstat` / layered `listDir` are the only filesystem entry points. A directory `EPERM` omits that directory and continues.
- Keyless Web snapshots pin picker, dock, paste ignore, and the model-visible marker. A Loader REAL-composition test mounts the web rows. Package tests cover scan grammar, ranking, ignore rules, and confinement.
- The English and Chinese package READMEs, `context-provenance` labeling, and the request-context glossary stay aligned with this name.

## Risks

Users who leave the community plugin installed will see two `@` path groups until they remove it. The upgrade note is the mitigation; runtime mutex is not.

A sloppy scanner that treats `@[label](uri)` as a path will corrupt a future Web Session Reference landing and can already mangle pasted session mention text.

The private index walk can still omit paths beyond `maxIndexedFiles` and still disagree with `gitignore`. Those limits are inherited from the community product and stay documented.

Some users will expect `@` or a file drop to attach bytes, especially for PDFs. The marker text and the existing unsupported-drop path must keep that expectation from silently becoming content injection.
