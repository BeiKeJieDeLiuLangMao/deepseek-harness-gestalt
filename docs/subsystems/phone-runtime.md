# Phone Runtime

English | [中文](phone-runtime.zh.md)

The phone device fleet seam: `packages/phone/phone-runtime` folds the Service Definition and its mobilecli Service Provider into one package while mobilecli is the only backend, and `packages/phone/tool-phone` is the deferred model Consumer. The Service owns the external `mobilecli server start` child process (loopback-only, spawned with the credential-scrubbed parent environment), probes its HTTP JSON-RPC endpoint until the first successful `server.info` reply, then polls `devices.list` on the configured cadence — accepting the result as the bare device array or mobilecli 1.0.5's `{ devices: [...] }` envelope, with duplicate upstream entries kept verbatim. Device ids are branded `DeviceId` values (an Android serial or an iOS UDID); the grouped listing `{ android, ios: { simulators, reals } }` carries frozen `PhoneDeviceRef` entries whose `kind` translates the upstream `type` field, whose `state` carries the upstream state verbatim — an `unauthorized` handset keeps its state, with upstream refusing its io until the trust prompt is accepted, instead of folding into offline — and whose `online` is true only for the upstream `online` state.

Failure semantics are total: a missing or unusable mobilecli binary still activates the Service, and every operation then rejects with `PHONE_UNRESOLVED` plus install guidance; a child that dies before readiness rejects plugin initialization; an unexpected post-ready exit (or a refused socket, or a protocol breach) marks the Service lost, and every later operation rejects with the recorded reason instead of degrading. All operations fuse the caller's `AbortSignal` with validated Config ceilings (`requestTimeoutMs`, `bootTimeoutMs`, `agentTimeoutMs`); boot and shutdown refuse physical handsets locally before any RPC. `io`, `startCapture`, and `screenshot` accept physical handsets and only refuse ids absent from the latest published listing. `startCapture` maps `h264` onto upstream `avc` and bounds the wait for response headers; the caller owns a published unread capture body. A generation or incarnation change after headers joins foreign body cancellation for at most `captureCleanupTimeoutMs`. The capture answer follows both upstream shapes — the bare stream and mobilecli 1.0.5's `{ format, sessionUrl }` envelope, whose session URL is resolved against the server origin and forced back onto the loopback fence. `screenshot` returns one PNG still through `mobilecli screenshot --format png`, persisted at an owner-only path under `$DSH_HOME/phone/screenshots`.

The iOS real-device link lives behind the listing's real group: `agentStatus` and `installAgent` run the upstream `agent status` / `agent install` commands as one-shot children of the same executable, keeping the on-device agent installed idempotently and re-signing real handsets through the configured `provisioningProfilePath` (the upstream command requires it for real iOS installs). Every answer about an installed, re-signed real handset carries `FREE_SIGNING_PROFILE_REMINDER` — free-team profiles expire after 7 days, and `installAgent(id, { force: true })` is the re-run entry. Failures whose output names a structured arm surface as `PHONE_REAL_DEVICE_ISSUE` with the arm on `PhoneDevicesError.issue`, classified identically from agent-command output and upstream JSON-RPC error messages; upstream `-32010` stays `PHONE_DEVICE_NOT_FOUND`.

Publication is monotonic and change-driven: a poll publishes only when the freshly grouped listing differs from the published one (id set, name, kind, or online fact), and each `PhoneDeviceChange` names exactly the added/removed ids of that difference. The `./invariant` companion re-derives every candidate difference from the published listing and halts polling loudly on a mismatch.

