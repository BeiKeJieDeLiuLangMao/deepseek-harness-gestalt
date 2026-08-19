/**
 * Workspace Reference plugin, node half: registers the durable settings
 * section. The browser half ships as `./client`.
 */
import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  WORKSPACE_REFERENCE_SETTINGS_NAMESPACE,
  WorkspaceReferenceSettingsSchema,
} from './settings.ts'

/**
 * Register the durable Workspace Reference section when settings is composed.
 * @param ctx - Host context that may acquire settings.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(WORKSPACE_REFERENCE_SETTINGS_NAMESPACE),
      WorkspaceReferenceSettingsSchema,
    )
  })
}
