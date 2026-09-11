/**
 * Phone plugin settings card: the six locked mockup states of
 * design/device-dock/settings-card.html. Every fact arrives through props
 * (enable flag, environment view, callbacks); the component never reaches ctx.
 */
import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { DeviceId } from '@deepseek-ai/dsh-phone-runtime'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  PhoneEnvironmentCheck, PhoneEnvironmentError, PhoneEnvironmentView, PhoneReadyDevice,
} from './phone-environment.ts'
import { PhoneTabIcon } from './phone-icon.tsx'
import css from './PhoneSettingsCard.module.css'

/** Props of the phone settings card, threaded from the slot inject face. */
type PhoneCopy = PropsLocale<'settings.phone-devices'>['t']

export interface PhoneSettingsCardProps {
  readonly t: PhoneCopy
  /** Durable `ui-phone.enabled`; false keeps the off chrome. */
  readonly enabled: boolean
  /** Environment view the card switches on. */
  readonly view: PhoneEnvironmentView
  /** Persist the enable switch. */
  readonly onEnabledChange: (enabled: boolean) => void
  /** Re-run detection after the user finishes a wizard step. */
  readonly onRedetect: () => void
  /** Copy one command-level install line to the clipboard. */
  readonly onCopy: (command: string) => void
  /** Fire the unified next-action verb for one error row. */
  readonly onNextAction: (kind: string) => void
  /** Open one online device in the singleton Phone tab. */
  readonly onOpenDevice: (deviceId: DeviceId) => void
}

const DEVICE_GROUPS: readonly PhoneReadyDevice['group'][] = [
  'android-emulator',
  'ios-simulator',
  'usb',
]

function assertNever(value: never): never {
  throw new Error(`unhandled phone environment view: ${JSON.stringify(value)}`)
}

/**
 * Render the phone settings card for one environment view.
 * @param props - enable flag, environment view, and the card's callbacks.
 * @returns the card.
 */
export function PhoneSettingsCard(props: PhoneSettingsCardProps): ReactNode {
  const { t, enabled, view, onEnabledChange, onRedetect, onCopy, onNextAction, onOpenDevice } = props
  return (
    <article className={css.card}>
      <header className={css.head}>
        <div className={css.icon} aria-hidden="true">
          <PhoneTabIcon size={20} />
        </div>
        <div className={css.titleBlock}>
          <h3 className={css.title}>{titleOf(view, t)}</h3>
          <p className={css.description}>{descriptionOf(view, t)}</p>
        </div>
        {view.kind === 'ready' && (
          <span className={css.summary}>
            <span className={clsx(css.dot, css.dotOn)} />
            {t('card.summary').replace('{count}', String(view.availableCount))}
          </span>
        )}
        {view.kind === 'ready' && (
          <button type="button" className={css.ghost} onClick={onRedetect}>{t('common.redetect')}</button>
        )}
        <label className={css.switch}>
          <input
            type="checkbox"
            role="switch"
            aria-label={t('card.enable')}
            checked={enabled}
            onChange={(event) => { onEnabledChange(event.target.checked) }}
          />
          <span className={css.track} />
          <span className={css.knob} />
        </label>
      </header>
      {bodyOf(view, t, { onCopy, onNextAction, onOpenDevice })}
      {footerOf(view, t)}
    </article>
  )
}

function titleOf(view: PhoneEnvironmentView, t: PhoneCopy): string {
  if (view.kind === 'android-wizard') return t('card.title.androidWizard')
  if (view.kind === 'ios-wizard') return t('card.title.iosWizard')
  return t('title')
}

function descriptionOf(view: PhoneEnvironmentView, t: PhoneCopy): string {
  switch (view.kind) {
    case 'off': return t('card.description.off')
    case 'probing': return t('card.description.probing')
    case 'android-wizard': return t('card.description.androidWizard')
    case 'ios-wizard': return t('card.description.iosWizard')
    case 'ready': return t('card.description.ready')
    case 'errors': return t('card.description.errors')
  }
}

function bodyOf(
  view: PhoneEnvironmentView,
  t: PhoneCopy,
  actions: {
    onCopy: (command: string) => void
    onNextAction: (kind: string) => void
    onOpenDevice: (deviceId: DeviceId) => void
  },
): ReactNode {
  switch (view.kind) {
    case 'off':
      return null
    case 'probing':
      return <ProbingBody t={t} checks={view.checks} />
    case 'android-wizard':
      return <AndroidWizardBody t={t} platformToolsInstalled={view.platformToolsInstalled} onCopy={actions.onCopy} />
    case 'ios-wizard':
      return <IosWizardBody t={t} />
    case 'ready':
      return <ReadyBody t={t} devices={view.devices} onOpenDevice={actions.onOpenDevice} />
    case 'errors':
      return <ErrorsBody errors={view.errors} onNextAction={actions.onNextAction} />
    default:
      return assertNever(view)
  }
}

function footerOf(view: PhoneEnvironmentView, t: PhoneCopy): ReactNode {
  switch (view.kind) {
    case 'off': return <p className={css.foot}>{t('card.footer.off')}</p>
    case 'android-wizard': return <p className={css.foot}>{t('card.footer.androidWizard')}</p>
    case 'ios-wizard': return <p className={css.foot}>{t('card.footer.iosWizard')}</p>
    case 'ready': return <p className={css.foot}>{t('card.footer.ready')}</p>
    default: return null
  }
}

