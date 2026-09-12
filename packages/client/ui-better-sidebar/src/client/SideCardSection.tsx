/**
 * "Side card" settings section: the user-facing preferences for the sidebar
 * panel, rendered natively in the DSH Settings shell (nav label "Side card").
 *
 * The section is DECLARATIVE — it renders the enable/disable inventory from
 * the sidebar service's registries instead of hardcoding rows:
 *  - 常规: new conversations open the panel by default (a toggle row), the
 *    default panel width as a percent of the window (number input row), and
 *    the open-path interception toggle — the DSH settings-row recipe
 *    (title/desc left + control right, hairline separators).
 *  - 侧边栏内容: one SMALL CARD per REGISTERED tab type (built-ins and
 *    external plugins alike), laid out in a responsive grid that wraps
 *    several cards per row — icon chip + title + type id, clicked to toggle
 *    the switch persisted in `prefs.tabsEnabled[id]`.
 *  - 文件预览: one SMALL CARD per REGISTERED file viewer — icon chip + title
 *    + the extensions it covers, clicked to toggle `prefs.viewersEnabled[id]`.
 *
 * Every group lives in a container card (the DSH PluginCard recipe: l2
 * hairline, 16px radius, layer-3 fill) with a heading and an inventory count
 * badge (the settings catalogHeading recipe); the section opens with a
 * one-line intro (the DSH section heading+intro recipe).
 *
 * A card's on/off state is its VISUAL STATE: enabled = highlighted (brand
 * border + tinted fill + a compact switch knob at the card's far right),
 * disabled = neutral and dimmed. Features that declare
 * `settings.toggles` carry a labeled settings strip at the card's bottom
 * edge that opens a native Modal (wider than the primitive default) with
 * the related settings as title/desc + custom-switch rows and a Done
 * footer; the popup body scrolls internally when a feature declares many
 * rows (e.g. Terminal's six). The toggles themselves are custom
 * switches: a real checkbox (native semantics and focus) driving a styled
 * track/thumb.
 *
 * Writes go through the official global preferences controller. Its snapshot
 * updates the section and every official sidebar consumer after a successful
 * write. A failed write leaves the retained snapshot in force and reports the
 * error inline.
 */
import { Fragment, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  IconChevronDownOutline14,
  IconCodeOutline16,
  IconDownloadOutline16,
  IconPlusOutline16,
  IconNewChatOutline16,
  IconSettingsOutline16,
  IconThinkOutline16,
  Input,
  Menu,
  Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import clsx from 'clsx'
// Type-only: pulls the settings shell's SlotMap merges ('settings.section').
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  SidebarRightPreferences,
  SidebarRightSettingDefinition,
  SidebarRightTabDefinition,
  SidebarRightViewerDefinition,
} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import {
  clampWidthPercent,
  TITLE_BAR_STRIP_MAX,
  TITLE_BAR_STRIP_MIN,
  WIDTH_PERCENT_MAX,
  WIDTH_PERCENT_MIN,
} from '../prefs-shared.ts'
import { AddPluginModal, type PluginKind } from './add-plugin-modal.tsx'
import { t } from './locales.ts'
import { parseDesktopEnv } from './desktop-env.ts'
import { getShellPreset, getShellPresets } from './shell-presets.ts'
import { SIDEBAR_SERVICE_VERSION } from './service.ts'
import {
  IconDiffOutline16, IconHtmlOutline16, IconImageOutline16, IconMarkdownOutline16,
  IconPdfOutline16, IconTerminalOutline16,
} from './icons.tsx'
import css from './SideCardSection.module.css'

/** Injected official descriptor and preference owners. */
export interface SideCardSectionInjected {
  tabs: import('@deepseek-ai/cordis').Context['sidebarRightTabs']
  preferences: import('@deepseek-ai/cordis').Context['sidebarRightPreferences']
}

/** Full section props: the runtime share plus the injected face. */
export type SideCardSectionProps = PropsRuntime<'settings.section'>
  & PropsRenderSlots<'sidebar.right.tab.settings' | 'sidebar.right.viewer.settings'>
  & SideCardSectionInjected

/** Map one wire failure to the inline message (the conflict gets friendly copy). */
function messageOf(error: unknown): string {
  if (error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'settings-conflict') {
    return `${t('settingsSaveFailed')} ${t('settingsConflict')}`
  }
  return `${t('settingsSaveFailed')} ${error instanceof Error ? error.message : String(error)}`
}

/** Resolve an i18n-friendly string-or-function value. */
function textOf(value: string | (() => string) | undefined): string {
  if (value === undefined) return ''
  return typeof value === 'function' ? value() : value
}

function iconOf(icon: ReactNode | ((size: number) => ReactNode) | undefined, size: number): ReactNode {
  if (icon === undefined) return null
  return typeof icon === 'function' ? icon(size) : icon
}

