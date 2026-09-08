/**
 * Phone plugin, node half. Registers the durable `ui-phone` settings
 * namespace (the join key of the Plugins-tab card) when a settings
 * provider is composed. The browser half ships via exports["./client"].
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { PHONE_SETTINGS_NAMESPACE, PhoneSettingsSchema } from './phone-settings.ts'

export {
  DEFAULT_PHONE_SETTINGS, PHONE_SETTINGS_NAMESPACE, PhoneSettingsSchema,
} from './phone-settings.ts'
export type { PhoneSettings } from './phone-settings.ts'

/**
 * Register the durable phone section when settings is composed.
 * @param ctx - Host context that may acquire settings.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    const scope = settingsCtx.settings.register(PHONE_SETTINGS_NAMESPACE, PhoneSettingsSchema)
    settingsCtx.inject(['phoneEnvironment'], (environmentCtx) => {
      const environment = environmentCtx.get('phoneEnvironment') as {
        setEnabled(enabled: boolean): Promise<void>
      }
      void environment.setEnabled(scope.get().enabled)
      environmentCtx.effect(() => scope.watch(async (next) => {
        await environment.setEnabled(next.enabled)
      }), 'ui-phone environment enable bridge')
    })
  })
}
