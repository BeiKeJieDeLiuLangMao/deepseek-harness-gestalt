# Agent Note: Delete `dsh-host-apiproxy` after remaining test carriers move

Status: proposed

English | [中文](2026-09-06-retire-host-apiproxy.zh.md)

## Problem

Shipped Host and Desktop production no longer load `@deepseek-ai/dsh-host-apiproxy`. Session, Workspace, Settings, Goal, Git, attachment, export, Browser, Ask User, Approval, and Companion unary/follow already use generated Remotes and Connection. The package still occupies the Host compiler aggregate, still exports `./invariant` with no `src/invariant.ts` (Cordis catalog `--check` fails first there), and still supplies `createApiProxy` / `toFetchHandler` / `ctx.apiProxy` to tests. Excluding the directory from typecheck would hide those 80 Host errors without removing the carrier.

## Proposal

Keep the package on disk until every remaining consumer has an owner-local replacement, then delete `packages/host/apiproxy` together with workspace, tsconfig, catalog, and script references. Do not add a new facade and do not invent an empty invariant.

Moved in this candidate (not yet a complete deletion):

- `session.toolEligibility` lives on Session Controller (`@Remote('toolEligibility')`). Direct Host tests cover omitted `allow`, empty `allow`, and nonempty union. Generated Host/Client codec tests cover the same D1 cases plus cold resume of the Agent-context allow union, missing Tools, subagent ownership, and Client codec rejection of a missing `sessionId`.
- Runtime `transportError` comes from `@deepseek-ai/dsh-client-connection/client`.
- Runtime `searchResultLimit` tests assert the Session search bound `20` without importing apiproxy.
- The apiproxy-backed `api-proxy-tool-eligibility.spec.ts` is removed because Session Controller already owns the behavior.

## Remaining blockers before delete

1. `apps/web/tests/member-question-receiving.e2e.ts` and `member-question-receiving.snapshot.ts` call `scaffold.ctx.apiProxy.sessions.{create,prompt,history}` and `scaffold.ctx.apiProxy.memberQuestions.admitHumanTurn`. Web scaffold no longer provides `apiProxy`. Replacement is Host Session Controller + member-question receiver after the late-inject MQ work (421/73de) lands; until then these suites cannot run against a deleted package.
2. `apps/desktop/tests/companion-host-assembled.spec.ts` still boots `createApiProxy` + `toFetchHandler` as the HTTP/WebSocket carrier for seven Snow assembled cases, including the MobileBrowse create buttons. Companion search hit/no-hit, archived exclusion, and `openAt: never` / index-open failure run against shipped `dsh web` in `companion-host-search.assembled.spec.ts`. Workspace-owned and Ungrouped `create-session` plus the durable ledger run against shipped Host in `companion-host-create.assembled.spec.ts` through `DesktopCompanionProductOwner` and generated remotes; that slice does not load MobileBrowse and does not replace the old UI case. Snow history/live/mutation/fence still need Desktop Host RPC. The HTTP 400 codec probe already uses a real loopback 400, not apiproxy.

## Test move plan

| Old apiproxy surface | Current owner | Status |
|---|---|---|
| `session.toolEligibility` | `session-controller` Host Remote + generated codecs | moved |
| `transportError` | `dsh-client-connection/client` | moved |
| `SESSION_SEARCH_RESULT_LIMIT` | `session-controller` `types.ts` (`20`) | tests assert bound, not the old export |
| Goal fork seed | `session.fork` + `clearGoalFromForkSeed` | already on Session Controller |
| Attachment admit/read | `session.admitAttachment` / `session.attachment` | already on Session Controller |
| Session search | `session.search` | already on Session Controller |
| Session log export | Connection `GET /api/session.export` | already off apiproxy |
| MQ admit/prompt/history in Web e2e | receiver + Session Controller | **blocked** |
| Desktop Snow assembled HTTP | `createDesktopHostRpc` | search hit/no-hit, archived exclusion, and provider-failure on shipped Host; Host create-session + ledger on shipped Host without MobileBrowse; remaining Snow create UI / history / live / mutation / fence **blocked** |

## Alternatives considered

**Delete the package now and skip or exclude the leftover tests.** Rejected: that is typecheck green by omission, not retirement.

**Leave apiproxy as a test-only HTTP facade.** Rejected: it keeps the missing invariant, the Host aggregate errors, and a second Session API.

## Acceptance criteria

- `packages/host/apiproxy` is gone from git, `tsconfig.host.json`, `tsconfig.base.json` paths, `scripts/project-reference-faces.ts`, and the official config/cordis catalogs.
- Exact-symbol search finds `createApiProxy`, `toFetchHandler`, and `ctx.apiProxy` only in this note, if at all.
- Web MQ receiving e2e/snapshot and Desktop Snow assembled tests still prove the same user-visible paths on Session Controller / Connection / `dsh web`.
- `gen-cordis-catalog --check` no longer fails on apiproxy `./invariant`.

## Risks

Deleting before the two blockers land drops MQ receiving and Snow Companion assembled coverage. Catalog regen after deletion is mechanical and must run from source, not a hand-edited English table.
