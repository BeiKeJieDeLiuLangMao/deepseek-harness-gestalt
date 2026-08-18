# @deepseek-ai/dsh-browser-runtime-deterministic

English | [中文](README.zh.md)

Deterministic keyless Browser Runtime Provider for one temporary Profile, one Workspace, one browser instance, and one tab. It is a runnable tracer and fixture backend, not an operating-system browser.

## Configuration

`idPrefix` controls the stable opaque fixture identities and defaults to `browser-trace`. Required `pages` entries contain `url`, `title`, `text`, and `screenshotPngBase64`. Empty page sets, duplicate URLs, and invalid base64 fail plugin load.

Operations enter one serialized queue. Mutations require the current revision, while reads return the current revision without advancing it. Disposal stops admission, drains accepted operations, closes an open temporary Profile, and leaves the Provider unusable.

## Model Experience

Indirectly, through dsh-tool-browser, which renders every deterministic page and lifecycle fact.

#### KV Cache effect

The Provider itself contributes no request text; Consumer schemas and logged results determine cache changes.

## Known Limitations and Deferred Work

- Navigation succeeds only for configured fixture URLs; cookie persistence, human takeover, multiple identities, and native browser automation are intentionally absent.
