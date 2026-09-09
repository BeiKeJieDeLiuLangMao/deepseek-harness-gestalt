/**
 * The guide tab's body: a chain host, and the guide it falls back to.
 *
 * The chain is the replacement seam. A product with its own idea of what an
 * empty sidebar should say registers into `sidebar.right.tab.guide`, and its entry
 * takes the whole body; with no entry, or with every entry declining, the guide
 * below renders. The shipped guide is the owner's fallback rather than a chain
 * entry of its own, so there is always exactly one body and the shipped one
 * cannot be outvoted by accident.
 *
 * The shipped guide is a centred title, one line under it, and the entry boxes
 * every registered type contributed. Picking a box opens that type as a page in
 * this tab's place, so the guide is a doorway rather than a page that stays open.
 */
import type { ReactNode } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { sidebarTabIcon } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChainRenderOpts, HookContextOf, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarRightProjection } from '../../service.ts'
import type {
  SidebarRightDescriptorContext, SidebarRightDescriptorTab, SidebarRightGuideBox,
} from '../../tab-registry.ts'
import type { SidebarRightPreferencesSnapshot } from '../../preferences.ts'
import css from './GuideBody.module.css'

/** What the guide body needs from its host beyond the framework shares. */
export interface GuideInjected {
  /** The registry's guide entries in `order`; observable, so a type registering later appears. */
  readonly hooks: {
    readonly guideEntries: ObservableSnapshot<readonly SidebarRightGuideBox[]>
    readonly guideWorkbench: ObservableSnapshot<SidebarRightProjection>
    readonly guidePreferences: ObservableSnapshot<SidebarRightPreferencesSnapshot>
  }
}

/** The guide body's composed props: the tab it draws, its chain child, its copy, and the entries. */
export type GuideBodyProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsRenderSlots<'sidebar.right.tab.guide'>
  & PropsLocale<'sidebarRight'>
  & InjectFace<GuideInjected>

interface PresentedGuideBox extends SidebarRightGuideBox {
  readonly disabled: boolean
  readonly disabledReason?: string
}

/** One entry box: the contributing type's glyph, heading, and line. */
function EntryBox({ entry, onPick }: { entry: PresentedGuideBox; onPick: (entry: SidebarRightGuideBox) => void }): ReactNode {
  const icon = sidebarTabIcon(entry.icon)
  return (
    <button
      type="button"
      className={css.entry}
      data-sidebar-right-guide-entry={entry.kind}
      disabled={entry.disabled}
      title={entry.disabledReason}
      onClick={() => { onPick(entry) }}
    >
      {icon !== undefined && <span className={css.entryIcon}>{icon}</span>}
      <span className={css.entryText}>
        <span className={css.entryTitle}>{entry.title()}</span>
        <span className={css.entryDescription}>{entry.description()}</span>
        {entry.disabledReason !== undefined && (
          <span className={css.entryUnavailable}>{entry.disabledReason}</span>
        )}
      </span>
    </button>
  )
}

/** The shipped guide: what the column is for, and the doors out of it. */
function ShippedGuide({ entries, onPick, t }: {
  entries: readonly PresentedGuideBox[]
  onPick: (entry: SidebarRightGuideBox) => void
  t: GuideBodyProps['t']
}): ReactNode {
  return (
    <div className={css.guide} data-sidebar-right-guide>
      <p className={css.guideTitle}>{t('guide.lead')}</p>
      <p className={css.guideBody}>{t('guide.body')}</p>
      {entries.length > 0 && (
        <div className={css.entries}>
          {/* Keyed by position in the ordered list: one type may contribute several boxes, and `order` is not unique. */}
          {entries.map((entry, index) => <EntryBox key={`${entry.kind}:${index}`} entry={entry} onPick={onPick} />)}
        </div>
      )}
    </div>
  )
}

function descriptorTabsOf(projection: SidebarRightProjection, sessionId: string): SidebarRightDescriptorTab[] {
  const session = projection.sessions.find(candidate => candidate.sessionId === sessionId)
  return session?.tabs.map(tab => ({
    id: tab.record.id,
    kind: tab.record.kind,
    contentId: tab.record.contentId,
    title: tab.record.title,
    surface: tab.surface,
    floating: tab.floating,
    payload: tab.state.payload,
    pin: tab.state.pin,
  })) ?? []
}

/** Resolve each entry's Session-aware availability without removing its card. */
export function presentGuideEntries(
  entries: readonly SidebarRightGuideBox[],
  context: SidebarRightDescriptorContext,
  fallbackReason: string,
): readonly PresentedGuideBox[] {
  return entries.map((entry) => {
    let disabled = false
    try {
      disabled = entry.available?.(context) === false
    } catch (error: unknown) {
      console.error(`sidebarRight: available failed for guide kind "${entry.kind}"`, error)
      disabled = true
    }
    if (!disabled) return { ...entry, disabled: false }
    let disabledReason = fallbackReason
    try {
      disabledReason = entry.unavailableReason?.(context) ?? fallbackReason
    } catch (error: unknown) {
      console.error(`sidebarRight: unavailableReason failed for guide kind "${entry.kind}"`, error)
    }
    return { ...entry, disabled: true, disabledReason }
  })
}

/** The guide tab's body, replaceable through its chain child. */
export function GuideBody({
  useTabInfo, useGuideEntries, useGuideWorkbench, useGuidePreferences, renderSlotChain, t,
}: GuideBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const entries = useGuideEntries(entries => entries)
  const projection = useGuideWorkbench(value => value)
  const preferences = useGuidePreferences(value => value.preferences)
  const presented = presentGuideEntries(entries, {
    sessionId: tab.sessionId,
    preferences,
    tabs: descriptorTabsOf(projection, tab.sessionId),
  }, t('guide.unavailable'))
  const options = {
    hookContext: useTabInfo,
    fallback: (
      <ShippedGuide entries={presented} onPick={(entry) => { tab.actions.openTab(entry.kind, { replaceTab: true }) }} t={t} />
    ),
  } satisfies ChainRenderOpts & { hookContext: HookContextOf<'sidebar.right.tab.guide'> }
  return renderSlotChain('sidebar.right.tab.guide', {}, options)
}
