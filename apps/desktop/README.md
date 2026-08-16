# `@deepseek-ai/dsh-desktop`

English | [中文](README.zh.md)

DeepSeek Gestalt Desktop Host. Electron owns the window, menu, and GitHub auto-update. It starts bundled official Node plus `dsh web --host 127.0.0.1 --port 0 --patch ./cordis.patch.yml` and loads that loopback URL. The overlay adds the GESTALT badge, drag strip, and Update Control. Browser `dsh web` does not load the overlay.

Window exit, Ctrl+C, and smoke-test completion stop the Web Host and wait for its process to exit before Electron terminates.

On macOS, the sidebar toggle follows the traffic lights on the 28px drag row and returns to the 12px sidebar inset in fullscreen. Windows uses a full-window 36px drag row with 46px minimize, maximize, and close targets. Unsupported development platforms keep the system frame.

Dock / Start Menu cwd is the Launch Directory (`defaultWorkspace` under Application Support / `%APPDATA%`). User data stays in `~/.dsh`.

## Develop

```sh
pnpm install
pnpm gestalt:dev
```

Needs a real Node on `DSH_NODE` or `npm_node_execpath` (pnpm sets the latter). Do not point Electron at its own execPath.

## Release

Tag `gestalt-v0.1.0` and run the `Desktop Release` workflow. Mac notarizes with repository secrets; Windows NSIS is unsigned and still updates.

Local unsigned arm64 rehearsal (no notarization):

```sh
node apps/desktop/scripts/fetch-node.mjs --platform darwin --arch arm64
pnpm --filter @deepseek-ai/dsh deploy --prod --legacy apps/desktop/resources/dsh
node apps/desktop/scripts/isolate-dsh-snapshot.mjs
pnpm --filter @deepseek-ai/dsh-desktop package:unsigned
```

`pnpm deploy` of workspace packages leaves `file:` links into the monorepo. The isolate step copies those targets so the packed Web Host can resolve `dsh` outside the repo.

## Known Limitations and Deferred Work

- **Packaged extraResources Node + dsh snapshot is assembled by the release workflow** — `gestalt:dev` runs the workspace source tree.
- **Windows Authenticode is absent** — SmartScreen warns; the updater still runs.