function ProbingBody({ t, checks }: { t: PhoneCopy; checks: readonly PhoneEnvironmentCheck[] }): ReactNode {
  return (
    <div className={css.body}>
      <div className={css.probeLine}>
        <span className={css.spinner} aria-hidden="true" />
        {t('card.probing')}
      </div>
      <div className={css.checklist}>
        {checks.map(check => (
          <div key={check.id} className={css.checkRow}>
            <CheckMark status={check.status} />
            <span className={css.checkName}>
              {check.name}
              <small>{check.caption}</small>
            </span>
            <span className={css.checkDetail}>{check.detail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CheckMark({ status }: { status: PhoneEnvironmentCheck['status'] }): ReactNode {
  if (status === 'pending') return <span className={css.spinner} aria-hidden="true" />
  return (
    <span className={clsx(css.iconDot, status === 'ok' ? css.ok : css.bad)} aria-hidden="true">
      {status === 'ok' ? '✓' : '✕'}
    </span>
  )
}

function AndroidWizardBody(props: {
  t: PhoneCopy
  platformToolsInstalled: boolean
  onCopy: (command: string) => void
}): ReactNode {
  void props.onCopy
  return (
    <div className={css.body}>
      <div className={css.steps}>
        <span className={clsx(css.stepchip, props.platformToolsInstalled && css.stepDone)}>
          <i>{props.platformToolsInstalled ? '✓' : '1'}</i>
          {props.t('card.platformTools')}
        </span>
        <span className={css.stepchip}><i>2</i>{props.t('card.step.image')}</span>
        <span className={css.stepchip}><i>3</i>{props.t('card.step.avd')}</span>
        <span className={css.stepchip}><i>4</i>{props.t('card.step.boot')}</span>
      </div>
      <div className={clsx(css.alert, css.info)}>
        <span className={clsx(css.iconDot, css.infoDot)} aria-hidden="true" translate="no">A</span>
        <p>
          {props.t('card.android.unready')}
          <small>{props.t('card.android.unreadyDetail')}</small>
        </p>
      </div>
    </div>
  )
}

function IosWizardBody({ t }: { t: PhoneCopy }): ReactNode {
  return (
    <div className={css.body}>
      <div className={clsx(css.alert, css.warn)}>
        <span className={clsx(css.iconDot, css.warnDot)} aria-hidden="true">!</span>
        <p>
          {t('card.ios.unready')}
          <small>{t('card.ios.unreadyDetail')}</small>
        </p>
      </div>
      <div className={clsx(css.alert, css.info)}>
        <span className={clsx(css.iconDot, css.infoDot)} aria-hidden="true" translate="no">A</span>
        <p>
          {t('card.usb.manual')}
          <small>{t('card.usb.manualDetail')}</small>
        </p>
      </div>
    </div>
  )
}

function ReadyBody(props: {
  t: PhoneCopy
  devices: readonly PhoneReadyDevice[]
  onOpenDevice: (deviceId: DeviceId) => void
}): ReactNode {
  const groupTitle = (id: PhoneReadyDevice['group']): string => {
    if (id === 'android-emulator') return props.t('card.group.androidEmulator')
    if (id === 'ios-simulator') return props.t('card.group.iosSimulator')
    return props.t('card.group.usb')
  }
  return (
    <div className={css.body}>
      {DEVICE_GROUPS.map((group) => {
        const rows = props.devices.filter(device => device.group === group)
        if (rows.length === 0) return null
        return (
          <section key={group} className={css.devGroup} aria-label={groupTitle(group)}>
            <div className={css.gname}>{groupTitle(group)}</div>
            {rows.map(device => (
              <div key={device.id} className={css.devRow}>
                <span
                  aria-hidden="true"
                  className={clsx(css.dot, device.online ? css.dotOn : css.dotOff)}
                />
                <span className={css.devName}>{device.name}</span>
                <span className={css.devMeta}>{device.meta}</span>
                <button
                  type="button"
                  className={clsx(css.ghost, css.openDevice)}
                  disabled={!device.online}
                  onClick={() => { props.onOpenDevice(device.id) }}
                >
                  {props.t('card.openPanel')}
                </button>
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}

function ErrorsBody(props: {
  errors: readonly PhoneEnvironmentError[]
  onNextAction: (kind: string) => void
}): ReactNode {
  return (
    <div className={css.body}>
      {props.errors.map(error => (
        <div
          key={error.kind}
          className={clsx(css.alert, error.kind === 'no-devices' ? css.warn : css.err)}
        >
          <span
            className={clsx(css.iconDot, error.kind === 'no-devices' ? css.warnDot : css.bad)}
            aria-hidden="true"
          >
            {error.kind === 'no-devices' ? '!' : '✕'}
          </span>
          <p>
            {error.title}
            <small>{error.detail}</small>
          </p>
          {error.command !== undefined && <code className={css.alertCmd}>{error.command}</code>}
          <button
            type="button"
            className={css.ghost}
            onClick={() => { props.onNextAction(error.kind) }}
          >
            {error.nextAction}
          </button>
        </div>
      ))}
    </div>
  )
}
