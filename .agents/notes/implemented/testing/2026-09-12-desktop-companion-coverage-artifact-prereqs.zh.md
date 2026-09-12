# Agent Note: 桌面与 Companion 覆盖率产物前置依赖

Status: implemented

[English](2026-09-12-desktop-companion-coverage-artifact-prereqs.md) | 中文

## 问题

在 PR #659 coverage 运行中，`apps/desktop` 中的测试在干净源码树上运行覆盖率门禁时失败：
1. 组装后的 Companion Host 测试（`apps/desktop/tests/companion-host-*.assembled.spec.ts`）在 `dsh web` 启动时失败：`Error: dsh: plugin tree failed to load: failed to apply loader entry typert-loader: 3 typert contributor(s) failed to register:` `@deepseek-ai/dsh-api-workspace-files`、`@deepseek-ai/dsh-client-file-upload` 与 `@deepseek-ai/dsh-command-feedback` 3 个包声明了指向 `lib/typert.host.js` 的 `./typert` 导出，但未包含在 `apps/desktop/tests/shipped-web-host.ts` 的 `TYPERT_PACKAGES` 清单中。
2. `apps/desktop/tests/packaged-main-bundle.spec.ts` 失败，原因是 `build-main.mjs` 让 esbuild 自动发现 `apps/desktop/tsconfig.json`。经 workspace 源码到达的导入随后按包 exports 解析，要求预先存在 `lib/` 产物，而不是使用仓库源码解析 paths；同时也缺少 `@deepseek-ai/dsh-client-ui-desktop/protocol` 的显式源码别名。
3. `apps/desktop/tests/host-rpc-assembled.spec.ts` 静态引入了 `companion-product.ts`，后者在 `beforeAll` 运行 `generateDesktopHostTypertArtifacts()` 之前就静态解析 `@deepseek-ai/dsh-api-workspace-controller/remote` 与 `@deepseek-ai/dsh-api-session-controller/remote`。

## 决策

1. 在 `apps/desktop/tests/shipped-web-host.ts` 中，将 `@deepseek-ai/dsh-api-workspace-files`、`@deepseek-ai/dsh-client-file-upload` 和 `@deepseek-ai/dsh-command-feedback` 加入 `TYPERT_PACKAGES`。
2. 在 `tsconfig.base.json` 中添加显式子路径别名 `"@deepseek-ai/dsh-client-ui-desktop/protocol": ["./packages/client/ui-desktop/src/protocol.ts"]`。
3. 在 `apps/desktop/scripts/build-main.mjs` 的每次 esbuild 调用中显式传入根 `tsconfig.base.json`，使 workspace 导入不受 importer 位置影响，统一通过仓库源码解析门面解析。
4. 在 `apps/desktop/tests/packaged-main-bundle.spec.ts` 中，通过 `beforeAll` 显式声明 `generateDesktopHostTypertArtifacts()` 局部前置生成。在没有预建 Cordis、Schemastery、deque、timeout 或 Typert protocol `lib/` 目录的专属检出树中验证源码解析；常规并行测试不修改仓库级构建产物。
5. 在 `apps/desktop/tests/host-rpc-assembled.spec.ts` 中，将 `companion-product.ts` 的加载推迟到 `beforeAll` 中 `generateDesktopHostTypertArtifacts()` 执行之后动态导入，匹配 `companion-host-business-error.assembled.spec.ts` 中的安全模式。

## 备选方案

- **覆盖率前全量构建仓库**：在覆盖率门禁前执行 `pnpm run build` 会掩盖源码平面与产物平面的边界，违背干净检出树测试直接通过源码路径解析 workspace 依赖的不变量。

## 后果

- 在无基础 `lib/` 产物的干净检出树上，`packaged-main-bundle.spec.ts` 自主生成所需 Typert remote 产物，并通过根源码 paths 打包 workspace 依赖，实现独立测试通过。
- 由 `apps/desktop/tests/shipped-web-host.ts` 启动的 `dsh web` 不再因上述 3 个包缺失 typert contributor 导出而崩溃。
- `host-rpc-assembled.spec.ts` 先生成 host 产物再引入 `companion-product.ts`，解决了加载期找不到 remote 的前置报错（运行期业务断言保持独立跟踪）。
- 全量 coverage 分区中的非产物缺陷（例如第三方声明测试中缺失可选平台包）保持独立且未处理。
