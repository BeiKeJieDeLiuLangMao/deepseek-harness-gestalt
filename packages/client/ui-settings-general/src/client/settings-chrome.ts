/** Settings-owned projection of the Desktop preload request/result protocol. */
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

/** Document in which the Settings page paints. */
export type SettingsChromeMode = 'web' | 'desktop-host' | 'overlay'

/** Settings request fields retained while the native page is open. */
export interface SettingsChromeRequest {
  readonly requestId: string
  readonly sectionId?: string
}

type OverlayState = ({ readonly kind: 'settings' } & SettingsChromeRequest)
  | { readonly kind: 'menu' }
  | null

type OverlayResult = { readonly type: 'close' | 'select'; readonly requestId: string }

/** Narrow preload consumer; the complete wire protocol is owned by ui-desktop. */
interface SettingsDesktopBridge {
  chromeOverlayShow(request: { kind: 'settings' } & SettingsChromeRequest): Promise<void>
  chromeOverlayGetState(): Promise<OverlayState>
  chromeOverlayResult(result: { type: 'close'; requestId: string }): void
  onChromeOverlayState(listener: (state: OverlayState) => void): () => void
  onChromeOverlayResult(listener: (result: OverlayResult) => void): () => void
}

function resolveBridge(value: unknown, overlay: boolean): SettingsDesktopBridge | undefined {
  if (value === undefined && !overlay) return undefined
  if (typeof value !== 'object' || value === null) {
    throw new Error('Settings requires the Desktop chrome preload in an overlay document')
  }
  const record = value as Record<string, unknown>
  for (const name of [
    'chromeOverlayShow', 'chromeOverlayGetState', 'chromeOverlayResult',
    'onChromeOverlayState', 'onChromeOverlayResult',
  ]) {
    if (typeof record[name] !== 'function') throw new Error(`Settings Desktop preload is missing ${name}`)
  }
  return value as SettingsDesktopBridge
}

/** Owns native request observation and drains accepted preload calls on disposal. */
export class SettingsChrome {
  /** Document presentation role captured at plugin activation. */
  readonly mode: SettingsChromeMode
  /** Current native request supplied through the Settings seat observable. */
  readonly state = createSnapshotStore<SettingsChromeRequest | null>(null)
  private readonly bridge: SettingsDesktopBridge | undefined
  private readonly pending = new Set<Promise<void>>()
  private readonly subscriptions: Array<() => void> = []
  private eventRevision = 0
  private closingRequestId: string | undefined
  private stopped = false
  private disposal: Promise<void> | undefined

  /**
   * Capture the document's preload capability before rendering the Settings seat.
   * @param preload - Desktop preload object, absent in browser-only Web.
   * @param overlay - bootstrap-owned native overlay document marker.
   * @param reportError - owner diagnostic for rejected preload operations.
   */
  constructor(
    preload: unknown,
    overlay: boolean,
    private readonly reportError: (error: unknown) => void,
  ) {
    this.bridge = resolveBridge(preload, overlay)
    this.mode = overlay ? 'overlay' : this.bridge === undefined ? 'web' : 'desktop-host'
  }

  /** Subscribe before the initial read so an event cannot be overwritten by that read. */
  start(): void {
    const bridge = this.bridge
    if (bridge === undefined || this.stopped) return
    this.subscriptions.push(bridge.onChromeOverlayState((state) => {
      if (this.stopped) return
      this.eventRevision += 1
      this.publish(state?.kind === 'settings' ? state : null)
    }))
    this.subscriptions.push(bridge.onChromeOverlayResult((result) => {
      if (this.stopped || result.type !== 'close' || result.requestId !== this.state.getSnapshot()?.requestId) return
      this.eventRevision += 1
      this.publish(null)
    }))
    const revision = this.eventRevision
    this.own(async () => {
      const state = await bridge.chromeOverlayGetState()
      if (this.stopped || revision !== this.eventRevision) return
      this.publish(state?.kind === 'settings' ? state : null)
    })
  }

  /**
   * Ask native chrome to show Settings, preserving the current overlay request for section updates.
   * @param sectionId - optional registered Settings section to select.
   */
  open(sectionId?: string): void {
    const bridge = this.bridge
    if (bridge === undefined || this.stopped) return
    const current = this.state.getSnapshot()
    if (this.mode === 'overlay' && current === null) return
    const request: SettingsChromeRequest = {
      requestId: this.mode === 'overlay' && current !== null ? current.requestId : randomUUID(),
      ...(sectionId === undefined ? {} : { sectionId }),
    }
    this.eventRevision += 1
    this.publish(request)
    this.own(async () => {
      try {
        await bridge.chromeOverlayShow({ kind: 'settings', ...request })
      } catch (error) {
        if (!this.stopped && this.state.getSnapshot()?.requestId === request.requestId) this.publish(null)
        throw error
      }
    })
  }

  /**
   * Close only the request still rendered in this overlay document.
   * @param requestId - request whose close control was activated.
   */
  close(requestId: string): void {
    const bridge = this.bridge
    if (bridge === undefined || this.stopped || this.mode !== 'overlay' || this.state.getSnapshot()?.requestId !== requestId
      || this.closingRequestId === requestId) return
    this.closingRequestId = requestId
    bridge.chromeOverlayResult({ type: 'close', requestId })
  }

  /**
   * Release listeners, reject new operations, and await every accepted preload call.
   * @returns after no accepted operation can update this projection.
   */
  dispose(): Promise<void> {
    this.disposal ??= this.drain()
    return this.disposal
  }

  private async drain(): Promise<void> {
    this.stopped = true
    for (const off of this.subscriptions.splice(0)) off()
    await Promise.allSettled([...this.pending])
  }

  private publish(request: SettingsChromeRequest | null): void {
    const current = this.state.getSnapshot()
    if (current?.requestId === request?.requestId && current?.sectionId === request?.sectionId) return
    this.closingRequestId = undefined
    this.state.set(request === null ? null : {
      requestId: request.requestId,
      ...(request.sectionId === undefined ? {} : { sectionId: request.sectionId }),
    })
  }

  private own(operation: () => Promise<void>): void {
    const task = operation().catch((error: unknown) => {
      if (!this.stopped) this.reportError(error)
    })
    this.pending.add(task)
    void task.then(() => { this.pending.delete(task) })
  }
}