function descriptorIconOf(icon: string | undefined): ReactNode {
  switch (icon) {
    case 'sidechat': return <IconNewChatOutline16 size={16} />
    case 'terminal': return <IconTerminalOutline16 size={16} />
    case 'diff': return <IconDiffOutline16 size={16} />
    case 'tasks': return <IconThinkOutline16 size={16} />
    case 'image': return <IconImageOutline16 size={16} />
    case 'pdf': return <IconPdfOutline16 size={16} />
    case 'markdown': return <IconMarkdownOutline16 size={16} />
    case 'html': return <IconHtmlOutline16 size={16} />
    case 'code': return <IconCodeOutline16 size={16} />
    case 'download': return <IconDownloadOutline16 size={16} />
    default: return null
  }
}

/** Tab inventory order: hidden types (editor/diff) last, then + menu order. */
function tabOrder(a: SidebarRightTabDefinition, b: SidebarRightTabDefinition): number {
  if (a.hidden !== b.hidden) return a.hidden === true ? 1 : -1
  return (a.order ?? 100) - (b.order ?? 100)
}

/**
 * The scheme dropdown's current value: the plain scheme, or `preset:<id>`
 * while a preset is active. Falls back to `auto` when the stored preset id
 * is no longer registered (the strip resolves to 0 then anyway).
 */
function titleBarSchemeValue(prefs: SidebarRightPreferences): string {
  if (prefs.titleBarScheme !== 'preset') return prefs.titleBarScheme
  const preset = getShellPreset(prefs.titleBarPresetId)
  return preset !== undefined ? `preset:${preset.id}` : 'auto'
}

/** Viewer inventory order: priority desc (the catch-all `code` comes last). */
function viewerOrder(a: SidebarRightViewerDefinition, b: SidebarRightViewerDefinition): number {
  return (b.priority ?? 0) - (a.priority ?? 0)
}

/** Whether a feature declares any secondary settings (gear button shows). */
function hasSettings(feature: SidebarRightTabDefinition | SidebarRightViewerDefinition): boolean {
  const settings = feature.settings
  return settings !== undefined && (settings.fields.length > 0 || settings.custom === true)
}

/** A feature's display name (viewers fall back to their id). */
function featureNameOf(feature: SidebarRightTabDefinition | SidebarRightViewerDefinition): string {
  return ('kind' in feature ? feature.title('') : feature.title()) || feature.id
}

/**
 * The custom switch: a real checkbox (hidden, native semantics and focus)
 * driving a styled track/thumb. Used by the general toggle rows and the
 * secondary settings popup rows.
 */
function Switch(props: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  const { checked, onChange, label } = props
  return (
    <label className={css.switch}>
      <input
        type="checkbox"
        className={css.switchInput}
        checked={checked}
        aria-label={label}
        onChange={(event) => { onChange(event.currentTarget.checked) }}
      />
      <span className={css.switchTrack} aria-hidden="true">
        <span className={css.switchThumb} />
      </span>
    </label>
  )
}

/**
 * The body of a feature's secondary settings popup: one row (title/desc +
 * control) per declared setting. Switches render the custom switch; text and
 * number rows render a free-form / numeric input committed on blur/Enter
 * (clamped to the declared min/max). Extracted so the rows are testable
 * without opening the Modal (the Modal portal renders only while open).
 */
export function FeatureSettingsRows(props: {
  toggles: readonly SidebarRightSettingDefinition[]
  prefs: SidebarRightPreferences
  onToggle: (toggle: SidebarRightSettingDefinition, next: boolean) => void
  /** Commit one text/number row; returns the canonical value the row should
   *  display (clamped for numbers, the current pref when the input is
   *  invalid). Optional: rows with no handler keep their draft. */
  onCommit?: (toggle: SidebarRightSettingDefinition, raw: string) => string
  /** Commit one select row: the picked option's value (single) or the array
   *  of picked values (`multi: true`). Optional: rows with no handler are
   *  display-only. */
  onSelectValue?: (toggle: SidebarRightSettingDefinition, next: unknown) => void
  /** Explicit value source (v0.12.0+): when given, rows read their values
   *  from it instead of the `prefs` face — plugin-owned rows read their
   *  own blob, so a plugin key can never collide with (or silently read)
   *  a host pref of the same name. (Named `valueSource`, not `valueOf`:
   *  the latter collides with the inherited Object.prototype.valueOf.) */
  valueSource?: (key: string) => unknown
}) {
  const { toggles, prefs, onToggle, onCommit, onSelectValue, valueSource } = props
  const read = valueSource ?? ((key: string): unknown => (prefs as unknown as Record<string, unknown>)[key])
  return (
    <div className={css.popupRows}>
      {toggles.map((toggle) => {
        const title = textOf(toggle.title)
        if (toggle.control === 'select') {
          return (
            <SelectRow
              key={toggle.key}
              toggle={toggle}
              title={title}
              value={read(toggle.key)}
              onSelectValue={onSelectValue}
            />
          )
        }
        if ((toggle.control ?? 'switch') === 'switch') {
          return (
            <div key={toggle.key} className={css.popupRow}>
              <span className={css.rowText}>
                <span className={css.title}>{title}</span>
                {textOf(toggle.description) !== '' && <span className={css.desc}>{textOf(toggle.description)}</span>}
              </span>
              <Switch
                label={title}
                checked={read(toggle.key) === true}
                onChange={(next) => { onToggle(toggle, next) }}
              />
            </div>
          )
        }
        const value = String(read(toggle.key) ?? '')
        // Keyed by the committed value: a failed commit reverts prefs, the
        // key changes, and the row remounts with the stored value (typing
        // never changes the key, so mid-edit drafts survive re-renders).
        return (
          <TypedRow
            key={`${toggle.key}:${value}`}
            toggle={toggle}
            title={title}
            value={value}
            onCommit={onCommit}
          />
        )
      })}
    </div>
  )
}

