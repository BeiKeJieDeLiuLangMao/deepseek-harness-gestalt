/** Scheme-C Android/iOS platform cards below the shared mobilecli runtime. */
import { useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PhoneAndroidView, PhoneIosView } from './phone-runtime-source.ts'
import css from './PhonePlatformCards.module.css'

type PhoneCopy = PropsLocale<'settings.phone-devices'>['t']

export interface PhonePlatformCardsProps {
  readonly t: PhoneCopy
  readonly android: PhoneAndroidView
  readonly ios: PhoneIosView
  readonly iosUnsupportedMessage: string
  readonly onPrepareAndroid: () => void
  readonly onCancelAndroid: () => void
  readonly onRefreshAndroid: () => void
  readonly onStartAndroid: () => void
  readonly onPrepareIos: () => void
  readonly onCancelIos: () => void
  readonly onRefreshIos: () => void
  readonly onStartIos: () => void
}

/** Render Android preparation and the stable iOS capability card as parallel platform lanes. */
export function PhonePlatformCards(props: PhonePlatformCardsProps): ReactNode {
  const [confirming, setConfirming] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const plan = 'plan' in props.android ? props.android.plan : undefined
  const begin = (): void => { setConfirming(true); setAccepted(false) }
  const confirm = (): void => {
    setConfirming(false)
    props.onPrepareAndroid()
  }
  return (
    <div className={css.grid} data-phone-platform-grid>
      <article className={css.card} data-phone-platform-android={props.android.kind}>
        <header className={css.head}>
          <span className={css.logo} aria-hidden="true" translate="no">A</span>
          <div><h3>{props.t('common.android')}</h3><p>{props.t('platform.android.subtitle')}</p></div>
        </header>
        <div className={css.components}>
          <ComponentRow title="platform-tools" detail={componentDetail(plan?.components.platformTools, 'adb', props.t)} />
          <ComponentRow title={props.t('platform.component.emulator')} detail={componentDetail(plan?.components.emulator, props.t('platform.component.emulatorMissing'), props.t)} />
          <ComponentRow title={props.t('platform.component.pixel')} detail={componentDetail(plan?.components.systemImage && plan.components.avd, props.t('platform.component.pixelMissing'), props.t)} />
        </div>
        <AndroidStatus t={props.t} state={props.android} />
        {confirming && plan !== undefined && (
          <div className={css.confirm} data-phone-android-confirm>
            <strong>{props.t('platform.android.confirmTitle')}</strong>
            <dl>
              <div><dt>{props.t('platform.source')}</dt><dd>{props.t('platform.sourceValue')}</dd></div>
              <div><dt>{props.t('platform.cliTools')}</dt><dd>{`${formatBytes(plan.commandLineToolsBytes, props.t)} · ${plan.commandLineToolsVersion}`}</dd></div>
              <div><dt>{props.t('platform.disk')}</dt><dd>{formatBytes(plan.minimumFreeBytes, props.t)}</dd></div>
              <div><dt>{props.t('platform.sdkRoot')}</dt><dd><code>{plan.sdkRoot}</code></dd></div>
              <div><dt>{props.t('platform.avd')}</dt><dd><code>{`${plan.avdName} · ${plan.abi}`}</code></dd></div>
            </dl>
            <label className={css.license}>
              <input type="checkbox" checked={accepted} onChange={(event) => { setAccepted(event.target.checked) }} />
              <span>
                {props.t('platform.license.accept')}
                {' '}<a href={plan.licenseUrl} target="_blank" rel="noreferrer">{props.t('platform.license.name')}</a>
              </span>
            </label>
            <div className={css.confirmActions}>
              <Button variant="outline" onClick={() => { setConfirming(false) }}>{props.t('platform.back')}</Button>
              <Button variant="primary" disabled={!accepted} onClick={confirm}>{props.t('platform.accept')}</Button>
            </div>
          </div>
        )}
        {!confirming && (
          <AndroidActions
            t={props.t}
            state={props.android}
            onPrepare={begin}
            onCancel={props.onCancelAndroid}
            onRefresh={props.onRefreshAndroid}
            onStart={props.onStartAndroid}
          />
        )}
      </article>
      <article className={css.card} data-phone-platform-ios={props.ios.kind}>
        <header className={css.head}>
          <span className={css.logo} aria-hidden="true">●</span>
          <div><h3>{props.t('common.ios')}</h3><p>{props.t('platform.ios.subtitle')}</p></div>
        </header>
        {props.ios.kind === 'unsupported'
          ? <IosUnsupported t={props.t} message={props.iosUnsupportedMessage || props.ios.reason} />
          : <>
            <IosComponents t={props.t} state={props.ios} />
            <IosStatus t={props.t} state={props.ios} />
            <IosActions
              t={props.t}
              state={props.ios}
              onPrepare={props.onPrepareIos}
              onCancel={props.onCancelIos}
              onRefresh={props.onRefreshIos}
              onStart={props.onStartIos}
            />
          </>}
      </article>
    </div>
  )
}

