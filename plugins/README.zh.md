# 外部插件

[English](README.md) | 中文

Gestalt 在本仓库旁开发的树外 DeepSeek Harness 插件与外部核心，以 Git submodule 钉住精确修订。每个子目录是独立的 GitHub 仓库和发布列车。`plugins/` 与 `catalog/` 是修订目录，不是 pnpm workspace，也不是插件源码的副本。

`vendor/` 仍是树内 Cordis 源码的位置。`packages/` 仍是 `@deepseek-ai/dsh-*` workspace 的位置。Gestalt 作为一等 harness 包交付的插件仍属于 `packages/`。

## 目录

| 路径 | 仓库 | 职责 |
|---|---|---|
| [`catalog/cliproxyapi`](https://github.com/gestaltrun/CLIProxyAPI) | [gestaltrun/CLIProxyAPI](https://github.com/gestaltrun/CLIProxyAPI) | Desktop 内置账号池所用 CLIProxyAPI 核心的精确钉住点 |

Desktop Settings 拥有账号池 UI。Host 监督打包后的核心并发布 `gestalt-account-pool`。它不下载 sidecar 组合包、PostgreSQL 或 Redis，也不覆盖用户自有的 `cliproxyapi` 路由。

## 克隆与更新

默认 `git clone` 只记录 submodule SHA，子目录在初始化前为空：

```sh
git submodule update --init --recursive
```

`git clone --recurse-submodules` 一次初始化全部子模块。需要核心源码的 CI checkout 在 `actions/checkout` 上设置 `submodules: recursive`。

若 checkout 后 `catalog/cliproxyapi/` 仍为空，说明只有 gitlink、没有子树。阅读或构建核心前先初始化：

```sh
git submodule update --init --recursive catalog/cliproxyapi
```

在需要新修订的同一次变更中前移钉住的 SHA。检出精确 commit，不要用浮动分支名：

```sh
git -C catalog/cliproxyapi fetch origin
git -C catalog/cliproxyapi checkout <sha>
git add catalog/cliproxyapi
```

记录的 SHA 才是产品钉住点。

## 约束

- 不要把目录子项加入 `pnpm-workspace.yaml`。
- 不要通过本仓库的 `tsconfig` paths 导入目录子项的 TypeScript 或 Go。
- 不要从 Gestalt 提交改写 submodule 内部历史；先改子仓库，再移动钉住点。
- Desktop 打包携带已构建的核心二进制。submodule 是源码钉住点，不是运行时下载。
