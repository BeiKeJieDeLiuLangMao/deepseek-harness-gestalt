/**
 * Connected phone tab body (locked design states ③④): the BrowserView-
 * rhythm devbar (device dropdown + the active-format chip), the live frame
 * centered in the panel at the measured surface aspect (the locked 1:2
 * ratio is only the pre-measurement placeholder), the circular
 * Back/Home/Recents/screenshot toolbar, and the error cards whose copy
 * states the next action. Everything reactive arrives through one per-tab
 * `PhoneConnectionController`; the component only mirrors its snapshot.
 */
import clsx from 'clsx'
import type { DeviceId, PhoneCaptureId } from '@deepseek-ai/dsh-phone-runtime'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent,
} from 'react'
import {
  type PhoneConnectionController,
  type PhoneConnectionPhase,
  type PhoneCoordinateUnavailableReason,
  type PhoneStreamFailureKind,
  type PhoneSurfaceSize,
} from './phone-connection.ts'
import { startPhoneListingPoll } from './phone-listing-poll.ts'
import type { PhoneListingSource } from './registry.ts'
import { measureMjpegCurrentFrame } from './measure-mjpeg-current-frame.ts'
import { PhoneH264PlaybackOwner, PhoneH264Surface } from './PhoneH264Surface.tsx'
import css from './PhoneConnectedView.module.css'
import shared from './PhoneShared.module.css'

type PhoneCopy = PropsLocale<'settings.phone-devices'>['t']

/** Props of one connected device tab body. */
export interface PhoneConnectedViewProps {
  readonly t: PhoneCopy
  /** Device the tab streams (Android serial or iOS UDID). */
  readonly serial: DeviceId
  /** Display name shown in the dropdown and the copy. */
  readonly name: string
  /** Whether this tab is active and the panel open; false suspends pulling. */
  readonly visible: boolean
  /** Listing source backing the device dropdown. */
  readonly source: PhoneListingSource
  /** Switch the single tab onto another listed device in place (U1). */
  readonly onOpenDevice: (serial: DeviceId, name: string) => void
  /** Clear occupation so the picker with 重新检测环境 renders again. */
  readonly onShowPicker: () => void
  /** Controller factory; the tab owns the created instance for its lifetime. */
  readonly createController: (serial: DeviceId) => PhoneConnectionController
  /** Occurrence-owned controller supplied by the official workbench. */
  readonly controller?: PhoneConnectionController
  /** Whether this React body drives visibility and disposal. Defaults to true. */
  readonly manageController?: boolean
}

/** Error-card copy per failure kind, in the design's next-action semantics. */
function failureCopyOf(kind: PhoneStreamFailureKind, t: PhoneCopy, name: string): {
  readonly tone: 'warn' | 'err'
  readonly title: string
  readonly detail: string
} {
  switch (kind) {
    case 'unauthorized':
      return { tone: 'warn', title: t('connected.failure.unauthorized.title'), detail: t('connected.failure.unauthorized.detail').replace('{name}', name) }
    case 'device-offline':
      return { tone: 'err', title: t('connected.failure.offline.title'), detail: t('connected.failure.offline.detail').replace('{name}', name) }
    case 'interrupted':
      return { tone: 'err', title: t('connected.failure.interrupted.title'), detail: t('connected.failure.interrupted.detail') }
    case 'refused':
      return { tone: 'err', title: t('connected.failure.refused.title'), detail: t('connected.failure.refused.detail') }
    case 'unavailable':
      return { tone: 'err', title: t('connected.failure.unavailable.title'), detail: t('connected.failure.unavailable.detail') }
    case 'agent-missing':
      return { tone: 'warn', title: t('connected.failure.agentMissing.title'), detail: t('connected.failure.agentMissing.detail') }
    case 'agent-install-restricted':
      return { tone: 'warn', title: t('connected.failure.agentRestricted.title'), detail: t('connected.failure.agentRestricted.detail') }
    case 'agent-profile-required':
      return { tone: 'warn', title: t('connected.failure.profileRequired.title'), detail: t('connected.failure.profileRequired.detail') }
    case 'device-locked':
      return { tone: 'warn', title: t('connected.failure.locked.title'), detail: t('connected.failure.locked.detail') }
    case 'cert-untrusted':
      return { tone: 'warn', title: t('connected.failure.untrusted.title'), detail: t('connected.failure.untrusted.detail') }
    case 'profile-expired':
      return { tone: 'warn', title: t('connected.failure.expired.title'), detail: t('connected.failure.expired.detail') }
    case 'tunnel-failed':
      return { tone: 'err', title: t('connected.failure.tunnel.title'), detail: t('connected.failure.tunnel.detail') }
    case 'device-unplugged':
      return { tone: 'err', title: t('connected.failure.unplugged.title'), detail: t('connected.failure.unplugged.detail') }
  }
}

