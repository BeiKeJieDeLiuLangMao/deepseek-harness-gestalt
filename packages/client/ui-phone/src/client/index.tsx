/**
 * Phone plugin, browser half: registers the 「手机」 tab type through the
 * official right-Sidebar registry and the top-level 「手机设备」 settings
 * section. The tab type hosts one always-reachable 「手机」 instance whose
 * body splits on `meta`: the locked not-connected empty state, or the
 * connected view of the device occupying the tab. Device opens switch that
 * tab in place. The connected body consumes the Host `phoneStream`
 * same-origin channel. With `enabled: false` (the default) device switches
 * are refused and no stream session is ever minted.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { DeviceId } from '@deepseek-ai/dsh-phone-runtime'
import z from '@deepseek-ai/schemastery'
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { PhoneConnectedView } from './PhoneConnectedView.tsx'
import { PhoneTab } from './PhoneTab.tsx'
import { PhoneSettingsSection } from './PhoneSettingsSection.tsx'
import { PhoneSettingsCardController } from './phone-settings-controller.ts'
import { createListingPhoneEnvironmentSource } from './phone-environment-listing.ts'
import { createHttpPhoneRuntimeSource } from './phone-runtime-source.ts'
import { PhoneConnectionController } from './phone-connection.ts'
import { createHttpPhoneGateway } from './phone-stream-client.ts'
import { createHttpPhoneListingSource, fetchPhoneListing } from './phone-listing.ts'
import {
  isDesktopOverlayDocument, phoneDesktopOverlayBridgeOf, phoneDeviceIdFromSelection,
  selectPhoneDeviceFromOverlay, waitForPhoneGate,
} from './desktop-device-open.ts'
import {
  buildOfficialPhoneDefinition, openPhoneDevicePanel, PHONE_DEFINITION_ID, PHONE_TAB_ID,
  PhoneOccurrenceRuntime, phoneDeviceTabMetaOf,
  type PhoneGateSource, type PhoneListingSource,
} from './registry.ts'
import { en, NS, zh, type PhoneSettingsKey } from './locales.ts'
import { PHONE_SETTINGS_NAMESPACE } from '../phone-settings.ts'
import type { PhoneSettings } from '../phone-settings.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Phone Devices settings section copy. */
    'settings.phone-devices': PhoneSettingsKey
  }
}

/** Services required before activation. */
export const inject = [
  'slots', 'locale', 'settingsScope', 'sidebarRight', 'sidebarRightTabs',
] as const

function enabledValue(settings: PhoneSettings | undefined): boolean | undefined {
  return settings?.enabled
}

function runSettingsDeviceOpen(operation: Promise<void>): void {
  void operation.catch((error: unknown) => {
    console.error('[ui-phone] opening a Settings device failed:', error)
  })
}

/**
 * Enable gate of the phone tab. The default stays `false`: a deployment must
 * opt in before any device discovery may run (contract placeholder until the
 * mobilecli ticket wires real detection). The Host `ui-phone` section is the
 * durable copy of this flag; composition Config remains the Loader default.
 */
export interface Config {
  /** Whether this deployment enables phone device detection and streaming. */
  readonly enabled?: boolean
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(false),
})

/**
 * Split the single tab onto its body: no device meta is the picker (empty
 * state), device meta is the connected view of that device. Both arms
 * switch devices in place through the environment (U1: same tab).
 * @param props - the tab instance props from the better-sidebar render.
 * @param env - the registration environment the descriptor assembled.
 * @returns the body of this tab instance.
 */
interface OfficialPhoneBodyInjected {
  readonly gate: PhoneGateSource
  readonly source: PhoneListingSource
  readonly runtime: PhoneOccurrenceRuntime
  readonly createController: (serial: DeviceId) => PhoneConnectionController
  readonly title: () => string
  readonly occupiedTitle: (name: string) => string
}

type OfficialPhoneBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & OfficialPhoneBodyInjected

export function OfficialPhoneBody({
  useTabInfo, gate, source, runtime, createController, title, occupiedTitle,
}: OfficialPhoneBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const device = phoneDeviceTabMetaOf(tab.payload)
  const onOpenDevice = (serial: DeviceId, name: string): void => {
    tab.actions.update({ title: occupiedTitle(name), payload: { kind: 'device', serial, name } })
  }
  if (device === undefined) {
    return <PhoneTab gate={gate} source={source} onOpenDevice={onOpenDevice} />
  }
  const controller = runtime.controllerFor(tab.sessionId, tab.id)
  return (
    <PhoneConnectedView
      serial={device.serial}
      name={device.name}
      visible={tab.visible}
      source={source}
      onOpenDevice={onOpenDevice}
      onShowPicker={() => { tab.actions.update({ title: title(), payload: {} }) }}
      createController={createController}
      {...controller === undefined ? {} : { controller }}
      manageController={false}
    />
  )
}

/**
 * Client plugin body.
 * @param ctx - client context carrying the official Sidebar and settings services.
 * @param config - validated {@link Config} (schema defaults applied).
 */
