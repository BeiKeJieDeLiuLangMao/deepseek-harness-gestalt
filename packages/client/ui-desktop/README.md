# `@deepseek-ai/dsh-client-ui-desktop`

English | [中文](README.zh.md)

Desktop-only Session Surface chrome. The Desktop Host `--patch` overlay inserts this row; browser `dsh web` does not. It elects the GESTALT wordmark on `sidebar.brand`, fills `sidebar.chrome.drag`, and registers the Update Control on `sidebar.footer.action`. The control mounts for an available, downloading, downloaded, or installing update and for an error after version discovery; disabled, idle, checking, and pre-discovery errors occupy no sidebar seat. Inactive phases expose their phase only through a hidden `data-desktop-updater-state` marker with no text or accessibility role; visible phases expose `data-desktop-update-control` on the button. All updater and window verbs go through `window.dshDesktop` from the Desktop Host preload.

The macOS chrome reserves 28px above the unchanged DSH sidebar header and center Session content for the native traffic lights. The Windows row spans the viewport and keeps its three caption buttons outside the drag region without changing the Session content inset. Other development platforms render no custom Window Chrome and keep their system frame.

## Model Experience

None, as this package draws Desktop chrome; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The plugin is a no-op without `window.dshDesktop`** — Update Control and Window Chrome render nothing, and the updater source stays idle.