`ctx.phoneEnvironment` publishes the revisioned `PhoneEnvironmentSnapshot` consumed by Phone Devices settings: the durable enable value, shared runtime state, and independent Android/iOS preparation states. Runtime selection uses operator override, managed current, then system discovery. Platform Providers register behind the same Service; the Android Provider prepares a fixed API 35 SDK/AVD and contributes child-only SDK environment entries. A running platform becomes ready only after the selected mobilecli generation reactivates with those entries, lists the branded emulator id online, and yields a syntactically valid Annex-B key access unit with linked SPS, PPS, and IDR slice headers. This Host probe does not decode pixels; real-picture GUI acceptance remains separate. Disable, cancellation, or teardown cancels that whole transaction and stops the owned Emulator and mobilecli children.

```ts type-equiv
/** Closed semantic actions accepted by the phone fleet Service. */
type PhoneIoMethod = 'tap' | 'swipe' | 'text' | 'button'
```

```ts type-equiv
/** Exact clockwise rotation required to display a captured frame. */
type PhoneRotation = 0 | 90 | 180 | 270
```

```ts type-equiv
/** Trusted coordinate-plane source for one semantic coordinate action. */
type PhoneCoordinateSource =
  | { readonly kind: 'fresh-probe' }
  | {
    readonly kind: 'capture'
    readonly captureId: PhoneCaptureId
    readonly captureFormat: PhoneCaptureFormat
    readonly captureWidth: number
    readonly captureHeight: number
    readonly captureRotation?: PhoneRotation
  }
```

```ts type-equiv
/** One semantic phone action addressed by branded device id. */
type PhoneIoRequest =
  | { readonly deviceId: DeviceId; readonly method: 'tap'; readonly x: number; readonly y: number; readonly source: PhoneCoordinateSource }
  | {
    readonly deviceId: DeviceId
    readonly method: 'swipe'
    readonly x1: number
    readonly y1: number
    readonly x2: number
    readonly y2: number
    readonly source: PhoneCoordinateSource
  }
  | { readonly deviceId: DeviceId; readonly method: 'text'; readonly text: string }
  | { readonly deviceId: DeviceId; readonly method: 'button'; readonly button: string }
```

```ts type-equiv
/** Screen-capture encoding the Host reverse-proxy may request. */
type PhoneCaptureFormat = 'mjpeg' | 'h264'
```

```ts type-equiv
/** Request that opens one upstream `device.screencapture` stream. */
interface PhoneCaptureRequest {
  /** Branded Android serial or iOS UDID whose screen to stream. */
  readonly deviceId: DeviceId
  /** `mjpeg` for both platforms; `h264` maps onto upstream `avc` (Android). */
  readonly format: PhoneCaptureFormat
  /** Runtime-owned identity binding active observation and later coordinate projection when the caller needs coordinate evidence. */
  readonly captureId?: PhoneCaptureId
  /** Optional caller cancellation fused with the request ceiling until headers arrive. */
  readonly signal?: AbortSignal
}
```

```ts type-equiv
/**
 * One live capture body owned by the caller. The Host must cancel `body` when
 * the browser disconnects so the upstream HTTP stream ends.
 */
interface PhoneCaptureStream {
  /** Upstream `Content-Type`, including the MJPEG boundary parameter when present. */
  readonly contentType: string
  /** Byte stream of the capture; cancel it to abort the upstream request. */
  readonly body: ReadableStream<Uint8Array>
}
```

```ts type-equiv
/** One still PNG captured from a listed device. */
interface PhoneScreenshot {
  /** Always PNG; the still comes from `mobilecli screenshot --format png`. */
  readonly mediaType: 'image/png'
  /** Absolute owner-only PNG path under `$DSH_HOME/phone/screenshots`. */
  readonly path: string
}
```

```ts type-equiv
/**
 * Closed union of structured real-device failure arms. {@link classifyRealDeviceIssue}
 * names one arm from free-form mobilecli output; the matching
 * `PHONE_REAL_DEVICE_ISSUE` failure carries it on {@link PhoneDevicesError.issue}.
 */
type PhoneRealDeviceIssue =
  | 'device-locked'
  | 'cert-untrusted'
  | 'profile-expired'
  | 'tunnel-failed'
  | 'device-unplugged'
```