/**
 * One text/number row: a controlled input whose draft is local state,
 * committed on blur/Enter through the parent's onCommit. The parent's
 * canonical return is adopted (clamped numbers, stored value for invalid
 * input); a `unit` suffix renders after the input (e.g. 'px').
 */
function TypedRow(props: {
  toggle: SidebarRightSettingDefinition
  title: string
  value: string
  onCommit?: (toggle: SidebarRightSettingDefinition, raw: string) => string
}) {
  const { toggle, title, value, onCommit } = props
  const [draft, setDraft] = useState(value)
  const commit = (): void => {
    const canonical = onCommit?.(toggle, draft) ?? draft
    setDraft(canonical)
  }
  const number = toggle.control === 'number'
  return (
    <div className={css.popupRow}>
      <span className={css.rowText}>
        <span className={css.title}>{title}</span>
        {textOf(toggle.description) !== '' && <span className={css.desc}>{textOf(toggle.description)}</span>}
      </span>
      <span className={css.control}>
        <Input
          type={number ? 'number' : 'text'}
          className={number ? css.typedInputNumber : css.typedInput}
          value={draft}
          min={toggle.min}
          max={toggle.max}
          step={1}
          placeholder={toggle.placeholder}
          aria-label={title}
          onChange={(event) => { setDraft(event.currentTarget.value) }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        {toggle.unit !== undefined && <span className={css.suffix}>{toggle.unit}</span>}
      </span>
    </div>
  )
}
/**
 * The multi-line custom-CSS input (scheme `custom`): a monospace textarea
 * whose draft is local state, committed on blur or Cmd/Ctrl+Enter through
 * the parent's handler. Keyed by the stored value so an external commit
 * remounts it with the canonical text (same pattern as TypedRow).
 */
function CssDraft(props: {
  value: string
  onCommit: (raw: string) => void
  label: string
  placeholder?: string
}) {
  const { value, onCommit, label, placeholder } = props
  const [draft, setDraft] = useState(value)
  return (
    <textarea
      className={css.cssTextArea}
      rows={6}
      value={draft}
      placeholder={placeholder}
      aria-label={label}
      spellCheck={false}
      onChange={(event) => { setDraft(event.currentTarget.value) }}
      onBlur={() => { onCommit(draft) }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) event.currentTarget.blur()
      }}
    />
  )
}

/**
 * The reusable dropdown — the primitives Menu, NOT a native <select>: a
 * closed anchor button (picked option text + chevron) opening one Menu item
 * per option (big-icon cards when any option carries an icon). Single-pick
 * commits the option's value and closes; `multi` toggles membership and
 * commits the picked values as an array (in options order), staying open.
 * Shared by the declarative select rows (SelectRow) and the title-bar
 * scheme dropdown on the General row.
 */
function SelectMenu(props: {
  label: string
  value: unknown
  options: readonly {
    value: string | number | boolean
    title: string | (() => string)
    desc?: string | (() => string)
    icon?: ReactNode | ((size: number) => ReactNode)
  }[]
  multi?: boolean
  onSelect: (next: unknown) => void
  placeholder?: string
}) {
  const { label, value, options, multi, onSelect, placeholder } = props
  const [open, setOpen] = useState(false)
  const hasIcons = options.some(option => option.icon !== undefined)
  const picked: readonly unknown[] = multi ? (Array.isArray(value) ? value : []) : [value]
  const selected = options.filter(option => picked.includes(option.value))

  /** Commit one picked option (toggle semantics under multi). */
  const pick = (index: number): void => {
    const option = options[index]
    if (option === undefined) return
    if (!multi) {
      onSelect(option.value)
      setOpen(false)
      return
    }
    const current = Array.isArray(value) ? [...value] : []
    const at = current.indexOf(option.value)
    if (at >= 0) current.splice(at, 1)
    else current.push(option.value)
    // Stable wire order: follow the declared options order, not pick order.
    onSelect(options.filter(o => current.includes(o.value)).map(o => o.value))
  }

  const anchor = (
    <button
      type="button"
      className={css.selectAnchor}
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => { setOpen(now => !now) }}
    >
      {!multi && hasIcons && selected[0] !== undefined && (
        <span className={css.selectAnchorIcon}>{iconOf(selected[0].icon, 16)}</span>
      )}
      <span className={css.selectAnchorText}>
        {selected.length === 0 ? (placeholder ?? '—') : selected.map(option => textOf(option.title)).join(', ')}
      </span>
      <IconChevronDownOutline14 size={12} />
    </button>
  )

  return (
    <Menu
      open={open}
      anchor={anchor}
      items={options.map((option, index) => ({
        id: String(index),
        label: hasIcons
          ? (
            <span className={css.selectOption}>
              <span className={css.selectOptionIcon}>{iconOf(option.icon, 24)}</span>
              <span className={css.selectOptionText}>
                <span className={css.title}>{textOf(option.title)}</span>
                {textOf(option.desc) !== '' && <span className={css.desc}>{textOf(option.desc)}</span>}
              </span>
            </span>
          )
          : textOf(option.title),
      }))}
      selectedId={!multi && selected[0] !== undefined ? String(options.indexOf(selected[0])) : undefined}
      selectedIds={multi ? selected.map(option => String(options.indexOf(option))) : undefined}
      onSelect={(id) => { pick(Number(id)) }}
      onClose={() => { setOpen(false) }}
      portal
    />
  )
}

