# Agent Note: 恢复不得把 `aliyun oss cat` 标准输出当作持久文档

Status: implemented

[English](2026-09-10-platform-recover-oss-cat-json-extract.md) | 中文

## Problem

Platform Deploy 的 recovery 与未完成部署探测会把 `aliyun oss cat` 的标准输出交给 `jq`。ossutil `cat` 可能在合法的 `active-state.json` 对象前后打印耗时行。`jq` 随后拒绝该标准输出，rollbackable 锁无法恢复，操作者只能手工删除该对象。

## Decision

`apps/platform/scripts/platform-oss-json.sh` 中的 `platform_extract_json_object` 从第一个 `{` 起取出一份对象，并拒绝随后的 JSON 值。剩余的非 JSON CLI 附言不是权威。该 helper 优先使用 `python3`，其次 `python`，再次 `node`，因为 Windows Git Bash 的 recovery 测试没有 `python3`。`platform-recover.sh` 始终 source 该 helper，并在读取持久字段前把成功的 `oss cat` 标准输出经它过滤。未完成部署探测仍用合并后的标准输出与标准错误检测 `StatusCode=404`；退出码为 0 的探测必须仍能提取一份 JSON 对象，才算存在未完成锁。

## Alternatives considered

**把 `oss cat` 标准输出当作裸 JSON 文档。** 已否决，因为固定的 Alibaba Cloud CLI 3.4.11 ossutil `cat` 可能在对象前加上耗时行，使 `jq` 失败，而对象本身仍是合法 JSON。

**用 grep 剥掉已知 ossutil 横幅。** 已否决，因为横幅文本不是契约；从第一个 `{` 做 `raw_decode` 可接受任意非 JSON 剩余，并仍对第二份 JSON 值 fail closed。

**在主机已健康后手工删除 OSS 对象来恢复。** 已否决，因为持久锁才是 recovery 权威；锁仍有意义时删除它会跳过 predecessor 恢复。

## Consequences

- 锁对象前后的 CLI 耗时行仍可恢复，并仍会删除 `active-state.json`。
- 第二份 JSON 值会 fail closed，且不删除该锁。
- 退出码为 0 但不是一份 JSON 对象的 `oss cat` 视为无法判定的锁，而不是缺失对象。
- 对 `jq` 打桩的 recovery 测试保持该桩，但 chatter 用例会解析提取后的文档：有 `jq` 时用真实 `jq`，否则用 `node`。
- 持久字段读取会去掉 CR，因此 Git Bash 下 `jq` 的 CRLF 行仍能与 `PLATFORM_ECS_INSTANCE_IDS` 对齐。
- 没有 `python3` 的主机仍可通过 `python` 或 `node` 提取。

## Testing

`apps/platform/tests/production-env.spec.ts` 覆盖前缀 chatter（`0.006891(s) elapsed`）、后缀 chatter（`average: 419(byte/s)`）、额外 JSON 拒绝，以及不变的 rollbackable / commit-pending / committed / bootstrap 阶段顺序。
