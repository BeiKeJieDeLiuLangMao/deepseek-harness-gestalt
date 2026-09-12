# Agent Note: 桌面与 Companion 覆盖率产物前置依赖

Status: implemented

[English](2026-09-12-desktop-companion-coverage-artifact-prereqs.md) | 中文

## 问题

在 PR #659 coverage 运行中，`apps/desktop` 中的测试在干净源码树上运行覆盖率门禁时失败：
1. 组装后的 Companion Host 测试（`apps/desktop/tests/companion-host-*.assembled.spec.ts`）在 `dsh web` 启动时失败：
   `Error: dsh: plugin tree failed to load: failed to apply loader entry typert-loader: 3 typert contributor(s) failed to register:`
   `@deepseek-ai/dsh-api-workspace-files`、`@deepseek-ai/dsh-client-file-upload` 与 `@deepseek-ai/dsh-command-feedback` 3 个包声明了指向 `lib/typert.host.js` 的 `./typert` 导出，但未包含在 `apps/desktop/tests/shipped-web-host.ts` 的 `TYPERT_PACKAGES` 清单中。
2. `apps/desktop/tests/packaged-main-bundle.spec.ts` 失败，原因是 `build-main.mjs` 无法解析 `@deepseek-ai/dsh-client-ui-desktop/protocol`。根 `tsconfig.base.json` 的 paths 映射中仅有包根别名，缺少 `./protocol` 的显式子路径别名。
3. `apps/desktop/tests/host-rpc-assembled.spec.ts` 静态引入了 `companion-product.ts`，后者在 `beforeAll` 运行 `generateDesktopHostTypertArtifacts()` 之前就静态解析 `@deepseek-ai/dsh-api-workspace-controller/remote` 与 `@deepseek-ai/dsh-api-session-controller/remote`。

## 决策

1. 在 `apps/desktop/tests/shipped-web-host.ts` 中，将 `@deepseek-ai/dsh-api-workspace-files`、`@deepseek-ai/dsh-client-file-upload` 和 `@deepseek-ai/dsh-command-feedback` 加入 `TYPERT_PACKAGES`。
2. 在 `tsconfig.base.json` 中添加显式子路径别名：
   `"@deepseek-ai/dsh-client-ui-desktop/protocol": ["./packages/client/ui-desktop/src/protocol.ts"]`
3. 在 `apps/desktop/tests/host-rpc-assembled.spec.ts` 中，将 `companion-product.ts` 的加载推迟到 `beforeAll` 中 `generateDesktopHostTypertArtifacts()` 执行之后动态导入，匹配 `companion-host-business-error.assembled.spec.ts` 中的安全模式。

## 备选方案

- **覆盖率前全量构建仓库**：在覆盖率门禁前执行 `pnpm run build` 会掩盖源码平面与产物平面的边界，违背干净检出树测试直接通过源码路径解析 workspace 依赖的不变量。

## 后果

- 在无预建 `lib/` 产物的干净检出树上，`packaged-main-bundle.spec.ts` 将 `@deepseek-ai/dsh-client-ui-desktop/protocol` 解析到源码。
- 由 `apps/desktop/tests/shipped-web-host.ts` 启动的 `dsh web` 不再因上述 3 个包缺失 typert contributor 导出而崩溃。
- `host-rpc-assembled.spec.ts` 先生成 host 产物再引入 `companion-product.ts`。
- 全量 coverage 分区中的非产物缺陷（例如第三方声明测试中缺失可选平台包）保持独立且未处理。