/**
 * One select row: a dropdown over the toggle's declared `options` (the
 * shared SelectMenu). When any option carries an icon, the dropdown renders
 * big-icon option cards (icon + title + desc) and the closed anchor shows
 * the selected option's icon as well; without icons both are a single line
 * of text. Single-pick commits the option's value and closes; `multi`
 * toggles membership, commits the picked values as an array (in options
 * order), and stays open.
 */
function SelectRow(props: {
  toggle: SidebarRightSettingDefinition
  title: string
  value: unknown
  onSelectValue?: (toggle: SidebarRightSettingDefinition, next: unknown) => void
}) {
  const { toggle, title, value, onSelectValue } = props
  return (
    <div className={css.popupRow}>
      <span className={css.rowText}>
        <span className={css.title}>{title}</span>
        {textOf(toggle.description) !== '' && <span className={css.desc}>{textOf(toggle.description)}</span>}
      </span>
      <span className={css.control}>
        <SelectMenu
          label={title}
          value={value}
          options={(toggle.options ?? []).map(option => ({
            value: option.value,
            title: option.title,
            desc: option.description,
          }))}
          multi={toggle.multiple === true}
          onSelect={(next) => { onSelectValue?.(toggle, next) }}
        />
      </span>
    </div>
  )
}

/**
 * The secondary settings popup body of one feature (tab or viewer):
 * - the host-prefs `toggles` rows, then the plugin-owned `pluginToggles`
 *   rows (their values live in `pluginSettings[feature.id]`, projected onto
 *   the prefs face so the shared row renderer reads them);
 * - `settings.render` (custom panel) AFTER those rows when declared — the
 *   custom panel is an extension of the row list, not a replacement, so a
 *   feature can keep its declarative rows (e.g. the editor's
 *   open-behavior picker) and still ship a custom configuration area.
 */
export function SettingsBody(props: {
  feature: SidebarRightTabDefinition | SidebarRightViewerDefinition
  prefs: SidebarRightPreferences
  onToggle: (toggle: SidebarRightSettingDefinition, next: boolean) => void
  onCommit: (toggle: SidebarRightSettingDefinition, raw: string) => string
  onSelectValue: (toggle: SidebarRightSettingDefinition, next: unknown) => void
  onPluginToggle: (toggle: SidebarRightSettingDefinition, next: boolean) => void
  onPluginCommit: (toggle: SidebarRightSettingDefinition, raw: string) => string
  onPluginSelectValue: (toggle: SidebarRightSettingDefinition, next: unknown) => void
  onClose: () => void
  renderSlot: SideCardSectionProps['renderSlot']
}) {
  const {
    feature, prefs, onToggle, onCommit, onSelectValue, onPluginToggle, onPluginCommit,
    onPluginSelectValue, onClose, renderSlot,
  } = props
  const settings = feature.settings
  if (settings === undefined) return null
  const preferenceFields = settings.fields.filter(field => field.source === 'preference')
  const pluginFields = settings.fields.filter(field => field.source === 'plugin')
  const settingsId = settings.settingsId ?? feature.id
  const pluginBlob = prefs.pluginSettings[settingsId] ?? {}
  const seat = 'extensions' in feature ? 'sidebar.right.viewer.settings' : 'sidebar.right.tab.settings'
  return (
    <div>
      {(preferenceFields.length > 0 || pluginFields.length > 0) && (
        <div className={css.popupRows}>
          {preferenceFields.length > 0 && (
            <FeatureSettingsRows
              toggles={preferenceFields}
              prefs={prefs}
              onToggle={onToggle}
              onCommit={onCommit}
              onSelectValue={onSelectValue}
            />
          )}
          {pluginFields.length > 0 && (
            <FeatureSettingsRows
              toggles={pluginFields}
              prefs={prefs}
              onToggle={onPluginToggle}
              onCommit={onPluginCommit}
              onSelectValue={onPluginSelectValue}
              valueSource={(key) => pluginBlob[key]}
            />
          )}
        </div>
      )}
      {settings.custom === true && renderSlot(seat, {
        descriptorId: feature.id,
        settingsId,
        close: onClose,
      }, { entryKey: feature.id })}
    </div>
  )
}

/**
 * Render the Side card preferences section.
 * @param props - composed slot props and the official descriptor/preference owners.
 * @returns the section element tree.
 */
