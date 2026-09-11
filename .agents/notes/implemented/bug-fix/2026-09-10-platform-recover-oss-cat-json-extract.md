# Agent Note: Recover cannot treat `aliyun oss cat` stdout as the durable document

Status: implemented

English | [中文](2026-09-10-platform-recover-oss-cat-json-extract.zh.md)

## Problem

Platform Deploy recovery and the unresolved-lock probe feed `aliyun oss cat` stdout to `jq`. ossutil `cat` may print timing lines around a valid `active-state.json` object. `jq` then rejects that stdout, so a rollbackable lock cannot recover and operators delete the object by hand.

## Decision

`platform_extract_json_object` in `apps/platform/scripts/platform-oss-json.sh` finds the first `{`, decodes one object, and rejects a following JSON value. Leftover non-JSON CLI chatter is not authority. The helper prefers `python3`, then `python`, then `node`, because Windows Git Bash recovery tests do not have `python3`. `platform-recover.sh` always sources that helper and pipes successful `oss cat` stdout through it before reading durable fields. The helper cannot live only in `platform-cloud-assistant.sh`: tests stub `platform_cloud_run` first, so recover skips sourcing the assistant. A copied recover script copies sourced siblings because recover locates them via `BASH_SOURCE`. The unresolved-lock probe keeps combined stdout and stderr for `StatusCode=404` detection; a zero-exit probe must still extract one JSON object before it counts as an unresolved lock.

## Alternatives considered

**Treat `oss cat` stdout as a bare JSON document.** Rejected because pinned Alibaba Cloud CLI 3.4.11 ossutil `cat` can prefix elapsed-time lines that make `jq` fail while the object itself remains valid JSON.

**Strip known ossutil banners with grep.** Rejected because banner text is not a contract; `raw_decode` from the first `{` admits any non-JSON leftover and still fails closed on a second JSON value.

**Leave recovery to a manual OSS delete after hosts are healthy.** Rejected because the durable lock is the recovery authority; deleting it skips predecessor restore when the lock is still meaningful.

## Consequences

- Prefix or suffix CLI timing lines around one lock object still recover and still delete `active-state.json`.
- A second JSON value fails closed and does not delete the lock.
- A zero-exit `oss cat` that is not one JSON object is an undetermined lock, not a missing object.
- Recovery tests that stub `jq` keep that stub except chatter cases, which parse the extracted document with real `jq` when present and otherwise with `node`.
- Chatter cases hide `python3` and `jq` on PATH and still extract through `python` or `node`.
- Durable field reads strip CR so Git Bash `jq` CRLF lines still match `PLATFORM_ECS_INSTANCE_IDS`.
- A host without `python3` still extracts through `python` or `node`.
- The real-host bootstrap recovery harness copies `platform-oss-json.sh` beside recover.

## Testing

`apps/platform/tests/production-env.spec.ts` covers prefix chatter (`0.006891(s) elapsed`), suffix chatter (`average: 419(byte/s)`), extra JSON rejection without `python3` or `jq` on PATH, and unchanged rollbackable / commit-pending / committed / bootstrap phase order.
