# @deepseek-ai/dsh-tool-browser

English | [中文](README.zh.md)

Model-facing Consumer for `ctx.browserRuntime`. It registers `browser_create`, `browser_navigate`, `browser_observe`, `browser_screenshot`, `browser_focus`, and `browser_close` as ordinary deferred tools.

## Configuration

`timeoutMs` is the positive safe-integer cooperative timeout for every call and defaults to `30000`. Invalid values fail plugin load. The Consumer requires the Browser Runtime and tool registry; registration fails loud when `toolSearch` is disabled.

`tool_search` returns matching schemas but never activates tools. Eligibility remains the only discovery and dispatch authority. The tools omit custom presenters, so Host clients use the same generic MCP-style tool card path as other ordinary tools.

## Model Experience

### Browser tool discovery and results

#### What the model sees

The initial tool list omits all six Browser tools and includes the ordinary `tool_search` schema. A search for browser capabilities returns the exact schemas in a durable result. Later requests revalidate those names against current eligible deferred definitions. Every operation result renders all Profile, Workspace, browser, tab, revision, page, screenshot, focus, and close facts as JSON text.

#### Token effect

Discovery adds the selected schemas to the search result and later request headers. Each operation adds its complete rendered JSON result to Session history.

#### KV Cache effect

The first request keeps the large Browser schemas out of the prefix. Discovery changes the next request's tool list, and subsequent append-only results preserve reuse after that changed prefix.

## Known Limitations and Deferred Work

- The Consumer exposes the one temporary-Profile tracer only and adds no account picker, Browser Dock, persistent-profile policy, or browser-specific conversation card.