/** Pointer travel (px) below which a press still counts as a tap. */
const DRAG_THRESHOLD_PX = 6
/** Idle gap after which a trackpad wheel burst becomes one vertical swipe. */
const WHEEL_BURST_IDLE_MS = 50
/** Pixel travel of one `DOM_DELTA_LINE` wheel unit on the live frame. */
const WHEEL_LINE_PX = 16
/** Minimum normalized vertical travel of a coalesced wheel swipe. */
const WHEEL_MIN_TRAVEL = 0.08
/** Maximum normalized vertical travel of a coalesced wheel swipe. */
const WHEEL_MAX_TRAVEL = 0.4
/**
 * Re-measure cadence for a live MJPEG image. Chromium keeps
 * `naturalWidth`/`naturalHeight` at the first `multipart/x-mixed-replace`
 * JPEG, so the interval reads the currently painted bitmap.
 */
const MJPEG_SURFACE_POLL_MS = 500

/** The toolbar icon glyphs, drawn inline to stay on the primitives idiom. */
/** Devbar encoding/status chip derived from the controller phase and painted surface. */
interface PlaybackChip {
  readonly ariaLabel: string
  readonly label: string
  readonly caption?: string
  readonly playing: boolean
}

/**
 * Name playback from the existing connection owner and decoded first frame.
 * Socket-open `live` without `surfaceSize` is waiting, not playing. The stream
 * contract has no fps field, so the chip never invents a measured cadence.
 */
function playbackChipOf(
  phase: PhoneConnectionPhase,
  surfaceSize: PhoneSurfaceSize | undefined,
  online: boolean,
  t: PhoneCopy,
): PlaybackChip {
  if (phase.kind === 'connecting' || phase.kind === 'checking-agent' || phase.kind === 'repairing-agent') {
    return { ariaLabel: t('connected.chip.connecting.aria'), label: t('connected.chip.connecting'), playing: false }
  }
  if (phase.kind === 'reconnecting') {
    return { ariaLabel: t('connected.chip.reconnecting.aria'), label: t('connected.chip.reconnecting'), playing: false }
  }
  if (phase.kind === 'error') {
    return { ariaLabel: t('connected.chip.error.aria'), label: t('connected.chip.error'), playing: false }
  }
  if (phase.kind === 'suspended') {
    return { ariaLabel: t('connected.chip.paused.aria'), label: t('connected.chip.paused'), playing: false }
  }
  if (phase.kind === 'idle') {
    return {
      ariaLabel: online ? t('connected.chip.online.aria') : t('connected.chip.offline.aria'),
      label: online ? t('connected.chip.online') : t('connected.chip.offline'),
      playing: false,
    }
  }
  const encoding = phase.format === 'mjpeg' ? 'MJPEG' : 'H264'
  if (surfaceSize === undefined) {
    return { ariaLabel: t('connected.chip.waiting.aria').replace('{encoding}', encoding), label: t('connected.chip.waiting'), caption: encoding, playing: false }
  }
  return { ariaLabel: t('connected.chip.encoding.aria').replace('{encoding}', encoding), label: encoding, playing: true }
}

