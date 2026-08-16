# `@deepseek-ai/dsh-client-ui-desktop`

English | [中文](README.zh.md)

Desktop-only Session Surface chrome. The Desktop Host `--patch` overlay inserts this row; browser `dsh web` does not. It elects the GESTALT wordmark on `sidebar.brand`, fills `sidebar.chrome.drag`, and registers the Update Control on `sidebar.footer.action`. All updater and window verbs go through `window.dshDesktop` from the Desktop Host preload.

The macOS drag row clears the native traffic lights before placing the sidebar toggle. The Windows row spans the viewport and keeps its three caption buttons outside the drag region. Fullscreen hides the macOS traffic lights and returns the toggle to the sidebar inset.

## Model Experience

None, as this package draws Desktop chrome; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The plugin is a no-op without `window.dshDesktop`** — Update Control renders nothing and the updater source stays idle; the drag strip still occupies 36px if the row is mounted.
