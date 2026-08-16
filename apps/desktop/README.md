# `@deepseek-ai/dsh-desktop`

English | [中文](README.zh.md)

DeepSeek Gestalt Desktop Host. Electron owns the window, menu, and GitHub auto-update. It starts bundled official Node plus `dsh web --host 127.0.0.1 --port 0 --patch ./cordis.patch.yml` and loads that loopback URL. The overlay adds the GESTALT badge, drag strip, and Update Control; the control remains absent until an update is actionable or an error follows version discovery. Browser `dsh web` does not load the overlay.

Window exit, Ctrl+C, and smoke-test completion cancel any pending start, stop the Web Host, and wait for its process to exit before Electron terminates. Startup or a later crash gets one retry before the window shows the Host error.

The main window accepts navigation only within the active loopback Host origin. Ordinary HTTP links open in the system browser; other origins and schemes cannot replace the Session Surface or create another Electron window.

On macOS, a 28px top inset keeps the unchanged DSH sidebar header below the traffic lights. Windows uses a full-window 36px drag row with 46px minimize, maximize, and close targets. Unsupported development platforms keep the system frame.

Desktop owns `build/icon.icns`, `build/icon.ico`, and `build/icon.png` as byte-for-byte copies of the tracked 千机·Gestalt production artwork. electron-builder uses the ICNS for macOS and edits the ICO resources into the unsigned Windows executable; the release workflow verifies the largest source ICO frame in that PE file. The PNG supplies the unpackaged macOS Dock icon and the Windows runtime window icon. The packaged PNG is an explicit extra resource rather than an implicit build-resource lookup.

Dock / Start Menu cwd is the Launch Directory (`defaultWorkspace` under Application Support / `%APPDATA%`). User data stays in `~/.dsh`.

## Develop

```sh
pnpm install
pnpm gestalt:dev
```

Needs a real Node on `DSH_NODE` or `npm_node_execpath` (pnpm sets the latter). Do not point Electron at its own execPath.

## Release

Run the `Desktop Release` workflow from `master` with the package version and `publish` selected. macOS arm64 and x64 install dependencies on matching GitHub runner architectures; publish builds use the `desktop-release` environment to sign and notarize, while dry runs receive no release credentials. Windows NSIS is unsigned and still updates. The workflow verifies each official Node archive, starts every packaged target, round-trips the disabled updater status through the Desktop bridge while requiring the inactive Update Control to remain absent, checks the signed and stapled Mac applications, creates the `gestalt-v<version>` tag and a draft Release at the tested commit, uploads and verifies the exact installer, blockmap, and updater-feed set, then publishes the Release. A failed or interrupted handoff removes the tag and draft owned by that run. Downloaded updates install only after the user selects Install and restart.

Local unsigned arm64 rehearsal (no notarization):

```sh
node apps/desktop/scripts/fetch-node.mjs --platform darwin --arch arm64
pnpm --ignore-scripts --config.node-linker=hoisted --config.inject-workspace-packages=true \
  --filter @deepseek-ai/dsh deploy --prod apps/desktop/resources/dsh
node apps/desktop/scripts/isolate-dsh-snapshot.mjs
pnpm --filter @deepseek-ai/dsh-desktop package:unsigned
```

The hoisted deploy includes workspace packages without pnpm's linked virtual dependency graph. `pnpm deploy` still leaves a small number of `file:` links into the monorepo; the isolate step copies those targets so the packed Web Host can resolve `dsh` outside the repo and the Windows installer never archives directory junctions.

## Known Limitations and Deferred Work

- **Packaged extraResources Node + dsh snapshot is assembled by the release workflow** — `gestalt:dev` runs the workspace source tree.
- **Windows Authenticode is absent** — SmartScreen warns; the updater still runs.
