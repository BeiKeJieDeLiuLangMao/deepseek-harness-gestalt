/**
 * Workspace Settings → IM Takeover: route editor. New rules start disabled;
 * disabling a specific rule keeps the binding and does not fall back to All.
 */
import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { Button, Input, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ImGuiFace } from './faces.ts'
import {
  disabledKeepsBinding, draftFromRoute, emptyRouteDraft, routeDraftError, type ImRouteDraft, type ImRouteView,
} from './model.ts'
import css from './WorkspaceCards.module.css'

/** Props bound for the IM Takeover workspace card. */
export type TakeoverSectionProps =
  PropsRuntime<'workspace.settings.section'>
  & PropsLocale<'settings.im'>
  & InjectFace<ImGuiFace>

/**
 * Render the IM Takeover card for one workspace.
 * @param props - owner workspace id, locale, and GUI callbacks.
 */
export function TakeoverSection(props: TakeoverSectionProps) {
  const snapshot = props.useGui(state => state)
  const routes = snapshot.routes.filter(route => route.workspaceId === props.workspaceId)
  const connected = snapshot.accounts.filter(account => account.connected && account.authState !== 'expired')
  const [editing, setEditing] = useState<ImRouteView | 'add' | null>(null)
  if (editing !== null) {
    const existing = editing === 'add' ? undefined : editing
    return (
      <section className={css.card} data-im-takeover>
        <div className={css.title}>{existing === undefined ? props.t('addRoute') : props.t('editRoute')}</div>
        <RouteForm
          t={props.t}
          accounts={connected}
          draft={existing === undefined
            ? emptyRouteDraft(connected[0]?.id ?? '')
            : draftFromRoute(existing)}
          existing={existing}
          onCancel={() => { setEditing(null) }}
          onSave={(draft) => {
            props.saveRoute(props.workspaceId, draft, existing)
            setEditing(null)
          }}
        />
      </section>
    )
  }
  return (
    <section className={css.card} data-im-takeover>
      <div className={css.title}>{props.t('takeoverTitle')}</div>
      <p className={css.intro}>{props.t('takeoverIntro')}</p>
      {connected.length === 0 && <p className={css.hint}>{props.t('noAccounts')}</p>}
      {routes.length === 0 && (
        <div>
          <div className={css.name}>{props.t('emptyRoutes')}</div>
          <p className={css.hint}>{props.t('emptyRoutesHint')}</p>
        </div>
      )}
      {routes.map((route) => {
        const account = snapshot.accounts.find(row => row.id === route.accountId)
        const kind = route.conversationKind === 'group' ? props.t('kindGroup') : props.t('kindDirect')
        const scope = route.scope === 'all' ? props.t('scopeAll') : props.t('scopeSpecific')
        return (
          <div key={route.id} className={css.row} data-route={route.id}>
            <div className={css.main}>
              <div className={css.name}>
                {account?.displayName ?? route.accountId} · {kind} · {scope}
                {route.scope === 'specific' && <Tag tone="info">{props.t('specificPriority')}</Tag>}
                {disabledKeepsBinding(route) && <Tag tone="neutral">{props.t('disabledKeep')}</Tag>}
              </div>
              <p className={css.sub}>
                {route.scope === 'all' ? scope : route.targets.join('、')}
                {disabledKeepsBinding(route) ? ` · ${props.t('disabledKeepHint')}` : ''}
              </p>
            </div>
            <div className={css.acts}>
              <Button variant="outline" size="sm" onClick={() => { setEditing(route) }}>
                {props.t('editRoute')}
              </Button>
              <Switch
                checked={route.enabled}
                label={props.t('enabled')}
                onChange={(next) => { props.setRouteEnabled(route.id, next) }}
              />
            </div>
          </div>
        )
      })}
      <Button variant="outline" onClick={() => { setEditing('add') }}>{props.t('addRoute')}</Button>
    </section>
  )
}

function RouteForm({ t, accounts, draft: initial, existing, onCancel, onSave }: {
  t: TakeoverSectionProps['t']
  accounts: readonly { readonly id: string; readonly displayName: string }[]
  draft: ImRouteDraft
  existing: ImRouteView | undefined
  onCancel: () => void
  onSave: (draft: ImRouteDraft) => void
}) {
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState<string | undefined>(undefined)
  const set = (patch: Partial<ImRouteDraft>): void => {
    setDraft({ ...draft, ...patch })
    setError(undefined)
  }
  return (
    <div className={css.form} data-im-route-form>
      <label>
        {t('account')}
        <select
          aria-label={t('account')}
          value={draft.accountId}
          onChange={(event) => { set({ accountId: event.target.value }) }}
        >
          {accounts.map(account => (
            <option key={account.id} value={account.id}>{account.displayName}</option>
          ))}
        </select>
      </label>
      <label>
        <select
          aria-label={t('kindGroup')}
          value={draft.conversationKind}
          onChange={(event) => {
            set({ conversationKind: event.target.value === 'direct' ? 'direct' : 'group' })
          }}
        >
          <option value="group">{t('kindGroup')}</option>
          <option value="direct">{t('kindDirect')}</option>
        </select>
      </label>
      <label>
        <input
          type="radio"
          name="im-scope"
          aria-label={t('scopeAll')}
          checked={draft.scope === 'all'}
          onChange={() => { set({ scope: 'all' }) }}
        />
        {t('scopeAll')}
      </label>
      <label>
        <input
          type="radio"
          name="im-scope"
          aria-label={t('scopeSpecific')}
          checked={draft.scope === 'specific'}
          onChange={() => { set({ scope: 'specific' }) }}
        />
        {t('scopeSpecific')}
      </label>
      {draft.scope === 'specific' && (
        <Input
          aria-label={t('targetsPlaceholder')}
          placeholder={t('targetsPlaceholder')}
          value={draft.targetsText}
          onChange={(event) => { set({ targetsText: event.target.value }) }}
        />
      )}
      {draft.conversationKind === 'group' && (
        <div className={css.checks}>
          <div className={css.name}>{t('triggerTitle')}</div>
          <label>
            <input
              type="checkbox"
              checked={draft.mention}
              onChange={(event) => { set({ mention: event.target.checked }) }}
            />
            {t('triggerMention')}
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.everyNEnabled}
              onChange={(event) => { set({ everyNEnabled: event.target.checked }) }}
            />
            {t('triggerEveryN')}
            <Input
              type="number"
              min={1}
              aria-label={t('triggerEveryN')}
              value={draft.everyN}
              onChange={(event) => { set({ everyN: event.target.value, everyNEnabled: true }) }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.intervalEnabled}
              onChange={(event) => { set({ intervalEnabled: event.target.checked }) }}
            />
            {t('triggerInterval')}
            <Input
              type="number"
              min={1}
              aria-label={t('triggerInterval')}
              value={draft.intervalMin}
              onChange={(event) => { set({ intervalMin: event.target.value, intervalEnabled: true }) }}
            />
          </label>
          <p className={css.hint}>{t('triggerHint')}</p>
        </div>
      )}
      {error !== undefined && <div className={css.error} role="alert">{error}</div>}
      <div className={css.acts}>
        <Button variant="outline" onClick={onCancel}>{t('cancel')}</Button>
        <Button
          variant="primary"
          onClick={() => {
            const key = routeDraftError(draft)
            if (key !== undefined) { setError(t(key)); return }
            onSave(draft)
          }}
        >
          {existing === undefined ? t('addRouteDisabled') : t('saveRoute')}
        </Button>
      </div>
    </div>
  )
}