function ChevronDown(): ReactNode {
  return (
    <svg aria-hidden="true" width="9" height="9" viewBox="0 0 24 24" fill="none">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

interface ReconnectAlertProps {
  readonly t: PhoneCopy
  readonly tone: 'warn' | 'err'
  readonly title: string
  readonly detail: string
  readonly onReconnect: () => void
  readonly agentRecovery?: 'install' | 'reinstall'
  readonly onRecoverAgent?: (force: boolean) => void
}

function ReconnectAlert({
  t, tone, title, detail, onReconnect, agentRecovery, onRecoverAgent,
}: ReconnectAlertProps): ReactNode {
  return (
    <div role="alert" className={`${css.alertCard} ${tone === 'warn' ? css.alertWarn : css.alertErr}`}>
      <p className={css.alertTitle}>{title}</p>
      <p className={css.alertDetail}>{detail}</p>
      <div className={css.alertActions}>
        {agentRecovery !== undefined && onRecoverAgent !== undefined && (
          <button
            type="button"
            className={shared.minibtnPrimary}
            onClick={() => { onRecoverAgent(agentRecovery === 'reinstall') }}
          >
            {agentRecovery === 'install' ? t('connected.installAgent') : t('connected.reinstallAgent')}
          </button>
        )}
        <button
          type="button"
          className={agentRecovery === undefined ? shared.minibtnPrimary : shared.minibtnSecondary}
          onClick={onReconnect}
        >
          {agentRecovery === undefined ? t('connected.reconnect') : t('common.redetect')}
        </button>
      </div>
    </div>
  )
}

/**
 * Render the connected body for one device tab.
 * @param props - the device identity, visibility, fleet list, and callbacks.
 * @returns the live view, its in-flight notes, or the error card.
 */
export function PhoneConnectedView({
  t, serial, name, visible, source, onOpenDevice, onShowPicker, createController,
  controller: ownedController, manageController = true,
}: PhoneConnectedViewProps): ReactNode {
  const createControllerRef = useRef(createController)
  const h264PlaybackOwnerRef = useRef<PhoneH264PlaybackOwner | undefined>(undefined)
  const h264PlaybackOwner = h264PlaybackOwnerRef.current ??= new PhoneH264PlaybackOwner()
  createControllerRef.current = createController
  // The tab is a singleton (U1): a serial change disposes the previous
  // controller and mints a new session for the chosen device.
  const controller = useMemo(
    () => ownedController ?? createControllerRef.current(serial),
    [ownedController, serial],
  )
  // The controller and the listing source are the owning observables; uSES
  // is the render-side adapter (the better-sidebar tab hosts have no slot
  // hook channel).
  const subscribe = useCallback((listener: () => void) => controller.subscribe(listener), [controller])
  const snapshot = useCallback(() => controller.snapshot(), [controller])
  const phase = useSyncExternalStore(subscribe, snapshot, snapshot)
  const surfaceSnapshot = useCallback(() => controller.surfaceSize(), [controller])
  const surfaceSize = useSyncExternalStore(subscribe, surfaceSnapshot, surfaceSnapshot)
  const rotationSnapshot = useCallback(() => controller.surfaceOrientation(), [controller])
  const surfaceRotation = useSyncExternalStore(subscribe, rotationSnapshot, rotationSnapshot)
  const actionSnapshot = useCallback(() => controller.actionStatus(), [controller])
  const actionFailure = useSyncExternalStore(subscribe, actionSnapshot, actionSnapshot)
  const coordinateSnapshot = useCallback(() => controller.coordinateUnavailableReason(), [controller])
  const coordinateUnavailable = useSyncExternalStore(subscribe, coordinateSnapshot, coordinateSnapshot)
  const listSubscribe = useCallback((listener: () => void) => source.subscribe(listener), [source])
  const listSnapshot = useCallback(() => source.snapshot(), [source])
  const listing = useSyncExternalStore(listSubscribe, listSnapshot, listSnapshot)
  const devices = useMemo(() => [...listing.android, ...listing.ios], [listing])
  const current = devices.find(device => device.id === serial)
  const androidLogicalDisplay = listing.android.find(device => device.id === serial)?.logicalDisplay
  const occupyingPlatform = listing.android.some(device => device.id === serial)
    ? 'android' as const
    : listing.ios.some(device => device.id === serial) ? 'ios' as const : undefined
  const switchable = useMemo(() => devices.filter(device => device.online), [devices])
  const [menuOpen, setMenuOpen] = useState(false)
  /** The press being tracked: its fixed origin, the move trail, the drag flag. */
  const drag = useRef<{
    readonly pointerId: number
    readonly target: HTMLDivElement
    readonly origin: { u: number; v: number; clientX: number; clientY: number }
    readonly trail: Array<{ u: number; v: number }>
    dragging: boolean
  } | undefined>(undefined)
  const wheel = useRef<{
    deltaY: number
    surfaceHeight: number
    handle: ReturnType<typeof setTimeout>
  } | undefined>(undefined)
  /** The live MJPEG image; its currently painted JPEG is re-measured on a cadence. */
  const mjpegImg = useRef<HTMLImageElement | null>(null)
  /** Drops an in-flight current-frame measurement after a newer one starts or MJPEG leaves live. */
  const mjpegMeasureGeneration = useRef(0)
  const releaseDrag = useCallback((): void => {
    const state = drag.current
    drag.current = undefined
    if (state?.target.hasPointerCapture(state.pointerId) === true) {
      state.target.releasePointerCapture(state.pointerId)
    }
  }, [])

  const releaseWheel = useCallback((): void => {
    if (wheel.current !== undefined) clearTimeout(wheel.current.handle)
    wheel.current = undefined
  }, [])

  useEffect(() => {
    if (occupyingPlatform !== undefined) controller.notePlatform(occupyingPlatform)
    controller.noteLogicalDisplay(androidLogicalDisplay)
  }, [androidLogicalDisplay, occupyingPlatform, controller])
  useEffect(() => {
    if (manageController) controller.setVisible(visible)
  }, [controller, manageController, visible])
  useEffect(() => () => {
    releaseDrag()
    releaseWheel()
    if (manageController) controller.dispose()
  }, [controller, manageController, releaseDrag, releaseWheel])
  const liveStreamUrl = phase.kind === 'live' ? phase.streamUrl : undefined
  const surfaceIdentity = phase.kind === 'live' && surfaceSize !== undefined
    ? `${phase.captureId}:${String(surfaceSize.width)}:${String(surfaceSize.height)}:${String(surfaceRotation)}`
    : undefined
  useEffect(() => () => {
    releaseDrag()
    releaseWheel()
  }, [liveStreamUrl, releaseDrag, releaseWheel, surfaceIdentity, visible])
  useEffect(() => {
    // The dropdown needs the fleet even when this tab restored from layout
    // without the picker having pulled first; a failed pull keeps the
    // committed listing.
    source.refresh().catch(() => undefined)
  }, [source])
  useEffect(() => startPhoneListingPoll(source), [source])

  const mjpegLive = phase.kind === 'live' && phase.format === 'mjpeg'
  const applyMjpegSurface = useCallback((img: HTMLImageElement, captureId: PhoneCaptureId): void => {
    const token = ++mjpegMeasureGeneration.current
    void measureMjpegCurrentFrame(img).then((size) => {
      if (token !== mjpegMeasureGeneration.current || size === undefined) return
      controller.noteSurface('mjpeg', captureId, size.width, size.height)
    })
  }, [controller])

  useEffect(() => {
    if (!mjpegLive) return
    const captureId = phase.captureId
    const measure = (): void => {
      // The effect lives only while the live MJPEG phase renders the image;
      // its cleanup clears the interval before the ref can detach.
      const img = mjpegImg.current as HTMLImageElement
      applyMjpegSurface(img, captureId)
    }
    measure()
    const handle = setInterval(measure, MJPEG_SURFACE_POLL_MS)
    return () => {
      mjpegMeasureGeneration.current += 1
      clearInterval(handle)
    }
  }, [applyMjpegSurface, mjpegLive])

  const normalize = (event: ReactPointerEvent<HTMLDivElement>): { u: number; v: number } => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      u: rect.width === 0 ? 0 : (event.clientX - rect.left) / rect.width,
      v: rect.height === 0 ? 0 : (event.clientY - rect.top) / rect.height,
    }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const point = normalize(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      origin: { ...point, clientX: event.clientX, clientY: event.clientY },
      trail: [],
      dragging: false,
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = drag.current
    if (state === undefined || state.pointerId !== event.pointerId) return
    state.trail.push(normalize(event))
    if (!state.dragging
      && Math.hypot(event.clientX - state.origin.clientX, event.clientY - state.origin.clientY)
        < DRAG_THRESHOLD_PX) {
      return
    }
    state.dragging = true
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = drag.current
    if (state === undefined || state.pointerId !== event.pointerId) return
    drag.current = undefined
    state.target.releasePointerCapture(event.pointerId)
    const point = normalize(event)
    const dragging = state.dragging
      || Math.hypot(event.clientX - state.origin.clientX, event.clientY - state.origin.clientY) >= DRAG_THRESHOLD_PX
    if (dragging) controller.swipe([state.origin, ...state.trail, point])
    else controller.tap(point.u, point.v)
  }

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = drag.current
    if (state === undefined || state.pointerId !== event.pointerId) return
    drag.current = undefined
    state.target.releasePointerCapture(event.pointerId)
  }

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>): void => {
    if (event.deltaY === 0) return
    event.preventDefault()
    const surfaceHeight = event.currentTarget.getBoundingClientRect().height
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? WHEEL_LINE_PX
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? surfaceHeight : 1
    const deltaY = (wheel.current?.deltaY ?? 0) + event.deltaY * unit
    if (wheel.current !== undefined) clearTimeout(wheel.current.handle)
    const handle = setTimeout(() => {
      wheel.current = undefined
      const travel = Math.min(WHEEL_MAX_TRAVEL, Math.max(WHEEL_MIN_TRAVEL, Math.abs(deltaY) / Math.max(1, surfaceHeight)))
      const direction = Math.sign(deltaY)
      controller.swipe([
        { u: 0.5, v: 0.5 + direction * travel / 2 },
        { u: 0.5, v: 0.5 - direction * travel / 2 },
      ])
    }, WHEEL_BURST_IDLE_MS)
    wheel.current = { deltaY, surfaceHeight, handle }
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key.length === 1) {
      controller.text(event.key)
      event.preventDefault()
      return
    }
    if (event.key === 'Enter') {
      controller.text('\n')
      event.preventDefault()
    }
  }

  const online = current?.online === true
  const unauthorized = current?.state === 'unauthorized'
  const chip = playbackChipOf(phase, surfaceSize, online, t)

  const screenContent = (): ReactNode => {
    // A listed-unauthorized handset cannot stream: the design's warn arm
    // replaces the stream area (a live stream wins — the device may have
    // been authorized since the listing committed).
    if (unauthorized && phase.kind !== 'live') {
      const copy = failureCopyOf('unauthorized', t, name)
      return (
        <ReconnectAlert
          t={t}
          tone={copy.tone}
          title={copy.title}
          detail={copy.detail}
          onReconnect={() => { controller.connect() }}
        />
      )
    }
    if (phase.kind === 'live') {
      const surface = phase.format === 'h264'
        ? (
          <PhoneH264Surface
            owner={h264PlaybackOwner}
            label={t('connected.live.label').replace('{name}', name)}
            className={css.stream}
            url={phase.streamUrl}
            onSurface={(width, height, rotation) => {
              controller.noteSurface('h264', phase.captureId, width, height, rotation)
            }}
            onError={() => { controller.noteCaptureFailure('h264', phase.captureId) }}
          />
        )
        : (
          <img
            ref={mjpegImg}
            src={phase.streamUrl}
            alt={t('connected.live.label').replace('{name}', name)}
            className={css.stream}
            draggable={false}
            onLoad={(event) => { applyMjpegSurface(event.currentTarget, phase.captureId) }}
            onError={() => { controller.noteCaptureFailure('mjpeg', phase.captureId) }}
          />
        )
      // The box follows the measured surface aspect; before the first
      // measurement the stylesheet's `--phone-surface-ratio` fallback keeps
      // the locked 1:2 placeholder. An exact-ratio box plus
      // `object-fit: contain` maps frames without distorting pixels.
      const frameStyle = surfaceSize === undefined
        ? undefined
        : { '--phone-surface-ratio': String(surfaceSize.width / surfaceSize.height) } as CSSProperties
      const coordinateIo = coordinateUnavailable === undefined
      return (
        <div
          role="application"
          aria-label={coordinateIo
            ? t('connected.surface.aria').replace('{name}', name)
            : t('connected.surface.unavailable').replace('{name}', name)}
          tabIndex={0}
          className={css.screenFrame}
          style={frameStyle}
          onPointerDown={coordinateIo ? onPointerDown : undefined}
          onPointerMove={coordinateIo ? onPointerMove : undefined}
          onPointerUp={coordinateIo ? onPointerUp : undefined}
          onPointerCancel={coordinateIo ? onPointerCancel : undefined}
          onWheel={coordinateIo ? onWheel : undefined}
          onKeyDown={onKeyDown}
        >
          {surface}
          <span className={css.liveFlag}>
            {chip.playing ? <span aria-hidden="true" className={css.liveDot} /> : undefined}
            {chip.playing ? t('connected.proxying') : t('connected.waitingFrame')}
          </span>
          {coordinateUnavailable === 'missing-logical'
            || coordinateUnavailable === 'orientation-mismatch'
            || coordinateUnavailable === 'unknown-platform'
            ? <span role="status" className={css.actionError}>{coordinateUnavailableCopy(coordinateUnavailable, t)}</span>
            : undefined}
          {actionFailure !== undefined && (
            <span role="status" className={css.actionError}>{t('connected.actionFailed').replace('{message}', actionFailure.message)}</span>
          )}
        </div>
      )
    }
    if (phase.kind === 'connecting' || phase.kind === 'reconnecting'
      || phase.kind === 'checking-agent' || phase.kind === 'repairing-agent') {
      return (
        <div className={css.statusNote}>
          <span aria-hidden="true" className={css.spinner} />
          {phase.kind === 'connecting' ? t('connected.connecting')
            : phase.kind === 'reconnecting' ? t('connected.reconnecting').replace('{attempt}', String(phase.attempt))
              : phase.kind === 'checking-agent' ? t('connected.checkingAgent')
                : phase.force ? t('connected.reinstallingAgent') : t('connected.installingAgent')}
        </div>
      )
    }
    if (phase.kind === 'error') {
      const copy = failureCopyOf(phase.failure.kind, t, name)
      return (
        <ReconnectAlert
          t={t}
          tone={copy.tone}
          title={copy.title}
          detail={copy.detail}
          onReconnect={() => { controller.connect() }}
          {...(phase.failure.agentRecovery === undefined ? {} : { agentRecovery: phase.failure.agentRecovery })}
          onRecoverAgent={(force) => { controller.recoverAgent(force) }}
        />
      )
    }
    return (
      <div className={css.statusNote}>
        {phase.kind === 'suspended' ? t('connected.suspended') : t('connected.idle')}
      </div>
    )
  }

  return (
    <div className={css.view} data-phone-connected>
      <div className={css.devbar}>
        <button
          type="button"
          className={css.devpick}
          aria-label={t('connected.switchDevice').replace('{name}', name)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => { setMenuOpen(open => !open) }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setMenuOpen(false)
          }}
        >
          <span
            aria-hidden="true"
            className={clsx(css.dot, unauthorized && css.dotUnauthorized, !online && !unauthorized && css.dotOffline)}
          />
          {name}
          <ChevronDown />
        </button>
        <button
          type="button"
          className={shared.minibtnSecondary}
          aria-label={t('connected.pickDevice')}
          onClick={onShowPicker}
        >
          {t('connected.pickDevice')}
        </button>
        <span className={css.devbarSpacer} />
        <span
          className={clsx(css.tierChip, chip.playing && css.tierChipActive)}
          aria-label={chip.ariaLabel}
        >
          {chip.playing ? <span aria-hidden="true" className={css.liveDot} /> : undefined}
          {chip.label}
          {chip.caption !== undefined ? <span className={css.reslv}>{chip.caption}</span> : undefined}
        </span>
        {menuOpen && (
          <div role="menu" aria-label={t('connected.switchMenu')} className={css.pickMenu}>
            {switchable.map(device => (
              <button
                key={device.id}
                type="button"
                role="menuitem"
                className={css.pickItem}
                onClick={() => {
                  setMenuOpen(false)
                  if (device.id !== serial) onOpenDevice(device.id, device.name)
                }}
              >
                <span aria-hidden="true" className={css.dot} />
                {device.name}
                <span className={css.pickMeta}>{device.id === serial ? t('connected.current') : t('connected.switch')}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={css.screenArea}>
        {screenContent()}
      </div>

      <div className={css.toolstrip}>
        <button type="button" className={css.iconButton} aria-label={t('connected.back')} onClick={() => { controller.button('BACK') }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className={css.iconButton} aria-label={t('connected.home')} onClick={() => { controller.button('HOME') }}>
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
        <button type="button" className={css.iconButton} aria-label={t('connected.recents')} onClick={() => { controller.button('RECENTS') }}>
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="11" width="4.6" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.9" />
            <rect x="9.9" y="6" width="4.6" height="12" rx="1.4" stroke="currentColor" strokeWidth="1.9" />
            <rect x="15.8" y="9" width="4.6" height="9" rx="1.4" stroke="currentColor" strokeWidth="1.9" />
          </svg>
        </button>
        <span aria-hidden="true" className={css.toolSep} />
        <button
          type="button" className={css.iconButton} aria-label={t('connected.screenshot')} disabled
          title={t('connected.screenshotHint')}
        >
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M4 8.5h3l1.6-2.4h6.8L17 8.5h3v10H4v-10Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <circle cx="12" cy="13.4" r="3" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
        <button type="button" className={css.iconButton} aria-label={t('connected.refresh')} onClick={() => { controller.refresh() }}>
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M4 12a8 8 0 0 1 13.66-5.66L20 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M20 4v4.5h-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M20 12a8 8 0 0 1-13.66 5.66L4 15.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M4 20v-4.5h4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className={css.hintline}>{t('connected.hint')}</div>
    </div>
  )
}

function coordinateUnavailableCopy(
  reason: Exclude<PhoneCoordinateUnavailableReason, 'missing-surface'>,
  t: PhoneCopy,
): string {
  switch (reason) {
    case 'missing-logical':
      return t('connected.touch.missingLogical')
    case 'orientation-mismatch':
      return t('connected.touch.orientation')
    case 'unknown-platform':
      return t('connected.touch.platform')
  }
}
