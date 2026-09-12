/**
 * Phone tab body: the not-connected empty state of the locked design —
 * state with the platform selector, the grouped device list, and the
 * 重新检测环境 control that pulls the fleet listing. While the tab is
 * mounted and enabled it also polls `GET /phone/devices` on the Host
 * interval so USB reals appear without that click. The same tab
 * instance renders the live view once a device occupies it; every fact
 * this component reads arrives through plain props (the enable gate, the
 * listing source, the in-place device switcher), never through a service
 * or context.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { DeviceId } from '@deepseek-ai/dsh-phone-runtime'
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { startPhoneListingPoll } from './phone-listing-poll.ts'
import {
  PHONE_PLATFORMS, type PhoneDeviceSummary, type PhoneGateSource, type PhoneListingSource, type PhonePlatform,
} from './registry.ts'
import { PhoneStreamHttpError } from './phone-stream-client.ts'
import css from './PhoneTab.module.css'
import shared from './PhoneShared.module.css'

/** Props of the phone tab body, threaded from the descriptor closure. */
export interface PhoneTabProps {
  readonly t: PropsLocale<'settings.phone-devices'>['t']
  /** Reactive enable gate; the strip follows invalidations live. */
  readonly gate: PhoneGateSource
  /** Listing source backing the rows (starts empty until a pull commits). */
  readonly source: PhoneListingSource
  /** Switch the single tab onto one listed online device in place (U1). */
  readonly onOpenDevice: (serial: DeviceId, name: string) => void
}

/** List order of the mockup's group headers. */
const GROUPS: readonly { readonly channel: PhoneDeviceSummary['channel'] }[] = [
  { channel: 'emulator' },
  { channel: 'usb' },
]

/**
 * Row meta caption for a listed online device. Offline rows are omitted
 * (U2); unauthorized handsets render the warn arm instead of this caption.
 */
function runningStateOf(device: PhoneDeviceSummary, t: PhoneTabProps['t']): string {
  return device.channel === 'emulator' ? t('tab.running') : t('tab.online')
}

/**
 * The meta line. The upstream wire carries no OS version field, so the
 * caption degrades to the running state alone (P5 leftover note).
 */
function rowMetaOf(device: PhoneDeviceSummary, t: PhoneTabProps['t']): string {
  return runningStateOf(device, t)
}

/** Copy the picker error arm shows for one listing-pull failure. */
function listingErrorCopy(error: unknown, t: PhoneTabProps['t']): { title: string; detail: string } {
  if (error instanceof PhoneStreamHttpError && error.code === 'PHONE_UNRESOLVED') {
    return {
      title: t('tab.listing.unresolved.title'),
      detail: t('tab.listing.unresolved.detail'),
    }
  }
  return {
    title: t('tab.listing.failed.title'),
    detail: error instanceof Error && error.message.length > 0
      ? error.message
      : t('tab.listing.failed.detail'),
  }
}

/**
 * Render the empty-state body for one tab.
 * @param props - enable-gate value, the injected listing source, and the opener.
 * @returns the not-connected empty state.
 */
