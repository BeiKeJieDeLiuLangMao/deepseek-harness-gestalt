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

/** One entry box: the contributing type's glyph, heading, and line. */
function EntryBox({ entry, onPick }: { entry: SidebarRightGuideBox; onPick: (entry: SidebarRightGuideBox) => void }): ReactNode {
  const Icon = entry.icon
  return (
    <button
      type="button"
      className={css.entry}
      data-sidebar-right-guide-entry={entry.kind}
      onClick={() => { onPick(entry) }}
    >
      {Icon !== undefined && <span className={css.entryIcon}><Icon size={16} /></span>}
      <span className={css.entryText}>
        <span className={css.entryTitle}>{entry.title()}</span>
        <span className={css.entryDescription}>{entry.description()}</span>
      </span>
    </button>
  )
}

/** The shipped guide: what the column is for, and the doors out of it. */
function ShippedGuide({ entries, onPick, t }: {
  entries: readonly SidebarRightGuideBox[]
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

/** Filter guide entries through each descriptor's Session-aware availability hint. */
export function availableGuideEntries(
  entries: readonly SidebarRightGuideBox[],
  context: SidebarRightDescriptorContext,
): readonly SidebarRightGuideBox[] {
  return entries.filter((entry) => {
    if (entry.available === undefined) return true
    try {
      return entry.available(context)
    } catch (error: unknown) {
      console.error(`sidebarRight: available failed for guide kind "${entry.kind}"`, error)
      return false
    }
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
  const available = availableGuideEntries(entries, {
    sessionId: tab.sessionId,
    preferences,
    tabs: descriptorTabsOf(projection, tab.sessionId),
  })
  const options = {
    hookContext: useTabInfo,
    fallback: (
      <ShippedGuide entries={available} onPick={(entry) => { tab.actions.openTab(entry.kind, { replaceTab: true }) }} t={t} />
    ),
  } satisfies ChainRenderOpts & { hookContext: HookContextOf<'sidebar.right.tab.guide'> }
  return renderSlotChain('sidebar.right.tab.guide', {}, options)
}
