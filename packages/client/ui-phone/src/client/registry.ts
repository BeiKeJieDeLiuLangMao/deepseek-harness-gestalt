/** Official Phone definition, payload, and occurrence-owned connection runtime. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { DeviceId } from '@deepseek-ai/dsh-phone-runtime'
import type {
  SidebarRightDescriptorTab, SidebarRightTabDefinition, SidebarRightTabProjection,
} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { PhoneConnectionController } from './phone-connection.ts'
import { phoneDeviceIdOf } from './phone-device-id.ts'

/** Official singleton Phone kind. */
export const PHONE_TAB_ID = 'phone'
/** Stable official definition id. */
export const PHONE_DEFINITION_ID = '@deepseek-ai/dsh-client-ui-phone/phone'
/** zh fallback used by React-free helpers and invariants. */
export const PHONE_TAB_TITLE = '手机'
/** + menu position after Browser. */
export const PHONE_TAB_ORDER = 55
/** Platforms shown by the picker. */
export const PHONE_PLATFORMS = ['android', 'ios'] as const
export type PhonePlatform = typeof PHONE_PLATFORMS[number]

/** One platform device row. */
export interface PhoneDeviceSummary {
  readonly id: DeviceId
  readonly name: string
  readonly channel: 'emulator' | 'usb'
  readonly online: boolean
  readonly state: string
  readonly logicalDisplay?: { readonly width: number; readonly height: number }
}

/** Current grouped fleet listing. */
export interface PhoneListingSnapshot {
  readonly android: readonly PhoneDeviceSummary[]
  readonly ios: readonly PhoneDeviceSummary[]
}

/** Synchronous fleet badge projection. */
export interface PhoneBadgeSnapshot {
  readonly onlineCount: number
}

/** Reactive Phone enable gate. */
export interface PhoneGateSource {
  snapshot(): boolean
  subscribe(listener: () => void): () => void
}

/** Listing source shared by picker, connected view, and descriptor badge. */
export interface PhoneListingSource {
  getBadge(): PhoneBadgeSnapshot
  snapshot(): PhoneListingSnapshot
  refresh(): Promise<void>
  subscribe(listener: () => void): () => void
}

/** Durable device occupation of the singleton Phone occurrence. */
export type PhoneDeviceTabMeta = {
  readonly kind: 'device'
  readonly serial: DeviceId
  readonly name: string
}

/** Picker state is an empty object; a device state carries identity and title. */
export type OfficialPhonePayload = PhoneDeviceTabMeta | Record<string, never>

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabPayloadMap {
    phone: OfficialPhonePayload
  }
}

/** Read a valid device payload; every other JSON value renders the picker. */
export function phoneDeviceTabMetaOf(meta: unknown): PhoneDeviceTabMeta | undefined {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const record = meta as Record<string, unknown>
  if (record.kind !== 'device'
    || typeof record.serial !== 'string' || record.serial === ''
    || typeof record.name !== 'string' || record.name === '') return undefined
  return { kind: 'device', serial: phoneDeviceIdOf(record.serial), name: record.name }
}

/** Strip badge value. */
export function phoneBadgeValue(source: PhoneListingSource): number | null {
  const count = source.getBadge().onlineCount
  return count > 0 ? count : null
}

/** zh occupied title fallback. */
export function phoneTabTitleOf(name: string): string {
  return `手机·${name}`
}

/** Props mapped from official tab information into the existing Phone bodies. */
export interface PhoneTabBodyProps {
  readonly tab: { readonly id: string; readonly meta?: unknown }
  readonly visible: boolean
}

/** Body environment independent of the official Slot renderer. */
export interface PhoneTabEnvironment {
  readonly gate: PhoneGateSource
  readonly source: PhoneListingSource
  readonly switchDevice: (serial: DeviceId, name: string) => void
  readonly showPicker: () => void
  readonly controller: PhoneConnectionController | undefined
  readonly createController: (serial: DeviceId) => PhoneConnectionController
}

