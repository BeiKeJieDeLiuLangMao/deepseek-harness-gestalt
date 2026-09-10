/**
 * Workspace Settings → IM Simulation: pick a configured takeover target.
 * Unconfigured workspaces keep simulation tools unavailable.
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ImGuiFace } from './faces.ts'
import { simulationConfigured, simulationTargets } from './model.ts'
import css from './WorkspaceCards.module.css'

/** Props bound for the IM Simulation workspace card. */
export type SimulationSectionProps =
  PropsRuntime<'workspace.settings.section'>
  & PropsLocale<'settings.im'>
  & InjectFace<ImGuiFace>

/**
 * Render the IM Simulation card for one workspace.
 * @param props - owner workspace id, locale, and GUI callbacks.
 */
export function SimulationSection(props: SimulationSectionProps) {
  const snapshot = props.useGui(state => state)
  const targets = simulationTargets(snapshot)
  const selected = snapshot.simulationByWorkspace[props.workspaceId] ?? ''
  const configured = simulationConfigured(snapshot, props.workspaceId)
  return (
    <section className={css.card} data-im-simulation>
      <div className={css.title}>{props.t('simulationTitle')}</div>
      <p className={css.intro}>{props.t('simulationIntro')}</p>
      {targets.length === 0
        ? (
          <div>
            <div className={css.name}>{props.t('simulationUnconfigured')}</div>
            <p className={css.hint}>{props.t('simulationUnconfiguredHint')}</p>
          </div>
        )
        : (
          <label>
            {props.t('simulationSelect')}
            <select
              aria-label={props.t('simulationSelect')}
              value={selected}
              onChange={(event) => {
                const value = event.target.value
                props.setSimulationTarget(props.workspaceId, value === '' ? undefined : value)
              }}
            >
              <option value="">{props.t('simulationNone')}</option>
              {targets.map(target => (
                <option key={target.key} value={target.key}>{target.label}</option>
              ))}
            </select>
          </label>
        )}
      <Tag tone={configured ? 'success' : 'neutral'}>
        {configured ? props.t('toolsAvailable') : props.t('toolsUnavailable')}
      </Tag>
    </section>
  )
}