```ts type-equiv
/** Options for one on-device agent install. */
interface PhoneAgentInstallOptions {
  /** Reinstall and re-sign even when the agent already answers as installed. */
  readonly force?: boolean
  /** Optional caller cancellation bounding the whole install. */
  readonly signal?: AbortSignal
}
```

```ts type-equiv
/** One on-device agent status answer. */
interface PhoneAgentStatus {
  /** Device the answer is about. */
  readonly deviceId: DeviceId
  /** True only when the upstream agent command answered `status: ok`. */
  readonly installed: boolean
  /** Installed agent version; absent while `installed` is false. */
  readonly version?: string
  /** Installed agent bundle id; absent while `installed` is false. */
  readonly bundleId?: string
  /** Free-signing expiry reminder for a re-signed real handset; see the Service's `FREE_SIGNING_PROFILE_REMINDER`. */
  readonly profileReminder?: string
}
```

```ts type-equiv
/** One on-device agent install answer; `reinstalled` names a forced run this call performed. */
interface PhoneAgentInstallResult extends PhoneAgentStatus {
  /** True when this call ran a forced reinstall; false for a first install or an already-installed answer. */
  readonly reinstalled: boolean
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxphonedevices--phonedevices"></a>

### `ctx.phoneDevices` — `PhoneDevices`

Stable fleet facade over one retained external pool occupancy. Subscribers survive replacement; operations remain pinned to their entry generation. Disabled calls reject PHONE_UNRESOLVED without acquiring or starting a child.

```ts cordis-catalog
/**
 * Read current generation readiness.
 * @returns whether the admitted generation currently accepts operations.
 */
isReady(): boolean

/**
 * Subscribe across replacements; subscriber exceptions are contained.
 * @param listener - Receives each committed listing delta synchronously.
 * @returns idempotent unsubscribe.
 */
onChanged(listener: (change: PhoneDeviceChange) => void): () => void

/**
 * Subscribe to admitted generation readiness transitions across replacements.
 * @param listener - Receives the committed readiness value.
 * @returns idempotent unsubscribe.
 */
onReadinessChanged(listener: (ready: boolean) => void): () => void

/**
 * Resolve the executable before retiring the old generation, then join cleanup
 * before startup. Cancellation never admits a replacement occupancy.
 * @param executablePath - Executable selected by the environment owner.
 * @param signal - Optional cancellation of queued replacement and startup.
 * @param environment - Non-sensitive SDK environment pinned to this generation.
 */
async activateExecutable( executablePath: string, signal?: AbortSignal, environment: Readonly<Record<string, string>> = {}, ): Promise<void>

/** Retire and join the current generation; subsequent ordinary calls remain unresolved without restarting. */
async deactivate(): Promise<void>

/**
 * Acquire a fresh grouped listing from the entry generation.
 * @param signal - Optional caller cancellation.
 * @returns the committed Android/iOS device listing.
 */
async listDevices(signal?: AbortSignal): Promise<PhoneDeviceList>

/**
 * Boot a listed virtual device and schedule a listing refresh.
 * @param id - Device identifier; physical devices are refused.
 * @param signal - Optional caller cancellation.
 */
async boot(id: DeviceId, signal?: AbortSignal): Promise<void>

/**
 * Shut down a listed virtual device and schedule a listing refresh.
 * @param id - Device identifier; physical devices are refused.
 * @param signal - Optional caller cancellation.
 */
async shutdown(id: DeviceId, signal?: AbortSignal): Promise<void>

/**
 * Execute semantic input after live incarnation and capture authorization.
 * @param request - Device identifier, action, and trusted coordinate source.
 * @param signal - Optional caller cancellation.
 */
async io(request: PhoneIoRequest, signal?: AbortSignal): Promise<void>

