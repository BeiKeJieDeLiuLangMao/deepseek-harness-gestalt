/** Workspace and global pin actions for official Terminal occurrences. */
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { OfficialTerminalContext } from './terminal-runtime.ts'
import { officialTerminalPayloadOf } from './payload.ts'
import { t } from '../locales.ts'
import css from './TerminalPinMenuItem.module.css'

/** Services injected into the Terminal menu extension. */
export interface OfficialTerminalPinInjected {
  readonly ctx: OfficialTerminalContext
}

/** Official menu props for Terminal pin actions. */
export type OfficialTerminalPinMenuItemProps =
  PropsRuntime<'sidebar.right.tab.menu.item'> & OfficialTerminalPinInjected

/**
 * Render home-Session pin actions for one Terminal occurrence.
 * @param props - menu owner share and Session projection.
 * @returns pin actions for Terminal data, or nothing for other kinds.
 */
export function OfficialTerminalPinMenuItem({
  ctx, sessionId, payload: rawPayload, pin, actions, dismiss,
}: OfficialTerminalPinMenuItemProps): ReactNode {
  const payload = officialTerminalPayloadOf(rawPayload)
  if (payload === undefined) return null
  const updatePin = (scope: 'workspace' | 'global'): void => {
    const homeCwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
    actions.update({
      pin: {
        scope,
        homeSessionId: sessionId,
        ...(scope === 'workspace' && homeCwd !== undefined ? { homeCwd } : {}),
      },
    })
    dismiss()
  }
  if (pin !== undefined) {
    return (
      <button
        type="button"
        role="menuitem"
        className={css.item}
        data-official-terminal-pin="remove"
        onClick={() => {
          actions.update({ pin: undefined })
          dismiss()
        }}
      >
        {t('unpinTerminal')}
      </button>
    )
  }
  return (
    <>
      <button
        type="button"
        role="menuitem"
        className={css.item}
        data-official-terminal-pin="workspace"
        onClick={() => { updatePin('workspace') }}
      >
        {t('pinToWorkspace')}
      </button>
      <button
        type="button"
        role="menuitem"
        className={css.item}
        data-official-terminal-pin="global"
        onClick={() => { updatePin('global') }}
      >
        {t('pinToGlobal')}
      </button>
    </>
  )
}
