# @deepseek-ai/dsh-browser-runtime-tandem

English | [中文](README.zh.md)

Tandem-shaped HTTP Service Provider for the Browser Runtime capability. It drives a loopback HTTP API whose operations are sessions, tabs, navigate, page-content, screenshot, focus, and destroy, and exposes temporary and named persistent Browser Profiles through `ctx.browserRuntime`. Tandem is the protocol source, not a sidecar binary: production Desktop points this client at the in-process Electron HTTP adapter. Provenance is recorded in [UPSTREAM.md](UPSTREAM.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); no upstream source is vendored, and this package never launches Tandem.app.

## Configuration

| Field | Meaning | Default |
|---|---|---|
| `command` | Optional fixture executable used only by HTTP protocol tests | omitted |
| `args` | Arguments passed without shell interpretation when `command` is set | `[]` |
| `cwd` | Existing directory used as the optional fixture child working directory | omitted |
| `env` | Explicit environment layered over the subprocess service's credential-scrubbed parent environment | `{}` |
| `baseUrl` | Loopback Tandem-shaped HTTP API origin, including its configured port | required |
| `tokenFile` | Local file where the HTTP server writes its generated API token | required |
| `idPrefix` | Prefix for DSH-owned opaque Profile, Workspace, and browser identities | `tandem` |
| `startupTimeoutMs` | Bound on HTTP health verification | `60000` |
| `requestTimeoutMs` | Bound on each Tandem-shaped HTTP operation | `30000` |
| `healthPollMs` | Delay between startup health probes | `250` |
| `pageSettleMs` | Upper bound on upstream page-settle waiting for one content read | `250` |
| `reconnectAttempts` | Number of fixture-child restarts after an unexpected exit | `2` |
| `reconnectDelayMs` | Delay before each reconnect attempt | `500` |
| `processGraceMs` | Subprocess tree SIGTERM-to-SIGKILL grace used for fixture teardown | `5000` |
| `maxResponseBytes` | Maximum bytes accepted from one Tandem-shaped HTTP response | `10000000` |

`baseUrl` must be an absolute loopback HTTP origin (`127.0.0.1`, `localhost`, or `[::1]` host, no credentials, no path, query, or fragment); anything else fails plugin load. `command` and `cwd` are either both set for an HTTP fixture child or both omitted for a live loopback server. Durations must be positive safe integers and `reconnectAttempts` a non-negative safe integer. The bearer token is read from `tokenFile` and every HTTP operation carries it; startup health polls `GET /agent/version` and `GET /status` under `startupTimeoutMs`. Page reads send provider-owned `settleMs`, `timeout`, and `minLength` query bounds.

Operations enter one serialized queue. Mutations require the caller's last observed `expectedRevision`; reads return the current revision without advancing it. Human `input` and `takeover` set reported `controlOwner` to `human` and keep the same Session, Profile, browser instance, and tab; `returnControl` records Agent ownership. The lock is the revision. Each Profile maps to one HTTP session created with `POST /sessions/create` and a `persist:session-*` partition. Named Profiles restore that partition; temporary Profiles use unique `tmp-N` session names and leave no reusable identity. A second open writer of the same named Profile rejects with `BROWSER_PROFILE_BUSY`. After disposal starts, operations reject with `BROWSER_DISPOSED`. Disposal stops admission, drains the queue, destroys remaining sessions with `POST /sessions/destroy`, and joins an optional fixture child under `processGraceMs`.

An unexpected fixture-child exit or a failed health check commits a `BrowserUnavailableState` with reason `crashed` or `unhealthy` and `reconnecting` set by configuration, then attempts up to `reconnectAttempts` child restarts when a fixture child exists; a restored runtime re-commits open page state at the next revision with the same target, and exhausted reconnects commit `reason: 'reconnect-failed'` with `reconnecting: false`. The projection is truthful: while unavailable, operations on the target reject with `BROWSER_RUNTIME_UNAVAILABLE` instead of reporting stale page facts. Malformed HTTP responses, oversized bodies, and failed field validation reject with `BROWSER_PROTOCOL`.

## Model Experience

Indirectly, through dsh-tool-browser, which renders every page, screenshot, lifecycle, and availability fact.

#### KV Cache effect

The Provider itself contributes no request text; Consumer schemas and logged results determine cache changes.

## Known Limitations and Deferred Work

- Production Desktop never launches Tandem.app. The HTTP client talks to the in-process Electron adapter; unit tests run against the in-repository HTTP fixture.
- Upstream-contribution candidates — isolated-session security stack and extension loading, persisted session registry, close/forget/wipe storage erasure, MCP tool allowlist/profiles, an ownership/handoff event stream, and first-class Linux support — are listed in [UPSTREAM.md](UPSTREAM.md).
