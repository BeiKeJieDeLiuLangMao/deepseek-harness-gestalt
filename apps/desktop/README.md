# `@deepseek-ai/dsh-desktop`

English | [中文](README.zh.md)

DeepSeek Gestalt Desktop Host. Electron owns the window, menu, and GitHub auto-update. It starts bundled official Node plus `dsh web --host 127.0.0.1 --port 0 --patch ./cordis.patch.yml` and loads that loopback URL. The overlay adds the GESTALT badge, drag strip, and Update Control. Browser `dsh web` does not load the overlay.

Window exit, Ctrl+C, and smoke-test completion cancel any pending start, stop the Web Host, and wait for its process to exit before Electron terminates. Startup or a later crash gets one retry before the window shows the Host error.

The main window accepts navigation only within the active loopback Host origin. Ordinary HTTP links open in the system browser; other origins and schemes cannot replace the Session Surface or create another Electron window.

On macOS, a 28px top inset keeps the unchanged DSH sidebar header below the traffic lights. Windows uses a full-window 36px drag row with 46px minimize, maximize, and close targets. Unsupported development platforms keep the system frame.

Dock / Start Menu cwd is the Launch Directory (`defaultWorkspace` under Application Support / `%APPDATA%`). User data stays in `~/.dsh`.

## Develop

```sh
pnpm install
pnpm gestalt:dev
```

Needs a real Node on `DSH_NODE` or `npm_node_execpath` (pnpm sets the latter). Do not point Electron at its own execPath.

## Release

Run the `Desktop Release` workflow from `master` with the package version and `publish` selected. macOS arm64 and x64 install dependencies on matching GitHub runner architectures; publish builds use the `desktop-release` environment to sign and notarize, while dry runs receive no release credentials. Windows NSIS is unsigned and still updates. The workflow verifies each official Node archive, starts every packaged target, checks the signed and stapled Mac applications, uploads the exact installer, blockmap, and updater-feed set to a draft, then publishes the `gestalt-v<version>` tag and Release. Downloaded updates install only after the user selects Install and restart.

Local unsigned arm64 rehearsal (no notarization):

```sh
node apps/desktop/scripts/fetch-node.mjs --platform darwin --arch arm64
pnpm --ignore-scripts --filter @deepseek-ai/dsh deploy --prod --legacy apps/desktop/resources/dsh
node apps/desktop/scripts/isolate-dsh-snapshot.mjs
pnpm --filter @deepseek-ai/dsh-desktop package:unsigned
```

`pnpm deploy` of workspace packages leaves `file:` links into the monorepo. The isolate step copies those targets so the packed Web Host can resolve `dsh` outside the repo.

## Known Limitations and Deferred Work

- **Packaged extraResources Node + dsh snapshot is assembled by the release workflow** — `gestalt:dev` runs the workspace source tree.
- **Windows Authenticode is absent** — SmartScreen warns; the updater still runs.
