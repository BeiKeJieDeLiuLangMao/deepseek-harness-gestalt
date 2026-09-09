// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, waitFor } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type {
  ISession, SessionLiveEventEntry,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import {
  SlotTestRuntime, usePinnedBrowserLanguages, stubSettingsScope,
} from '@deepseek-ai/dsh-client-test-runtime'
import {
  apply as applyConversation, inject as injectConversation, type ConversationStore,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  apply as applyTrajectory, inject as injectTrajectory,
} from '@deepseek-ai/dsh-client-ui-trajectory/client'
import { apply, inject } from '../src/client/index.ts'
import { zh } from '../src/client/locales.ts'

usePinnedBrowserLanguages('zh-CN')

const SID = 'session-export-toolbar' as SessionId
const TRAJECTORY_EVENT = {
  type: 'event',
  event: {
    type: 'user/message',
    seq: 1,
    time: 1,
    data: {
      id: 'toolbar-assembly-message',
      role: 'user',
      content: [{ type: 'text', text: 'Export this session' }],
      source: { kind: 'user' },
    },
  },
} as unknown as SessionLiveEventEntry

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

type AppRootProps = PropsRenderSlots<'main'>
function AppRoot({ renderSlot }: AppRootProps) {
  return <>{renderSlot('main', {}, { entryKey: 'conversation' })}</>
}

const LAYOUT_CHILDREN = {
  main: { kind: 'keyed', scope: 'root' },
} as const
type ConversationInstance = ReturnType<ConversationStore['create']>

async function bench() {
  const runtime = await SlotTestRuntime.create()
  runtime.ctx.provide('uiWorkspace', { connectWorkspace: vi.fn(async () => SID) } as never)
  runtime.ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  runtime.ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  runtime.ctx.provide('remote', { $on: () => () => {} } as never)
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  await runtime.sessions.add({
    id: SID,
    summary: { title: 'S', displayTitle: 'S', cwd: '/proj' },
    events: [TRAJECTORY_EVENT],
    session: {
      loadOlder: vi.fn<ISession['loadOlder']>(),
      prompt: vi.fn<ISession['prompt']>(async () => ({ ok: true, value: { accepted: true } })),
    },
  })
  await runtime.root.declare(LAYOUT_CHILDREN, AppRoot)
  await runtime.mount({ inject: [...injectConversation], apply: applyConversation })
  const trajectory = await runtime.mount({ inject: [...injectTrajectory], apply: applyTrajectory })
  const exportPlugin = await runtime.mount({ inject: [...inject], apply })
  const view = runtime.renderRoot()
  const conversation = runtime.storeOf('conversation.session', SID) as ConversationInstance
  conversation.actions.setView('trajectory')
  await runtime.flush()
  return { runtime, view, trajectory, exportPlugin }
}

describe('session-log-download Trajectory toolbar assembly', () => {
  it('opens the shared modal from the Trajectory toolbar without a Header duplicate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    const b = await bench()
    const toolbar = await b.view.findByRole('toolbar', { name: '轨迹工具栏' })
    const button = await b.view.findByRole('button', { name: zh['toolbar.download'] })
    expect(toolbar.contains(button)).toBe(true)
    expect(b.view.getAllByRole('button', { name: zh['toolbar.download'] })).toHaveLength(1)
    fireEvent.click(button)
    await waitFor(() => {
      expect(b.view.getByRole('dialog', { name: zh['dialog.errorTitle'] })).toBeTruthy()
    })
    await b.runtime.dispose()
  })

  it('removes the toolbar button when Trajectory unloads and keeps no Header duplicate', async () => {
    const b = await bench()
    expect(await b.view.findByRole('button', { name: zh['toolbar.download'] })).toBeTruthy()
    await b.trajectory.dispose()
    await waitFor(() => {
      expect(b.view.queryByRole('button', { name: zh['toolbar.download'] })).toBeNull()
    })
    await b.runtime.dispose()
  })
})
