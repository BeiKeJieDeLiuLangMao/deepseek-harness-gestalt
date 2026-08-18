# @deepseek-ai/dsh-browser-runtime-deterministic

English | [中文](README.zh.md)

Deterministic keyless Browser Runtime Provider for temporary and named persistent Browser Profiles. Each Profile still has one Workspace, one browser instance, and one tab. It is a runnable store and fixture backend, not an operating-system browser.

## Configuration

`idPrefix` controls the stable opaque fixture identities and defaults to `browser-trace`. Required `pages` entries contain `url`, `title`, `text`, and `screenshotPngBase64`; screenshot data must be non-empty canonical base64 whose decoded bytes start with the PNG signature. Empty page sets, duplicate URLs, and invalid screenshots fail plugin load.

Operations enter one serialized queue. Mutations require the current revision of the addressed target, while reads return that revision without advancing it. A named persistent Profile restores cookies, localStorage, IndexedDB, cache, and service-worker facts through a stable `persist:session-*` partition. Temporary Profiles receive unique partitions, empty storage, and no address-field label. A second open writer of the same named Profile rejects with `BROWSER_PROFILE_BUSY`. After disposal starts, operations reject with `BROWSER_DISPOSED`. Disposal stops admission, drains accepted operations, and closes every open Profile.

The Provider's state is authoritative. Its invariant companion seeds from that state on initial installation and hot reload, then registers a synchronous pre-commit validator for identity, exact revision succession, and terminal closure. A failed invariant leaves the previous state authoritative. `browser/runtime-state` is a contained post-commit notification, so a broken ordinary observer cannot make a committed operation appear to fail.

## Model Experience

Indirectly, through dsh-tool-browser, which renders every deterministic page and lifecycle fact.

#### KV Cache effect

The Provider itself contributes no request text; Consumer schemas and logged results determine cache changes.

## Known Limitations and Deferred Work

- Navigation succeeds only for configured fixture URLs; human takeover, multiple tabs, and native browser automation remain absent.
