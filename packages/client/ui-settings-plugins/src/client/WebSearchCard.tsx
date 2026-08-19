/**
 * One Web Search card: provider tabs plus the selected tab's fields.
 * Extra plugins register more tabs into `settings.plugin.web-search.provider`.
 */

import { useId, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { SecretField, ValueField } from './fields.tsx'
import { PluginCard } from './PluginCard.tsx'
import cardCss from './PluginCard.module.css'
import type { WebSearchProbe, WebSearchShellFace } from './web-search-card-controller.ts'
import type {} from './slot-contract.ts'

/** Props the renderer binds for the Web Search card. */
export type WebSearchCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.plugins'>
  & PropsRenderSlots<'settings.plugin.web-search.provider'>
  & InjectFace<WebSearchShellFace>

/**
 * Render the Web Search card.
 * @param props - locale copy, the selected provider form, and its tab ledger.
 * @returns the card.
 */
export function WebSearchCard(props: WebSearchCardProps) {
  const { t, selectProvider, renderSlot: _declareProviderSlot, testSearch } = props
  void _declareProviderSlot
  const tabsId = useId()
  const [probe, setProbe] = useState<'idle' | 'running' | WebSearchProbe>('idle')
  const state = props.useWebSearchCard(snapshot => snapshot)
  const tabs = props.useProviderTabs(rows => rows)
  const backend = tabs.some(tab => tab.id === state.selectedProvider)
    ? state.selectedProvider
    : tabs[0]?.id
  const hintKey = backend === 'kimi'
    ? 'kimiSearchBaseUrlHint'
    : backend === 'anthropic-messages'
      ? 'anthropicSearchBaseUrlHint'
      : 'webSearchBaseUrlHint'
  const disabled = !state.writable

  return (
    <PluginCard
      t={t}
      titleKey={props.titleKey}
      descriptionKey={props.descriptionKey}
      state={{ ...state, available: true }}
      onSave={props.save}
      onDiscard={props.discard}
      leadingActions={(
        <>
          <button
            type="button"
            className={cardCss.test}
            disabled={probe === 'running'}
            onClick={() => {
              setProbe('running')
              void testSearch().then(setProbe)
            }}
          >
            {t(probe === 'running' ? 'testSearchRunning' : 'testSearch')}
          </button>
          {probe !== 'idle' && probe !== 'running'
            ? (
              <p className={cardCss.testStatus} data-kind={probe.status} role="status">
                {probe.status === 'ok'
                  ? (probe.count === 0
                    ? t('testSearchEmpty')
                    : `${t('testSearchOk')} · ${probe.count}${probe.title === undefined ? '' : ` · ${probe.title}`}`)
                  : `${t('testSearchFailed')}: ${probe.message}`}
              </p>
            )
            : null}
        </>
      )}
    >
      {tabs.length > 0
        ? (
          <div className={cardCss.providerTabs} role="tablist" aria-label={t('providerTabs')}>
            {tabs.map((tab) => {
              const isSelected = tab.id === backend
              return (
                <button
                  key={tab.id}
                  id={`${tabsId}-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  className={cardCss.providerTab}
                  aria-selected={isSelected}
                  data-active={isSelected ? 'true' : undefined}
                  onClick={() => {
                    setProbe('idle')
                    selectProvider(tab.id)
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        )
        : null}
      <SecretField
        id="plugin-config-web-search-key"
        label={t('webSearchApiKey')}
        hint={t('webSearchApiKeyHint')}
        disabled={!state.apiKeyWritable}
        text={state.apiKey.text}
        configured={state.apiKeyConfigured}
        stateLabel={state.apiKeyConfigured ? t('webSearchApiKeySet') : t('webSearchApiKeyUnset')}
        onEdit={(text) => { props.edit('apiKey', text) }}
      />
      <ValueField
        id="plugin-config-web-search-endpoint"
        label={t('webSearchBaseUrl')}
        hint={t(hintKey)}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidNumber')}
        disabled={disabled}
        {...state.baseURL}
        onEdit={(text) => { props.edit('baseURL', text) }}
        onReset={() => { props.resetField('baseURL') }}
      />
      <ValueField
        id="plugin-config-web-search-max-uses"
        label={t('webSearchMaxUses')}
        hint={t('webSearchMaxUsesHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidNumber')}
        numeric
        disabled={disabled}
        {...state.maxUses}
        text={state.maxUses.text === '' ? '5' : state.maxUses.text}
        onEdit={(text) => { props.edit('maxUses', text) }}
        onReset={() => { props.resetField('maxUses') }}
      />
    </PluginCard>
  )
}
