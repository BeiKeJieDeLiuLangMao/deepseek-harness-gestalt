# Upstream snapshot

English | [中文](UPSTREAM.zh.md)

This package is a pinned source snapshot of [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar). It is not a `vendor/` Cordis package.

- Repository: `https://github.com/omdsh-dev/DSH-better-sidebar.git`
- Branch: `main`
- Commit: `d88dcfc3a50b43d4fc8baef961a8cc75809f41a6`
- Upstream version label: `0.18.1` (`dsh.plugin.json`)
- Prefix: `packages/client/ui-better-sidebar/`

Refresh:

```sh
git fetch https://github.com/omdsh-dev/DSH-better-sidebar.git main
git diff --binary d88dcfc3a50b43d4fc8baef961a8cc75809f41a6..FETCH_HEAD \
  -- dsh.plugin.json src tsdown.config.ts \
  | git apply --3way --index --directory=packages/client/ui-better-sidebar
```

The import deliberately excludes upstream repository infrastructure, manifests, documentation, and tests; this repository owns those files. After applying the source delta, replay every row in [LOCAL-MODIFICATIONS.md](LOCAL-MODIFICATIONS.md), keep this SHA current, and leave product behavior in [`dsh-client-ui-workbench`](../ui-workbench/README.md).