/**
 * Open generation-owned capture; retirement also cancels unread or locked bodies.
 * @param request - Device, format, optional capture identity, and cancellation.
 * @returns content type and caller-readable byte stream.
 */
async startCapture(request: PhoneCaptureRequest): Promise<PhoneCaptureStream>

/**
 * Persist a PNG still only while its entry generation remains active.
 * @param id - Listed device identifier.
 * @param signal - Optional caller cancellation.
 * @returns media type and owner-only absolute PNG path.
 */
async screenshot(id: DeviceId, signal?: AbortSignal): Promise<PhoneScreenshot>

/**
 * Query device-agent installation using an owned command tree.
 * @param id - Listed device identifier.
 * @param signal - Optional caller cancellation.
 * @returns parsed agent installation status and provisioning guidance.
 */
async agentStatus(id: DeviceId, signal?: AbortSignal): Promise<PhoneAgentStatus>

/**
 * Install or re-sign an agent without crossing generation replacement.
 * @param id - Listed device identifier.
 * @param options - Force reinstall and optional caller cancellation.
 * @returns installation status and whether a forced reinstall occurred.
 */
async installAgent(id: DeviceId, options?: PhoneAgentInstallOptions): Promise<PhoneAgentInstallResult>
```

Source: [`packages/phone/phone-runtime/src/index.ts`](../../packages/phone/phone-runtime/src/index.ts)

<a id="ctxphoneenvironment--phoneenvironment"></a>

### `ctx.phoneEnvironment` — `PhoneEnvironment`

Stable Host Service for phone runtime discovery, preparation, and activation.

```ts cordis-catalog
/**
 * Read the latest committed environment state.
 * @returns the current immutable full snapshot.
 */
snapshot(): PhoneEnvironmentSnapshot

/**
 * Apply the durable settings gate and symmetrically activate or stop the child generation.
 * @param enabled - current `ui-phone.enabled` value.
 */
setEnabled(enabled: boolean): Promise<void>

/**
 * Subscribe to committed full-snapshot replacements.
 * @param listener - callback receiving the new immutable snapshot.
 * @returns the disposer.
 */
onChanged(listener: (snapshot: PhoneEnvironmentSnapshot) => void): () => void

/**
 * Register the Android platform Provider while retaining this Service as the full-snapshot owner.
 * @param provider - Android SDK, AVD, and emulator lifecycle owner.
 * @returns disposer that detaches the Provider and restores the deferred state.
 */
registerAndroidEnvironment(provider: AndroidEnvironmentProvider): () => void

/**
 * Register the iOS platform Provider while retaining this Service as the full-snapshot owner.
 * A running snapshot discovered during registration remains pending until
 * the active mobilecli generation passes list and picture verification.
 * @param provider - Xcode runtime and Simulator lifecycle owner.
 * @returns disposer that detaches the Provider and restores the deferred state.
 */
registerIosEnvironment(provider: IosEnvironmentProvider): () => void

/**
 * Re-detect runtime sources in fixed override-managed-system precedence.
 * @param signal - optional owner cancellation for detection and activation.
 * @returns the committed full snapshot after detection settles.
 */
refresh(signal?: AbortSignal): Promise<PhoneEnvironmentSnapshot>

/**
 * Download, verify, publish, and optionally activate the pinned host asset.
 * @returns the committed full snapshot after preparation settles.
 * @throws {@link PhoneEnvironmentError} with `PHONE_ENVIRONMENT_OVERRIDE` while
 *   `executablePath` is authoritative, `PHONE_ENVIRONMENT_BUSY` for concurrent
 *   preparation, or the documented download, verification, filesystem,
 *   cancellation, and activation codes.
 */
prepare(): Promise<PhoneEnvironmentSnapshot>

/** Cancel the current detection, download, version probe, or child activation. */
cancel(): void
```

Source: [`packages/phone/phone-environment/src/index.ts`](../../packages/phone/phone-environment/src/index.ts)
<!-- END GENERATED cordis-surface -->
