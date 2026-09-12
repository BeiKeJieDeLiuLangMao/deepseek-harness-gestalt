# 桌面与 Companion 覆盖率产物前置依赖

[English](2026-09-12-desktop-companion-coverage-artifact-prereqs.md) | 中文

日期: 2026-09-12
状态: implemented
领域: testing

## 上下文

在 PR #659 coverage 运行中，`apps/desktop` 中的测试在干净源码树上运行覆盖率门禁时失败：
1. 组装后的 Companion Host 测试（`apps/desktop/tests/companion-host-*.assembled.spec.ts`）在 `dsh web` 启动时失败：
   `Error: dsh: plugin tree failed to load: failed to apply loader entry typert-loader: 3 typert contributor(s) failed to register`
   `@deepseek-ai/dsh-api-workspace-files`、`@deepseek-ai/dsh-client-file-upload` 与 `@deepseek-ai/dsh-command-feedback` 3 个包声明了指向 `lib/typert.host.js` 的 `./typert` 导出，但未包含在 fixture helper 在启动测试 web host 前生成 host typert 产物的 `TYPERT_PACKAGES` 清单中。
2. `apps/desktop/tests/packaged-main-bundle.spec.ts` 失败，原因是 `build-main.mjs` 无法解析 `@deepseek-ai/dsh-client-ui-desktop/protocol`。该包导出 `./protocol: "./lib/protocol.js"`，但根 `tsconfig.base.json` 的 paths 映射中仅有 `"@deepseek-ai/dsh-client-ui-desktop": ["./packages/client/ui-desktop/src"]`，缺少 `./protocol` 的显式子路径别名。在没有构建 `lib/` 产物时，esbuild 无法解析该子路径导入。

## 决策

1. 在 `apps/desktop/tests/shipped-web-host.ts` 中，将 `@deepseek-ai/dsh-api-workspace-files`、`@deepseek-ai/dsh-client-file-upload` 和 `@deepseek-ai/dsh-command-feedback` 加入 `TYPERT_PACKAGES`。在 `beforeAll` 阶段执行 `generateDesktopHostTypertArtifacts()` 时，会在干净树上直接向各包 `lib/` 目录生成其 `typert.host.js` 与 `typert.remote-client.js` 产物。
2. 在 `tsconfig.base.json` 中添加显式子路径别名：
   `"@deepseek-ai/dsh-client-ui-desktop/protocol": ["./packages/client/ui-desktop/src/protocol.ts"]`
   使 esbuild 与 TypeScript 源码工具直接将 `./protocol` 解析到源码文件，无需依赖预构建的 `lib/` 产物。

## 后果

- 在干净未构建的检出树上，`apps/desktop/tests/packaged-main-bundle.spec.ts` 可干净构建 `main.mjs`，不会因缺失包导出而失败。
- 由 `apps/desktop/tests/shipped-web-host.ts` 启动的 `dsh web` 不再因文件上传、工作区文件和命令反馈包的 typert contributor 导出缺失而崩溃退出。
- 未在 coverage 之前插入全量构建步骤，保持了源码平面的解析一致性。