function IosComponents({ t, state }: { readonly t: PhoneCopy; readonly state: PhoneIosView }): ReactNode {
  const plan = 'plan' in state ? state.plan : undefined
  const xcodeDetected = plan !== undefined || state.kind === 'license-required'
    || state.kind === 'manual-required' && state.developerDir !== undefined
  return (
    <div className={css.components}>
      <ComponentRow title={t('platform.component.xcode')} detail={componentDetail(xcodeDetected, t('platform.component.xcodeMissing'), t)} />
      <ComponentRow title={t('platform.component.runtime')} detail={componentDetail(plan?.runtime !== undefined, t('platform.component.runtimeMissing'), t)} />
      <ComponentRow title={t('platform.component.iphone')} detail={componentDetail(
        state.kind === 'ready' || state.kind === 'preparing' && state.step === 'booting',
        plan?.deviceType?.name ?? t('platform.component.defaultIphone'),
        t,
      )} />
    </div>
  )
}

function IosUnsupported({ t, message }: { readonly t: PhoneCopy; readonly message: string }): ReactNode {
  return <div className={css.unavailable}><strong>{t('platform.ios.needXcode')}</strong><p>{message}</p></div>
}

type SupportedIosView = Exclude<PhoneIosView, { readonly kind: 'unsupported' }>

function IosStatus(props: { readonly t: PhoneCopy; readonly state: SupportedIosView }): ReactNode {
  const { t, state } = props
  switch (state.kind) {
    case 'deferred': return <p className={css.status}>{t('platform.ios.deferred')}</p>
    case 'checking': return <p className={css.status}>{t('platform.ios.checking')}</p>
    case 'xcode-missing': return <p className={css.problem}>{state.message}</p>
    case 'license-required': return <p className={css.problem}>{t('platform.ios.license').replace('{message}', state.message)}</p>
    case 'manual-required': return <p className={css.problem}>{state.message}</p>
    case 'runtime-missing': return <p className={css.status}>{t('platform.ios.runtimeMissing')}</p>
    case 'no-simulator': return <p className={css.status}>{t('platform.ios.noSimulator')}</p>
    case 'preparing': return <p className={css.status}>{iosStep(state.step, t)}</p>
    case 'ready': return <p className={css.success}>{state.running
      ? t('platform.ios.readyRunning').replace('{deviceId}', state.deviceId)
      : t('platform.ios.readyIdle')}</p>
    case 'failed': return <p className={css.problem}>{state.message}</p>
  }
}

function IosActions(props: {
  readonly t: PhoneCopy
  readonly state: SupportedIosView
  readonly onPrepare: () => void
  readonly onCancel: () => void
  readonly onRefresh: () => void
  readonly onStart: () => void
}): ReactNode {
  if (props.state.kind === 'preparing'
    || props.state.kind === 'checking' && props.state.operation === 'prepare') {
    return <Button variant="outline" onClick={props.onCancel}>{props.t('common.cancel')}</Button>
  }
  if (props.state.kind === 'ready') {
    return <SimulatorReadyActions t={props.t} running={props.state.running} onStart={props.onStart} onRefresh={props.onRefresh} />
  }
  if (props.state.kind === 'runtime-missing' || props.state.kind === 'no-simulator'
    || props.state.kind === 'failed' && props.state.retryable) {
    return (
      <div className={css.actions}>
        <Button variant="primary" onClick={props.onPrepare}>{props.t('platform.ios.prepare')}</Button>
        <Button variant="outline" onClick={props.onRefresh}>{props.t('common.redetect')}</Button>
      </div>
    )
  }
  if (props.state.kind === 'xcode-missing' || props.state.kind === 'license-required' || props.state.kind === 'manual-required') {
    return <Button variant="outline" onClick={props.onRefresh}>{props.t('platform.ios.manual')}</Button>
  }
  return null
}

