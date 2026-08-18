# @deepseek-ai/dsh-browser-runtime-deterministic

English | [中文](README.zh.md)

Deterministic keyless Browser Runtime Provider for one temporary Profile, one Workspace, one browser instance, and one tab. It is a runnable tracer and fixture backend, not an operating-system browser.

## Configuration

`idPrefix` controls the stable opaque fixture identities and defaults to `browser-trace`. Required `pages` entries contain `url`, `title`, `text`, and `screenshotPngBase64`; screenshot data must be non-empty canonical base64 whose decoded bytes start with the PNG signature. Empty page sets, duplicate URLs, and invalid screenshots fail plugin load.

Operations enter one serialized queue. Mutations require the current revision, while reads return the current revision without advancing it. A Provider instance admits exactly one temporary Profile lifecycle: after close, another `create` rejects with `BROWSER_CAPACITY`; after disposal starts, operations reject with `BROWSER_DISPOSED`. Disposal stops admission, drains accepted operations, and closes an open temporary Profile.

The Provider's state is authoritative. Its invariant companion seeds from that state on initial installation and hot reload, then validates identity and exact revision succession. `browser/runtime-state` is a contained post-commit notification, so a broken ordinary or invariant observer cannot make a committed operation appear to fail.

## Model Experience

Indirectly, through dsh-tool-browser, which renders every deterministic page and lifecycle fact.

#### KV Cache effect

The Provider itself contributes no request text; Consumer schemas and logged results determine cache changes.

## Known Limitations and Deferred Work

- Navigation succeeds only for configured fixture URLs; cookie persistence, human takeover, multiple identities, and native browser automation are intentionally absent.