/** Exact official services used by Phone registration. */
export type OfficialPhoneContext = Pick<
  ClientContext,
  'slots' | 'sidebarRight' | 'sidebarRightTabs'
>

interface OwnedConnection {
  readonly serial: DeviceId
  readonly controller: PhoneConnectionController
}

function occurrenceKey(tab: Pick<SidebarRightTabProjection, 'sessionId' | 'record'>): string {
  return `${tab.sessionId}\u0000${tab.record.id}`
}

/** Connection owner whose lifetime follows official occurrences rather than React mounts. */
export class PhoneOccurrenceRuntime {
  private readonly owned = new Map<string, OwnedConnection>()

  constructor(
    private readonly ctx: Pick<ClientContext, 'sidebarRight'>,
    private readonly createController: (serial: DeviceId) => PhoneConnectionController,
  ) {}

  sync(): void {
    const seen = new Set<string>()
    for (const session of this.ctx.sidebarRight.getSnapshot().sessions) {
      for (const tab of session.tabs) {
        if (tab.record.kind !== PHONE_TAB_ID) continue
        const device = phoneDeviceTabMetaOf(tab.state.payload)
        const key = occurrenceKey(tab)
        if (device === undefined) {
          this.release(key)
          continue
        }
        seen.add(key)
        let owned = this.owned.get(key)
        if (owned?.serial !== device.serial) {
          owned?.controller.dispose()
          owned = { serial: device.serial, controller: this.createController(device.serial) }
          this.owned.set(key, owned)
        }
        owned.controller.setVisible(tab.visible)
      }
    }
    for (const key of this.owned.keys()) {
      if (!seen.has(key)) this.release(key)
    }
  }

  controllerFor(sessionId: string, tabId: string): PhoneConnectionController | undefined {
    return this.owned.get(`${sessionId}\u0000${tabId}`)?.controller
  }

  dispose(): void {
    for (const connection of this.owned.values()) connection.controller.dispose()
    this.owned.clear()
  }

  private release(key: string): void {
    this.owned.get(key)?.controller.dispose()
    this.owned.delete(key)
  }
}

/** Options used to build the official definition. */
export interface OfficialPhoneDefinitionOptions {
  readonly source: PhoneListingSource
  readonly title: () => string
  readonly occupiedTitle: (name: string) => string
  readonly guideDescription?: () => string
}

/** Build the official singleton Phone descriptor. */
export function buildOfficialPhoneDefinition(options: OfficialPhoneDefinitionOptions): SidebarRightTabDefinition {
  return {
    id: PHONE_DEFINITION_ID,
    kind: PHONE_TAB_ID,
    priority: 'builtin',
    order: PHONE_TAB_ORDER,
    icon: 'phone',
    title: options.title,
    guide: [{ description: options.guideDescription ?? options.title }],
    single: true,
    create: (request) => {
      if (request.payload === undefined) return { title: options.title(), payload: {} }
      const device = phoneDeviceTabMetaOf(request.payload)
      if (device === undefined) return false
      return { title: options.occupiedTitle(device.name), payload: device }
    },
    dedupeKey: (_tab: SidebarRightDescriptorTab) => PHONE_TAB_ID,
    badge: () => phoneBadgeValue(options.source),
  }
}

/** Open or focus Phone and switch the singleton occurrence to one device. */
export async function openPhoneDevicePanel(
  sidebar: ClientContext['sidebarRight'],
  isEnabled: () => boolean,
  serial: DeviceId,
  name: string,
  occupiedTitle: (name: string) => string,
): Promise<void> {
  if (!isEnabled()) return
  const tabId = await sidebar.openTab(PHONE_TAB_ID)
  sidebar.update(tabId, {
    title: occupiedTitle(name),
    payload: { kind: 'device', serial, name },
  })
}