export function PhoneTab({ t, gate, source, onOpenDevice }: PhoneTabProps): ReactNode {
  const [platform, setPlatform] = useState<PhonePlatform>('android')
  // The gate and the listing source are the owning observables; uSES is the
  // render-side adapter (better-sidebar tab hosts have no slot hook channel).
  const subscribe = useCallback((listener: () => void) => source.subscribe(listener), [source])
  const getSnapshot = useCallback(() => source.snapshot(), [source])
  const listing = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const gateSubscribe = useCallback((listener: () => void) => gate.subscribe(listener), [gate])
  const gateSnapshot = useCallback(() => gate.snapshot(), [gate])
  const enabled = useSyncExternalStore(gateSubscribe, gateSnapshot, gateSnapshot)
  const [refreshing, setRefreshing] = useState(false)
  const [listingError, setListingError] = useState<unknown>()
  const refresh = useCallback((): void => {
    setRefreshing(true)
    // A failed pull keeps the committed listing on screen and lights the
    // error arm; the next click retries.
    source.refresh()
      .then(() => { setListingError(undefined) })
      .catch((error: unknown) => { setListingError(error) })
      .finally(() => { setRefreshing(false) })
  }, [source])
  useEffect(() => {
    if (!enabled) return
    refresh()
  }, [enabled, refresh])
  useEffect(() => {
    if (!enabled) return
    return startPhoneListingPoll(source)
  }, [enabled, source])
  const devices = listing[platform]
  const listingFailure = listingError === undefined ? undefined : listingErrorCopy(listingError, t)
  return (
    <div className={css.phone}>
      {!enabled && (
        <div className={css.gateBanner} role="note" aria-label={t('tab.gate.title')}>
          <p className={css.gateTitle}>{t('tab.gate.title')}</p>
          <p className={css.gateDesc}>{t('tab.gate.detail')}</p>
        </div>
      )}
      <div className={css.platformSeg} role="group" aria-label={t('tab.platform.label')}>
        {PHONE_PLATFORMS.map(candidate => (
          <button
            key={candidate}
            type="button"
            className={
              candidate === platform ? `${css.platformOption} ${css.platformActive}` : css.platformOption
            }
            aria-pressed={candidate === platform}
            onClick={() => { setPlatform(candidate) }}
          >
            {candidate === 'android' ? t('common.android') : t('common.ios')}
          </button>
        ))}
      </div>
      <p className={css.platformHint}>{t(platform === 'android' ? 'tab.platformHint.android' : 'tab.platformHint.ios')}</p>
      {listingFailure !== undefined && (
        <div role="alert" className={css.listingFailedArm}>
          <p className={css.unauthorizedTitle}>{listingFailure.title}</p>
          <p className={css.unauthorizedDetail}>{listingFailure.detail}</p>
          <div className={css.alertActions}>
            <button
              type="button"
              className={css.redetectButton}
              disabled={refreshing}
              onClick={refresh}
            >
              {t('common.redetect')}
            </button>
          </div>
        </div>
      )}
      {GROUPS.map(({ channel }) => {
        const group = devices.filter(device => device.channel === channel)
        const visible = group.filter(device => device.online || device.state === 'unauthorized')
        return (
          <section key={channel} aria-label={channel === 'emulator' ? t('tab.group.emulator') : t('tab.group.usb')}>
            <div className={css.groupName}>{channel === 'emulator' ? t('tab.group.emulator') : t('tab.group.usb')}</div>
            {visible.map(device => (
              device.state === 'unauthorized' ? (
                <div key={device.id} role="alert" className={css.unauthorizedArm}>
                  <p className={css.unauthorizedTitle}>{t('tab.unauthorized.title')}</p>
                  <p className={css.unauthorizedDetail}>
                    {(platform === 'ios' ? t('tab.unauthorized.ios') : t('tab.unauthorized.android')).replace('{name}', device.name)}
                  </p>
                  <div className={css.alertActions}>
                    <button
                      type="button"
                      className={css.redetectButton}
                      disabled={refreshing}
                      onClick={refresh}
                    >
                      {t('common.redetect')}
                    </button>
                  </div>
                </div>
              ) : (
                <div key={device.id} className={css.deviceRow}>
                  <span
                    aria-hidden="true"
                    className={css.deviceDot}
                  />
                  <span className={css.deviceName}>{device.name}</span>
                  <span className={css.deviceMeta}>{rowMetaOf(device, t)}</span>
                  <button
                    type="button"
                    className={shared.minibtnPrimary}
                    onClick={() => { onOpenDevice(device.id, device.name) }}
                  >
                    {t('common.open')}
                  </button>
                </div>
              )
            ))}
            {channel === 'usb' && visible.length === 0 && (
              <div className={css.emptyRow}>{platform === 'ios' ? t('tab.usb.empty.ios') : t('tab.usb.empty.android')}</div>
            )}
          </section>
        )
      })}
      <div className={css.redetectZone}>
        <button
          type="button"
          className={css.redetectButton}
          disabled={!enabled || refreshing}
          onClick={refresh}
        >
          {t('tab.redetectEnvironment')}
        </button>
      </div>
    </div>
  )
}
