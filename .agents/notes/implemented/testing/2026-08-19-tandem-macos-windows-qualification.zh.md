# Agent Note: Tandem 的 macOS 与 Windows 验收

Status: implemented

[English](2026-08-19-tandem-macos-windows-qualification.md) | 中文

## 问题

托管式 Tandem Browser Provider 已经能打开、导航、截图并关闭真实子进程，但既有环境门控 e2e 把宿主当作隐含的 POSIX。Windows 的 home、PATH 查找、PATHEXT、APPDATA 数据目录与 native-messaging host 扫描都与 macOS 不同。Wine 可以跑 win32 Node 工具链分支，但不是原生 Tandem 宿主。因此绿色的 fixture 套件不能声称已完成 macOS 与 Windows 验收。

## 决策

真实 Tandem 验收仍落在既有 Provider 与 `packages/browser/browser-runtime-tandem/tests/runtime.e2e.ts`。该套件在未设置 `DSH_TANDEM_CHECKOUT` 与 `DSH_TANDEM_BIN` 时仍会自动跳过。设置这两项后，它只接受 `darwin` 与 `win32`，拒绝 Wine，通过 `isolateTandemHost` 创建一个 scratch home，用该 HOME 与 `--user-data-dir` 只启动一次 Electron，并在固定 Tandem revision 上执行 create → navigate → screenshot → close。`afterEach` 会 dispose Provider 并删除 scratch home，因此用例结束后子进程不能继续存活。失败会把抛出值包装为 `<platform>: <command>: <detail>`。

`isolateTandemHost` 点名子进程实际读取的平台差异。macOS 设置 `HOME`，把 `config.json` 与 `api-token` 写到 `~/.tandem`，并把 `Library/Application Support/Tandem Browser` 作为 Electron user-data 目录；native-host 隔离覆盖该 scratch 树下的 Chrome 与 Tandem 目录。Windows 设置 `HOME`、`USERPROFILE`、`APPDATA`、`LOCALAPPDATA`、`PATH` 与 `PATHEXT`；数据目录为 `%APPDATA%/Tandem Browser`；user-data 目录为 `%LOCALAPPDATA%/Tandem Browser`；native-host 隔离覆盖 `%LOCALAPPDATA%/Google/Chrome/User Data/NativeMessagingHosts`。隔离启动器会把 Electron 目录前置到 PATH，并且绝不把 Chromium 指向操作者真实的 Tandem profile。

Wine 仍是必需的 PR win32 工具链任务（`pnpm run check:windows-wine`）。它不能通过本套件：`WINEPREFIX`、`WINELOADER` 或 `DSH_TANDEM_WINE=1` 会以 `Windows: pnpm run check:windows-wine: Wine is diagnostic only…` 失败。原生 Windows CI 负责平台矩阵。Linux 不在范围内，也不会被写成受支持的验收宿主。

本次实现在 macOS 上跑过隔离单元套件，并对固定 checkout 做过一次隔离的真实启动。子进程使用 scratch HOME 与 `--user-data-dir`；健康检查通过后，`browserRuntime.create` 以 `macOS: browserRuntime.create: Tandem HTTP request failed: TimeoutError` 失败。`afterEach` dispose 了 Provider，没有留下 Tandem Electron 子进程。复用操作者 HOME 或 Application Support profile 的启动不能作为验收证据。同一 checkout 没有原生 Windows；Wine 仅作诊断。原生 Windows 证据是 CI 的 `windows-native` 任务，以及日后在该宿主上对环境门控套件的运行。

## 考虑过的替代方案

**再发明一套浏览器栈来做平台证明。** 拒绝，因为 Browser Runtime seam 与 Tandem Provider 已经拥有 create、navigate、screenshot 与 close。并行的 Playwright 或 Electron harness 证明的是另一个子进程。

**把 Wine 当作 Windows 验收。** 拒绝，因为 Tandem 的 Windows 数据目录、native-messaging 注册表扫描、PATHEXT 查找与 Electron 宿主都需要原生内核。Wine 仍是快速的 win32 工具链诊断。

**保持 e2e 仅覆盖 POSIX，并把 Windows 写成隐含支持。** 拒绝，因为子进程在 Windows 上读取 `USERPROFILE`、`APPDATA`、`LOCALAPPDATA` 与 `PATHEXT`。隐含宿主会掩盖这些差异，也无法点名 Windows 失败。

## 结果

macOS 与 Windows 成为同一 Tandem Provider 的具名验收宿主。贡献者可以在本地用固定 checkout 运行该套件；未设置环境变量时 CI 保持绿色。Wine 不会被误当作原生 Windows 证据。Linux 保持明确不受支持。[Tandem provider Agent Note](../feature/2026-08-18-tandem-browser-runtime-provider.md) 仍负责协议、出处与重连语义。

## 验证

- `pnpm exec vitest run packages/browser/browser-runtime-tandem/tests/host.spec.ts` —— 具名平台隔离、拒绝 Wine，以及失败措辞。
- `pnpm exec vitest run --config vitest.e2e.config.ts packages/browser/browser-runtime-tandem/tests/runtime.e2e.ts` —— 在设置 `DSH_TANDEM_CHECKOUT` 与 `DSH_TANDEM_BIN` 时，于 macOS 或原生 Windows 上对隔离的真实 Tandem 执行一次打开/导航/截图/关闭；否则自动跳过。
- 原生 Windows CI（`windows-native`）负责平台矩阵；`pnpm run check:windows-wine` 仍仅用于诊断。
