/**
 * Fields for one search-provider tab: key, endpoint, and per-request budget.
 * The outer Web Search card owns chrome, tabs, and Save.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { SecretField, ValueField } from './fields.tsx'
import type { CardActions } from './card-form.ts'
import type { PluginsSettingsLocaleKey } from './locales.ts'
import type { WebSearchCardFace, WebSearchCardState } from './web-search-card-controller.ts'
import type {} from './slot-contract.ts'

/** Props the renderer binds for one provider tab. */
export type WebSearchProviderPanelProps =
  PropsRuntime<'settings.plugin.web-search.provider'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<WebSearchCardFace>

/** Shared key / endpoint / budget fields for the card and each provider tab. */
export interface WebSearchFieldsProps {
  /** Locale copy. */
  t: WebSearchProviderPanelProps['t']
  /** Prefix for control ids so two cards on one page do not collide. */
  idPrefix: string
  /** Locale key of the endpoint hint. */
  baseUrlHintKey: PluginsSettingsLocaleKey
  /** Selected provider snapshot. */
  state: WebSearchCardState
  /** Stage draft text for one field. */
  edit: CardActions['edit']
  /** Stage a clear so saving re-inherits the composition layer. */
  resetField: CardActions['resetField']
}

/**
 * Render the selected provider's key, endpoint, and budget fields.
 * @param props - locale copy, the provider snapshot, and its form actions.
 * @returns the fields.
 */
export function WebSearchFields(props: WebSearchFieldsProps) {
  const { t, state } = props
  const disabled = !state.writable
  return (
    <>
      <SecretField
        id={`${props.idPrefix}-key`}
        label={t('webSearchApiKey')}
        hint={t('webSearchApiKeyHint')}
        disabled={!state.apiKeyWritable}
        text={state.apiKey.text}
        configured={state.apiKeyConfigured}
        stateLabel={state.apiKeyConfigured ? t('webSearchApiKeySet') : t('webSearchApiKeyUnset')}
        onEdit={(text) => { props.edit('apiKey', text) }}
      />
      <ValueField
        id={`${props.idPrefix}-endpoint`}
        label={t('webSearchBaseUrl')}
        hint={t(props.baseUrlHintKey)}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidNumber')}
        disabled={disabled}
        {...state.baseURL}
        onEdit={(text) => { props.edit('baseURL', text) }}
        onReset={() => { props.resetField('baseURL') }}
      />
      <ValueField
        id={`${props.idPrefix}-max-uses`}
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
    </>
  )
}

/**
 * Render the selected provider's fields.
 * @param props - locale copy, the provider snapshot, and its form actions.
 * @returns the fields.
 */
export function WebSearchProviderPanel(props: WebSearchProviderPanelProps) {
  const state = props.useWebSearchCard(snapshot => snapshot)
  return (
    <WebSearchFields
      t={props.t}
      idPrefix={props.idPrefix}
      baseUrlHintKey={props.baseUrlHintKey}
      state={state}
      edit={props.edit}
      resetField={props.resetField}
    />
  )
}