export function apply(ctx: ClientContext, config: Config): void {
  const compositionEnabled = config.enabled === true
  const scope = ctx.settingsScope.bind<PhoneSettings>({ namespace: PHONE_SETTINGS_NAMESPACE })
  const listing = createHttpPhoneListingSource()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-phone: settings dictionaries')
  const t = ctx.locale.bind(NS)
  const title = (): string => t('tab')
  const occupiedTitle = (name: string): string => `${t('occupied')}${name}`
  const tabEnabled = (): boolean => {
    const snapshot = scope.getSnapshot()
    if (snapshot.status === 'ready') return enabledValue(snapshot.value) ?? compositionEnabled
    return compositionEnabled
  }
  ctx.on('locale/change', () => {
    for (const session of ctx.sidebarRight.getSnapshot().sessions) {
      for (const tab of session.tabs) {
        if (tab.record.kind !== PHONE_TAB_ID) continue
        const device = phoneDeviceTabMetaOf(tab.state.payload)
        ctx.sidebarRight.forSession(session.sessionId).update(tab.record.id, {
          title: device === undefined ? title() : occupiedTitle(device.name),
        })
      }
    }
  })
  let selectionEpoch = 0
  let activeSelection: AbortController | undefined
  ctx.effect(() => () => {
    selectionEpoch += 1
    activeSelection?.abort()
    activeSelection = undefined
  }, 'ui-phone: Settings device-open lifetime')
  const openListedDevice = async (deviceId: DeviceId): Promise<void> => {
    activeSelection?.abort()
    const selection = new AbortController()
    activeSelection = selection
    const epoch = ++selectionEpoch
    try {
      const fresh = await fetchPhoneListing(selection.signal)
      if (selection.signal.aborted || epoch !== selectionEpoch) return
      const enabled = await waitForPhoneGate(scope, tabEnabled, selection.signal)
      if (!enabled || epoch !== selectionEpoch) return
      const devices = [...fresh.android, ...fresh.ios]
      const device = devices.find(candidate => candidate.id === deviceId && candidate.online)
      if (device === undefined) return
      await openPhoneDevicePanel(ctx.sidebarRight, () => true, device.id, device.name, occupiedTitle)
    } catch (error) {
      if (!selection.signal.aborted) throw error
    } finally {
      if (activeSelection === selection) activeSelection = undefined
    }
  }
  const overlayBridge = phoneDesktopOverlayBridgeOf(
    (globalThis as { dshDesktop?: unknown }).dshDesktop,
  )
  const openFromSettings = isDesktopOverlayDocument() && overlayBridge !== undefined
    ? (deviceId: DeviceId): void => {
      runSettingsDeviceOpen(selectPhoneDeviceFromOverlay(overlayBridge, deviceId))
    }
    : (deviceId: DeviceId): void => { runSettingsDeviceOpen(openListedDevice(deviceId)) }
  if (!isDesktopOverlayDocument() && overlayBridge !== undefined) {
    ctx.effect(() => overlayBridge.onChromeOverlayResult((result) => {
      const deviceId = phoneDeviceIdFromSelection(result)
      if (deviceId !== undefined) runSettingsDeviceOpen(openListedDevice(deviceId))
    }), 'ui-phone: Desktop settings device open')
  }
  const environmentRuntime = createHttpPhoneRuntimeSource()
  const card = new PhoneSettingsCardController(
    scope,
    createListingPhoneEnvironmentSource(listing, {
      runtimeReady: () => environmentRuntime.getSnapshot().runtime.kind === 'ready',
    }),
    globalThis.navigator.clipboard,
    environmentRuntime,
    openFromSettings,
  )
  ctx.effect(() => () => { card.dispose() }, 'ui-phone: settings section')
  // The body reads the gate reactively: scope invalidation (the enable
  // switch toggling) re-renders the gate strip on the same tick.
  const gate = { snapshot: tabEnabled, subscribe: (listener: () => void) => scope.subscribe(listener) }
  const createController = (serial: DeviceId): PhoneConnectionController => new PhoneConnectionController({
    gateway: createHttpPhoneGateway(),
    deviceId: serial,
  })
  const occurrenceRuntime = new PhoneOccurrenceRuntime(ctx, createController)
  ctx.effect(() => {
    const sync = (): void => { occurrenceRuntime.sync() }
    const disposers = [
      ctx.sidebarRightTabs.register(buildOfficialPhoneDefinition({ source: listing, title, occupiedTitle })),
      ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: PHONE_DEFINITION_ID,
        inject: () => ({
          gate, source: listing, runtime: occurrenceRuntime, createController, title, occupiedTitle,
        }),
      }, OfficialPhoneBody)),
      ctx.sidebarRight.subscribe(sync),
    ]
    sync()
    return () => {
      occurrenceRuntime.dispose()
      for (let index = disposers.length - 1; index >= 0; index -= 1) disposers[index]?.()
    }
  }, 'ui-phone: official Phone occurrence')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'phone-devices',
    order: 40,
    label: () => ctx.locale.bind(NS)('nav'),
    locale: NS,
    inject: () => card.inject(),
  }, PhoneSettingsSection))
}
