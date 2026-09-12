# External plugins

English | [中文](README.zh.md)

Pinned Git submodules of out-of-tree DeepSeek Harness plugins and foreign cores that Gestalt develops beside this repository. Each child is its own GitHub repository and release train. This directory and `catalog/` record exact revisions; they are not a pnpm workspace and not a copy of plugin source.

`vendor/` remains the home of in-tree Cordis source. `packages/` remains the home of `@deepseek-ai/dsh-*` workspaces. A plugin that Gestalt ships as a first-party harness package still belongs under `packages/`.

## Catalog

| Path | Repository | Role |
|---|---|---|
| [`catalog/cliproxyapi`](https://github.com/gestaltrun/CLIProxyAPI) | [gestaltrun/CLIProxyAPI](https://github.com/gestaltrun/CLIProxyAPI) | Exact CLIProxyAPI core pin for the Desktop-built-in account pool |

Desktop Settings owns the account-pool UI. The Host supervises the packaged core and publishes `gestalt-account-pool`. It does not download a sidecar bundle, PostgreSQL, or Redis, and it does not overwrite a user `cliproxyapi` route.

## Clone and update

A default `git clone` records the submodule SHA and leaves an empty directory until the child is initialized:

```sh
git submodule update --init --recursive
```

`git clone --recurse-submodules` initializes every child in one step. CI checkouts that need core source set `submodules: recursive` on `actions/checkout`.

A checkout that leaves `catalog/cliproxyapi/` empty has the gitlink but not the child tree. Initialize it before reading or building the core:

```sh
git submodule update --init --recursive catalog/cliproxyapi
```

Advance a pin in the same change that needs the new revision. Check out the exact commit, never a floating branch name:

```sh
git -C catalog/cliproxyapi fetch origin
git -C catalog/cliproxyapi checkout <sha>
git add catalog/cliproxyapi
```

The recorded SHA is the product pin.

## Constraints

- Do not add a catalog child to `pnpm-workspace.yaml`.
- Do not import a catalog child's TypeScript or Go through this repository's `tsconfig` paths.
- Do not rewrite history inside a submodule from a Gestalt commit; change the child repository, then move the pin.
- Desktop packaging carries the built core binary. The submodule is the source pin, not a runtime download.
