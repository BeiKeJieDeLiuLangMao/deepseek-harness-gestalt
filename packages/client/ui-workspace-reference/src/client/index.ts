/**
 * Workspace Reference browser half: registers the `@` `workspace` source,
 * the composer dock, and the settings section.
 */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveWorkspacePath } from '@deepseek-ai/dsh-client-runtime/client'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { InputTriggerServiceContract } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  DEFAULT_WORKSPACE_REFERENCE_SETTINGS,
  WORKSPACE_REFERENCE_SETTINGS_NAMESPACE,
  type WorkspaceReferenceSettings,
} from '../settings.ts'
import { WorkspaceReferenceDock } from './Dock.tsx'
import { WORKSPACE_REFERENCE_INVOCATIONS } from './invocations.ts'
import { en, zh } from './locales.ts'
import { createWorkspaceSource } from './source.ts'
import { WorkspaceReferenceSettingsSection } from './SettingsSection.tsx'
import { createWorkspaceReferenceStore } from './settings-store.ts'
import type { WorkspacePathEntry } from './rank.ts'

export const inject = [
  'inputTriggers', 'remote', 'typert', 'slots', 'locale', 'settingsScope', 'sessions', 'workspaces',
]

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    workspaceReference: {
      search(agentId: string, signal?: AbortSignal): Promise<RemoteResult<readonly WorkspacePathEntry[]>>
    }
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Workspace Reference dock and settings copy. */
    'workspace-reference': import('./locales.ts').WorkspaceReferenceKey
  }
}

const NS = 'workspace-reference'

/**
 * Register the workspace `@` source, dock, and settings section.
 * @param ctx - client root context.
 */
export async function apply(ctx: ClientContext): Promise<void> {
  const disposeMount = await ctx.remote.$mount({
    package: '@deepseek-ai/dsh-workspace-reference',
    descriptors: WORKSPACE_REFERENCE_INVOCATIONS,
  })
  const workspaceReference = ctx.get('remote.workspaceReference') as {
    search(agentId: string, signal?: AbortSignal): Promise<RemoteResult<readonly WorkspacePathEntry[]>>
  }
  const scope = ctx.settingsScope.bind<WorkspaceReferenceSettings>({
    namespace: WORKSPACE_REFERENCE_SETTINGS_NAMESPACE,
  })
  const store = createWorkspaceReferenceStore()
  let bound: BoundActions<typeof store> | undefined
  let latest: WorkspaceReferenceSettings = { ...DEFAULT_WORKSPACE_REFERENCE_SETTINGS }
  const sync = (): void => {
    latest = {
      ...DEFAULT_WORKSPACE_REFERENCE_SETTINGS,
      ...scope.getSnapshot().value,
    }
    bound?.sync(latest)
  }
  ctx.effect(() => scope.subscribe(sync), 'ui-workspace-reference: settings sync')
  const settings = (): WorkspaceReferenceSettings => latest
  const source = createWorkspaceSource(async (sessionId: SessionId, signal) => {
    const result = await workspaceReference.search(sessionId, signal)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }, settings)
  const inputTriggers = ctx.get('inputTriggers') as InputTriggerServiceContract
  ctx.effect(() => {
    const unregister = inputTriggers.registerSource(source)
    return () => {
      unregister()
      void disposeMount()
    }
  }, 'ui-workspace-reference: @ source')

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workspace-reference: dictionaries')

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'workspace-reference',
    order: 20,
    locale: NS,
    store,
    inject: (sessionId: SessionId, actions: BoundActions<typeof store>) => {
      bound = actions
      sync()
      return {
        openPath: (path: string) => {
          const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
          void ctx.workspaces.openPath(resolveWorkspacePath(cwd, path)).catch(() => {
            // Host/OS open failures stay silent; the native app surfaces them.
          })
        },
      }
    },
  }, WorkspaceReferenceDock))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'workspace-reference',
    order: 45,
    label: () => ctx.locale.bind(NS)('nav'),
    locale: NS,
    store,
    inject: (actions: BoundActions<typeof store>) => {
      bound = actions
      sync()
      return {
        setField: (field: keyof WorkspaceReferenceSettings, value: boolean | string) => {
          void scope.set(field, value)
        },
      }
    },
  }, WorkspaceReferenceSettingsSection))
}