export function SideCardSection({ tabs: registry, preferences, renderSlot, close }: SideCardSectionProps) {
  const subscribeTabs = useCallback((listener: () => void) => registry.subscribe(listener), [registry])
  const readTabs = useCallback(() => registry.entries(), [registry])
  const readViewers = useCallback(() => registry.viewers(), [registry])
  const tabs = [...useSyncExternalStore(subscribeTabs, readTabs)].sort(tabOrder)
  const viewers = [...useSyncExternalStore(subscribeTabs, readViewers)].sort(viewerOrder)
  const subscribePreferences = useCallback(
    (listener: () => void) => preferences.subscribe(listener),
    [preferences],
  )
  const readPreferences = useCallback(() => preferences.getSnapshot(), [preferences])
  const prefs = useSyncExternalStore(subscribePreferences, readPreferences).preferences
  const [widthDraft, setWidthDraft] = useState<string>(String(prefs.defaultWidthPercent))
  const [error, setError] = useState<string | null>(null)
  // Which feature's secondary settings popup is open (null = closed).
  const [settingsFor, setSettingsFor] = useState<SidebarRightTabDefinition | SidebarRightViewerDefinition | null>(null)
  // Whether the position-compat strip popup (the gear on the 常规 row) is open.
  const [stripSettingsOpen, setStripSettingsOpen] = useState(false)
  // The parsed desktop environment (URL stamps — see desktop-env.ts). Used
  // ONLY to badge matching presets in the scheme dropdown ("已检测");
  // nothing is auto-applied.
  const detectedEnv = useMemo(() => parseDesktopEnv(), [])
  // Whether the "add plugin" modal (a dashed card at the end of the
  // 侧边栏内容 / 文件预览 grids) is open, and for which extension point
  // (null = closed).
  const [addPluginsOpen, setAddPluginsOpen] = useState<PluginKind | null>(null)
  useEffect(() => { setWidthDraft(String(prefs.defaultWidthPercent)) }, [prefs.defaultWidthPercent])

  const write = (operation: Promise<void>): void => {
    setError(null)
    void operation.catch((caught: unknown) => { setError(messageOf(caught)) })
  }

  const applyPref = (patch: Partial<SidebarRightPreferences>): void => { write(preferences.update(patch)) }

  const onToggle = (next: boolean): void => {
    applyPref({ openByDefault: next })
  }

  const onToggleTab = (id: string, next: boolean): void => {
    write(preferences.setTabEnabled(id, next))
  }

  const onToggleViewer = (id: string, next: boolean): void => {
    write(preferences.setViewerEnabled(id, next))
  }

  const onToggleSetting = (toggle: SidebarRightSettingDefinition, next: boolean): void => {
    applyPref({ [toggle.key]: next } as Partial<SidebarRightPreferences>)
  }

  const onSelectSetting = (toggle: SidebarRightSettingDefinition, next: unknown): void => {
    applyPref({ [toggle.key]: next } as Partial<SidebarRightPreferences>)
  }

  /**
   * Commit one declaratively-declared text/number row. Numbers are parsed
   * and clamped to the toggle's declared min/max (an unparsable input falls
   * back to the CURRENT stored value, mirroring the width row); text rows
   * persist as-is (empty is meaningful, e.g. the theme-default font).
   * Returns the canonical value the row should display.
   */
  const onCommitSetting = (toggle: SidebarRightSettingDefinition, raw: string): string => {
    if (toggle.control === 'number') {
      const parsed = Number(raw)
      const fallback = String((prefs as unknown as Record<string, unknown>)[toggle.key] ?? '')
      if (!Number.isFinite(parsed)) return fallback
      let clamped = Math.round(parsed)
      if (toggle.min !== undefined) clamped = Math.max(toggle.min, clamped)
      if (toggle.max !== undefined) clamped = Math.min(toggle.max, clamped)
      applyPref({ [toggle.key]: clamped })
      return String(clamped)
    }
    applyPref({ [toggle.key]: raw })
    return raw
  }

  /**
   * Pick the title-bar / shell compatibility scheme from the dropdown. The
   * option values are `auto` | `web` | `custom` | `preset:<id>`; selecting
   * a preset stores both the scheme and its id. Mirrors the legacy
   * `titleBarCompat` flag (true for preset/custom) so documents stay
   * readable by older plugin versions.
   */
  const onSchemeSelect = (value: unknown): void => {
    if (typeof value !== 'string') return
    if (value === 'auto' || value === 'web' || value === 'custom') {
      applyPref({ titleBarScheme: value, titleBarCompat: value === 'custom' })
      return
    }
    if (value.startsWith('preset:') && getShellPreset(value.slice('preset:'.length)) !== undefined) {
      applyPref({
        titleBarScheme: 'preset',
        titleBarPresetId: value.slice('preset:'.length),
        titleBarCompat: true,
      })
    }
  }

  /** Commit the free-form custom CSS (scheme `custom`). */
  const commitCustomCss = (raw: string): void => {
    applyPref({ customCss: raw })
  }

  const applyPluginSetting = (settingsId: string, key: string, value: unknown): void => {
    write(preferences.setPluginSetting(settingsId, key, value as JsonValue))
  }

  const onPluginToggle = (settingsId: string, toggle: SidebarRightSettingDefinition, next: boolean): void => {
    applyPluginSetting(settingsId, toggle.key, next)
  }

  const onPluginCommitSetting = (settingsId: string, toggle: SidebarRightSettingDefinition, raw: string): string => {
    if (toggle.control === 'number') {
      const parsed = Number(raw)
      const blob = prefs.pluginSettings[settingsId] ?? {}
      const fallback = String(blob[toggle.key] ?? '')
      if (!Number.isFinite(parsed)) return fallback
      let clamped = Math.round(parsed)
      if (toggle.min !== undefined) clamped = Math.max(toggle.min, clamped)
      if (toggle.max !== undefined) clamped = Math.min(toggle.max, clamped)
      applyPluginSetting(settingsId, toggle.key, clamped)
      return String(clamped)
    }
    applyPluginSetting(settingsId, toggle.key, raw)
    return raw
  }

  const commitWidth = (): void => {
    const parsed = Number(widthDraft)
    if (!Number.isFinite(parsed)) {
      setWidthDraft(String(prefs.defaultWidthPercent))
      return
    }
    const clamped = clampWidthPercent(parsed)
    setWidthDraft(String(clamped))
    setError(null)
    void preferences.update({ defaultWidthPercent: clamped }).catch((caught: unknown) => {
      setWidthDraft(String(prefs.defaultWidthPercent))
      setError(messageOf(caught))
    })
  }

  /**
   * One SMALL toggle card for the responsive inventory grid: the card's main
   * area is the switch (click to flips, visual state IS the state), the icon
   * sits in a rounded chip, the check badge pins to the far right, and a
   * feature that declares related settings gets a labeled SETTINGS STRIP
   * across the card's bottom edge (gear icon + text) opening its settings
   * popup — discoverable at rest, not a hover-only ghost corner button.
   */
  const renderCard = (props: {
    title: string
    desc: string
    icon?: ReactNode
    enabled: boolean
    onToggle: (next: boolean) => void
    /** A feature with declared related settings shows the settings strip. */
    onOpenSettings?: () => void
  }) => {
    const hasSettings = props.onOpenSettings !== undefined
    return (
      <div
        className={clsx(css.card, props.enabled && css.cardOn)}
      >
        <button
          type="button"
          className={css.cardMain}
          aria-pressed={props.enabled}
          title={props.desc}
          onClick={() => { props.onToggle(!props.enabled) }}
        >
          <span className={css.cardTop}>
            {props.icon !== null && props.icon !== undefined && (
              <span className={css.cardIconChip}>{props.icon}</span>
            )}
            <span className={css.cardTitle}>{props.title}</span>
            {props.enabled && (
              <span className={css.cardSwitch} aria-hidden="true">
                <span className={css.cardSwitchTrack}>
                  <span className={css.cardSwitchThumb} />
                </span>
              </span>
            )}
          </span>
          <span className={css.cardDesc}>{props.desc}</span>
        </button>
        {hasSettings && (
          <button
            type="button"
            className={css.cardSettings}
            aria-label={`${props.title} ${t('settingsPopup')}`}
            onClick={props.onOpenSettings}
          >
            <IconSettingsOutline16 size={12} />
            <span>{t('settingsPopup')}</span>
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={css.section}>
      <p className={css.intro}>{t('settingsIntro')}</p>

      {/* The managing plugin's own identity: name + retained Better version. */}
      <div className={css.versionBadge}>
        <span className={css.versionBadgeName} translate="no">DSH-better-sidebar</span>
        <span className={css.versionBadgeTag} translate="no">v{SIDEBAR_SERVICE_VERSION}</span>
      </div>

      {/* 常规: the DSH settings-row recipe — title/desc left, control right. */}
      <div className={css.group}>
        <div className={css.groupHeading}>{t('settingsGeneralTitle')}</div>
        <div className={css.row}>
          <span className={css.rowText}>
            <span className={css.title}>{t('settingsOpenTitle')}</span>
            <span className={css.desc}>{t('settingsOpenDesc')}</span>
          </span>
          <Switch
            label={t('settingsOpenTitle')}
            checked={prefs.openByDefault}
            onChange={onToggle}
          />
        </div>
        <div className={css.row}>
          <span className={css.rowText}>
            <span className={css.title}>{t('settingsWidthTitle')}</span>
            <span className={css.desc}>{t('settingsWidthDesc')}</span>
          </span>
          <span className={css.control}>
            <Input
              type="number"
              className={css.percentInput}
              value={widthDraft}
              min={WIDTH_PERCENT_MIN}
              max={WIDTH_PERCENT_MAX}
              step={1}
              aria-label={t('settingsWidthTitle')}
              onChange={(event) => { setWidthDraft(event.currentTarget.value) }}
              onBlur={commitWidth}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
            <span className={css.suffix}>{t('settingsWidthSuffix')}</span>
          </span>
        </div>
        <div className={css.row}>
          <span className={css.rowText}>
            <span className={css.title}>{t('settingsOpenPathTitle')}</span>
            <span className={css.desc}>{t('settingsOpenPathDesc')}</span>
          </span>
          <Switch
            label={t('settingsOpenPathTitle')}
            checked={prefs.interceptOpenPath}
            onChange={(next) => { applyPref({ interceptOpenPath: next }) }}
          />
        </div>
        <div className={css.row}>
          <span className={css.rowText}>
            <span className={css.title}>{t('settingsOpenToolsTitle')}</span>
            <span className={css.desc}>{t('settingsOpenToolsDesc')}</span>
          </span>
          <Switch
            label={t('settingsOpenToolsTitle')}
            checked={prefs.agentOpenTools}
            onChange={(next) => { applyPref({ agentOpenTools: next }) }}
          />
        </div>
        <div className={css.row}>
          <span className={css.rowText}>
            <span className={css.title}>{t('settingsTitleBarTitle')}</span>
            <span className={css.desc}>{t('settingsTitleBarDesc')}</span>
          </span>
          <span className={css.control}>
            {/*
              The scheme dropdown (the shared SelectMenu — NOT a native
              select): 自动检测 (default) / DSH官方Web / 各壳兼容方案 /
              自定义方案. Matching presets carry a 「已检测」 desc badge
              (suggestion only). The 自定义方案 row keeps its gear (the
              popup with the shift distance + custom CSS) — the other
              schemes need no further settings.
            */}
            <SelectMenu
              label={t('settingsTitleBarTitle')}
              value={titleBarSchemeValue(prefs)}
              options={[
                { value: 'auto', title: t('settingsSchemeAutoTitle'), desc: t('settingsSchemeAutoDesc') },
                { value: 'web', title: t('settingsSchemeWebTitle'), desc: t('settingsSchemeWebDesc') },
                ...getShellPresets().map(preset => ({
                  value: `preset:${preset.id}`,
                  title: preset.title,
                  // The preset desc is i18n-friendly (string or () => string)
                  // — resolve it like every other settings text here.
                  desc: preset.detect?.(detectedEnv) === true
                    ? `${textOf(preset.desc)}（${t('settingsSchemeDetectedSuffix')}）`
                    : textOf(preset.desc),
                })),
                { value: 'custom', title: t('settingsSchemeCustomTitle'), desc: t('settingsSchemeCustomDesc') },
              ]}
              onSelect={onSchemeSelect}
            />
            {prefs.titleBarScheme === 'custom' && (
              <button
                type="button"
                className={css.rowGear}
                aria-label={`${t('settingsTitleBarTitle')} ${t('settingsPopup')}`}
                title={t('settingsPopup')}
                onClick={() => { setStripSettingsOpen(true) }}
              >
                <IconSettingsOutline16 size={14} />
              </button>
            )}
          </span>
        </div>
      </div>

      {/* 侧边栏内容: one small card per registered tab type in a responsive
          grid; features declaring `settings.toggles` open their settings in
          the popup (gear corner button) instead of nested inline rows. */}
      <div className={css.group}>
        <div className={css.groupHeading}>
          <span>{t('settingsTabsTitle')}</span>
          <span className={css.count}>{tabs.length}</span>
        </div>
        <div className={css.grid}>
          {tabs.map(tab => (
            <Fragment key={tab.id}>
              {renderCard({
                title: featureNameOf(tab),
                desc: tab.id,
                icon: descriptorIconOf(tab.icon),
                enabled: prefs.tabsEnabled[tab.id] !== false,
                onToggle: (next) => { onToggleTab(tab.id, next) },
                // The settings gear only while the feature is enabled: its
                // related settings are dormant while the feature is off.
                onOpenSettings: prefs.tabsEnabled[tab.id] !== false && hasSettings(tab)
                  ? () => { setSettingsFor(tab) }
                  : undefined,
              })}
            </Fragment>
          ))}
          {/* The "add tab plugin" entry: same card size as the inventory,
              but a dashed border — it opens the TAB-registration plugin
              modal instead of toggling a feature. */}
          <button
            type="button"
            className={clsx(css.card, css.addCard)}
            onClick={() => { setAddPluginsOpen('tab') }}
          >
            <span className={css.cardTop}>
              <span className={css.cardIconChip}>
                <IconPlusOutline16 size={16} />
              </span>
              <span className={css.cardTitle}>{t('addPluginsTabCard')}</span>
            </span>
            <span className={css.cardDesc}>{t('addPluginsTabCardDesc')}</span>
          </button>
        </div>
      </div>

      {/* 文件预览: one small card per registered file viewer. */}
      <div className={css.group}>
        <div className={css.groupHeading}>
          <span>{t('settingsViewersTitle')}</span>
          <span className={css.count}>{viewers.length}</span>
        </div>
        <div className={css.grid}>
          {viewers.map(viewer => (
            <Fragment key={viewer.id}>
              {renderCard({
                title: textOf(viewer.title) || viewer.id,
                desc: viewer.extensions.length === 0 ? t('settingsViewerCatchAll') : viewer.extensions.join(' · '),
                icon: descriptorIconOf(viewer.icon),
                enabled: prefs.viewersEnabled[viewer.id] !== false,
                onToggle: (next) => { onToggleViewer(viewer.id, next) },
                onOpenSettings: prefs.viewersEnabled[viewer.id] !== false && hasSettings(viewer)
                  ? () => { setSettingsFor(viewer) }
                  : undefined,
              })}
            </Fragment>
          ))}
          {/* The "add preview plugin" entry: dashed card opening the
              FILE-PREVIEWER registration modal. */}
          <button
            type="button"
            className={clsx(css.card, css.addCard)}
            onClick={() => { setAddPluginsOpen('viewer') }}
          >
            <span className={css.cardTop}>
              <span className={css.cardIconChip}>
                <IconPlusOutline16 size={16} />
              </span>
              <span className={css.cardTitle}>{t('addPluginsViewerCard')}</span>
            </span>
            <span className={css.cardDesc}>{t('addPluginsViewerCardDesc')}</span>
          </button>
        </div>
      </div>

      {/* The secondary settings popup: a feature's declared related settings
          as title/desc + switch rows in a wider-than-default Modal with a
          Done footer (Modal chrome is the app's own). Mounted only while a
          feature is open — the Modal primitive runs hooks unconditionally,
          so a closed-but-mounted Modal would break SSR (and the
          renderToString spec) under the test dual-react split.
          Content: the host-prefs `toggles` rows, the plugin-owned
          `pluginToggles` rows (their values live in pluginSettings[id]),
          then the custom `settings.render` panel when declared. */}
      {settingsFor !== null && (
        <Modal
          open
          onClose={() => { setSettingsFor(null) }}
          title={featureNameOf(settingsFor)}
          description={t('settingsPopupDesc', { feature: featureNameOf(settingsFor) })}
          closeLabel={t('close')}
          className={css.popupDialog}
          footer={(
            <button type="button" className={css.done} onClick={() => { setSettingsFor(null) }}>
              {t('settingsDone')}
            </button>
          )}
        >
          <SettingsBody
            feature={settingsFor}
            prefs={prefs}
            onToggle={onToggleSetting}
            onCommit={onCommitSetting}
            onSelectValue={onSelectSetting}
            onPluginToggle={(toggle, next) => {
              onPluginToggle(settingsFor.settings?.settingsId ?? settingsFor.id, toggle, next)
            }}
            onPluginCommit={(toggle, raw) => onPluginCommitSetting(
              settingsFor.settings?.settingsId ?? settingsFor.id,
              toggle,
              raw,
            )}
            onPluginSelectValue={(toggle, next) => {
              applyPluginSetting(settingsFor.settings?.settingsId ?? settingsFor.id, toggle.key, next)
            }}
            onClose={close}
            renderSlot={renderSlot}
          />
        </Modal>
      )}

      {/* The custom-scheme popup (opened by the gear next to the scheme
          dropdown when 自定义方案 is active): the shift distance in px and
          the free-form custom CSS. The OTHER schemes (自动检测 / DSH官方Web /
          壳预设) need no further settings — the scheme itself is chosen on
          the 常规 row. Mounted only while open (the Modal SSR rule above). */}
      {stripSettingsOpen && (
        <Modal
          open
          onClose={() => { setStripSettingsOpen(false) }}
          title={t('settingsTitleBarTitle')}
          description={t('settingsPopupDesc', { feature: t('settingsTitleBarTitle') })}
          closeLabel={t('close')}
          className={css.popupDialog}
          footer={(
            <button type="button" className={css.done} onClick={() => { setStripSettingsOpen(false) }}>
              {t('settingsDone')}
            </button>
          )}
        >
          <div className={css.popupRows}>
            <FeatureSettingsRows
              toggles={[{
                key: 'titleBarStripPx',
                source: 'preference',
                control: 'number',
                title: () => t('settingsTitleBarStripTitle'),
                description: () => t('settingsTitleBarStripDesc'),
                min: TITLE_BAR_STRIP_MIN,
                max: TITLE_BAR_STRIP_MAX,
                unit: 'px',
              }]}
              prefs={prefs}
              onToggle={onToggleSetting}
              onCommit={onCommitSetting}
            />
            <CssDraft
              key={prefs.customCss}
              value={prefs.customCss}
              label={t('settingsCustomCssTitle')}
              placeholder={t('settingsCustomCssPlaceholder')}
              onCommit={commitCustomCss}
            />
          </div>
        </Modal>
      )}

      {/* The "add plugin" modal (opened by the dashed cards above): declares
          the extension point of the clicked kind, opens the GitHub topic,
          and lists the matching recommended plugin catalog with per-entry
          install buttons (the install flow opens a ~/.dsh terminal with
          the command pre-typed; failures render inline here, in settings
          only). Mounted only while open (Modal runs hooks unconditionally
          — same SSR rule as the settings popup above). */}
      {addPluginsOpen !== null && (
        <AddPluginModal
          onClose={() => { setAddPluginsOpen(null) }}
          kind={addPluginsOpen}
        />
      )}

      {error !== null && (
        <div className={css.error} role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
