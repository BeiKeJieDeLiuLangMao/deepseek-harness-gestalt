/** Trajectory-owned slot contracts declared by the Trajectory view entry. */
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** Toolbar utilities derive their state from the standard session kit and their own inject face. */
export interface TrajectoryToolbarUtilityOwnerProps {}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Right-aligned Trajectory toolbar utilities, rendered after the live
     * ledger search field. Entries render by ascending `order`. The owner
     * passes nothing: everything a control needs comes from the framework
     * session kit and the registrant's own inject face.
     */
    'conversation.trajectory.toolbar.utilities': {
      kind: 'list'
      scope: 'session'
      owner: TrajectoryToolbarUtilityOwnerProps
    }
  }
}

/** Full props of a Trajectory toolbar utility entry. */
export type TrajectoryToolbarUtilityProps =
  PropsRuntime<'conversation.trajectory.toolbar.utilities'>

/** Render share the Trajectory view passes into its toolbar. */
export type TrajectoryViewRenderSlots =
  PropsRenderSlots<'conversation.trajectory.toolbar.utilities'>