function iosStep(step: 'downloading-runtime' | 'creating-simulator' | 'booting', t: PhoneCopy): string {
  if (step === 'downloading-runtime') return t('platform.ios.step.runtime')
  if (step === 'creating-simulator') return t('platform.ios.step.create')
  return t('platform.ios.step.boot')
}

function ComponentRow(props: { readonly title: string; readonly detail: { ok: boolean; text: string } }): ReactNode {
  return (
    <div className={css.component}>
      <span className={props.detail.ok ? css.ok : css.missing} aria-hidden="true">{props.detail.ok ? '✓' : '!'}</span>
      <div><strong>{props.title}</strong><small>{props.detail.text}</small></div>
    </div>
  )
}

function componentDetail(value: boolean | undefined, missing: string, t: PhoneCopy): { ok: boolean; text: string } {
  if (value === true) return { ok: true, text: t('platform.component.detected') }
  return { ok: false, text: value === false ? missing : t('platform.component.checking') }
}

function AndroidStatus({ t, state }: { readonly t: PhoneCopy; readonly state: PhoneAndroidView }): ReactNode {
  switch (state.kind) {
    case 'deferred': return <p className={css.status}>{t('platform.android.deferred')}</p>
    case 'unsupported': return <p className={css.problem}>{state.reason}</p>
    case 'checking': return <p className={css.status}>{t('platform.android.checking')}</p>
    case 'missing':
    case 'awaiting-license': return <p className={css.status}>{t('platform.android.missing')}</p>
    case 'downloading': return <Progress t={t} value={state.receivedBytes} max={state.totalBytes} label={t('platform.android.downloadCli')} />
    case 'installing': return <p className={css.status}>{state.step === 'licenses' ? t('platform.android.licenses') : t('platform.android.installing')}</p>
    case 'creating-avd': return <p className={css.status}>{t('platform.android.creatingAvd')}</p>
    case 'checking-acceleration': return <p className={css.status}>{t('platform.android.acceleration')}</p>
    case 'booting': return <p className={css.status}>{t('platform.android.booting')}</p>
    case 'manual-required': return <p className={css.problem}>{state.message}</p>
    case 'ready': return <p className={css.success}>{state.running
      ? (state.deviceId === undefined
        ? t('platform.android.readyRunning')
        : t('platform.android.readyRunningWithId').replace('{deviceId}', state.deviceId))
      : t('platform.android.readyIdle')}</p>
    case 'failed': return <p className={css.problem}>{state.message}</p>
  }
}

function AndroidActions(props: {
  readonly t: PhoneCopy
  readonly state: PhoneAndroidView
  readonly onPrepare: () => void
  readonly onCancel: () => void
  readonly onRefresh: () => void
  readonly onStart: () => void
}): ReactNode {
  const busy = props.state.kind === 'downloading' || props.state.kind === 'installing'
    || props.state.kind === 'creating-avd' || props.state.kind === 'checking-acceleration'
    || props.state.kind === 'booting'
  if (busy) return <Button variant="outline" onClick={props.onCancel}>{props.t('common.cancel')}</Button>
  if (props.state.kind === 'ready') {
    return <SimulatorReadyActions t={props.t} running={props.state.running} onStart={props.onStart} onRefresh={props.onRefresh} />
  }
  if (props.state.kind === 'unsupported' || props.state.kind === 'deferred' || props.state.kind === 'checking') return null
  return (
    <div className={css.actions}>
      <Button variant="primary" onClick={props.onPrepare}>{props.t('platform.android.prepare')}</Button>
      <Button variant="outline" onClick={props.onRefresh}>{props.t('common.redetect')}</Button>
    </div>
  )
}

function SimulatorReadyActions(props: {
  readonly t: PhoneCopy
  readonly running: boolean
  readonly onStart: () => void
  readonly onRefresh: () => void
}): ReactNode {
  return (
    <div className={css.actions}>
      {!props.running && <Button variant="primary" onClick={props.onStart}>{props.t('platform.startSimulator')}</Button>}
      <Button variant="outline" onClick={props.onRefresh}>{props.t('common.redetect')}</Button>
    </div>
  )
}

function Progress(props: { readonly t: PhoneCopy; readonly value: number; readonly max: number; readonly label: string }): ReactNode {
  return (
    <div className={css.progress}>
      <span>{`${props.label} · ${formatBytes(props.value, props.t)} / ${formatBytes(props.max, props.t)}`}</span>
      <progress value={props.value} max={props.max} aria-label={props.label} />
    </div>
  )
}

function formatBytes(bytes: number, t: PhoneCopy): string {
  return bytes === 0 ? t('platform.noDownload') : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
