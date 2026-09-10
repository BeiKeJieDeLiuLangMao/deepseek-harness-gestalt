// @vitest-environment jsdom
/**
 * Focused IM GUI surfaces: route editing, simulation target selection, sender
 * badges, delivery states, manual send, both-session navigation, and the
 * prototype experience route.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { AccountsSection } from '../src/client/AccountsSection.tsx'
import { TakeoverSection } from '../src/client/TakeoverSection.tsx'
import { SimulationSection } from '../src/client/SimulationSection.tsx'
import { ConversationTab } from '../src/client/ConversationTab.tsx'
import { createImGuiFace } from '../src/client/controller.ts'
import {
  createImGuiStore, deliveryIsSuccess, disabledKeepsBinding, emptyGuiSnapshot, prototypeGuiSnapshot,
  routeDraftError, wangwangCredError,
} from '../src/client/model.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh)

function bind(store = createImGuiStore(prototypeGuiSnapshot())) {
  const face = createImGuiFace(store)
  return {
    store,
    face,
    props: {
      t,
      close: () => {},
      useGui: bindSnapshotSelector(store),
      connect: face.connect,
      setPaused: face.setPaused,
      disconnect: face.disconnect,
      saveRoute: face.saveRoute,
      setRouteEnabled: face.setRouteEnabled,
      setSimulationTarget: face.setSimulationTarget,
      manualSend: face.manualSend,
      setPanel: face.setPanel,
      setRole: face.setRole,
    } as never,
  }
}

describe('IM GUI surfaces', () => {
  it('rejects incomplete Wangwang credentials and group triggers', () => {
    expect(wangwangCredError({ endpoint: '', accessKey: 'ak-1', secretKey: 'secret' })).toBe('endpointRequired')
    expect(wangwangCredError({
      endpoint: 'https://openapi.example.internal', accessKey: 'ak-demo-0001', secretKey: 'demo-secret',
    })).toBeUndefined()
    expect(routeDraftError({
      accountId: 'a', conversationKind: 'group', scope: 'all', targetsText: '',
      mention: false, everyNEnabled: false, everyN: '10', intervalEnabled: false, intervalMin: '5',
    })).toBe('triggerRequired')
    expect(routeDraftError({
      accountId: 'a', conversationKind: 'group', scope: 'specific', targetsText: '',
      mention: true, everyNEnabled: false, everyN: '10', intervalEnabled: false, intervalMin: '5',
    })).toBe('targetsRequired')
  })

  it('edits a specific group route and keeps the binding when disabled', () => {
    const { props, store } = bind()
    render(<TakeoverSection workspaceId="ws-tested" {...props} />)
    fireEvent.click(screen.getAllByRole('button', { name: zh.editRoute })[0]!)
    fireEvent.click(screen.getByLabelText(zh.scopeSpecific))
    const targets = screen.getByLabelText(zh.targetsPlaceholder)
    fireEvent.change(targets, { target: { value: '度假开发联调群, 支付值班群' } })
    fireEvent.click(screen.getByRole('button', { name: zh.saveRoute }))
    const route = store.getSnapshot().routes.find(row => row.id === 'route-group')
    expect(route?.scope).toBe('specific')
    expect(route?.targets).toEqual(['度假开发联调群', '支付值班群'])
    cleanup()
    render(<TakeoverSection workspaceId="ws-tested" {...props} />)
    fireEvent.click(screen.getAllByRole('switch', { name: zh.enabled })[0]!)
    const disabled = store.getSnapshot().routes.find(row => row.id === 'route-group')
    expect(disabled?.enabled).toBe(false)
    expect(disabledKeepsBinding(disabled!)).toBe(true)
    expect(screen.getByText(zh.disabledKeep)).toBeTruthy()
  })

  it('keeps simulation tools unavailable until a configured target is selected', () => {
    const { props, store } = bind(createImGuiStore({
      ...prototypeGuiSnapshot(),
      simulationByWorkspace: {},
    }))
    render(<SimulationSection workspaceId="ws-simuser" {...props} />)
    expect(screen.getByText(zh.toolsUnavailable)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(zh.simulationSelect), { target: { value: 'all:route-dm' } })
    expect(store.getSnapshot().simulationByWorkspace['ws-simuser']).toBe('all:route-dm')
    expect(screen.getByText(zh.toolsAvailable)).toBeTruthy()
  })

  it('renders sender badges and does not treat result_unknown as sent', () => {
    const { props } = bind()
    render(<ConversationTab {...props} />)
    expect(screen.getByText(zh.senderExternal)).toBeTruthy()
    expect(screen.getByText(zh.senderAi)).toBeTruthy()
    expect(screen.getByText(zh.senderNative)).toBeTruthy()
    expect(screen.getByText(zh.senderDsh)).toBeTruthy()
    expect(screen.getByText(zh.senderUnknown)).toBeTruthy()
    expect(screen.getByText(zh.deliveryUnknown)).toBeTruthy()
    expect(deliveryIsSuccess('result_unknown')).toBe(false)
    expect(deliveryIsSuccess('sent')).toBe(true)
    expect(document.querySelector('[data-delivery="result_unknown"]')?.textContent).toBe(zh.deliveryUnknown)
    expect(document.querySelector('[data-delivery="sent"]')?.textContent).toBe(zh.deliverySent)
  })

  it('sends manually as human_dsh while automatic handling is off', () => {
    const { props, store } = bind()
    render(<ConversationTab {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.liveDisable }))
    expect(store.getSnapshot().conversation.panel).toBe('disabled')
    fireEvent.change(screen.getByLabelText(zh.composerHint), { target: { value: '我来跟进' } })
    fireEvent.click(screen.getByRole('button', { name: zh.send }))
    const last = store.getSnapshot().conversation.messages.at(-1)
    expect(last).toMatchObject({ text: '我来跟进', sender: 'human_dsh', delivery: 'sent' })
  })

  it('navigates both simulated-user and tested-agent sessions', () => {
    const { props, store } = bind()
    render(<ConversationTab {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.openSimuser }))
    expect(store.getSnapshot().conversation.role).toBe('simuser')
    fireEvent.click(screen.getByRole('button', { name: zh.openTested }))
    expect(store.getSnapshot().conversation.role).toBe('tested')
  })

  it('walks the prototype experience route across the three surfaces', () => {
    const { props, store } = bind(createImGuiStore(emptyGuiSnapshot()))
    render(<AccountsSection close={() => {}} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.addAccount }))
    fireEvent.click(screen.getByRole('button', { name: zh.dingtalk }))
    fireEvent.click(screen.getByRole('button', { name: zh.next }))
    fireEvent.click(screen.getByRole('button', { name: zh.connect }))
    expect(store.getSnapshot().accounts[0]?.platform).toBe('dingtalk')
    expect(store.getSnapshot().accounts[0]?.credentialRef).toMatch(/^cred:/)
    expect(JSON.stringify(store.getSnapshot())).not.toMatch(/secret/i)
    cleanup()
    render(<TakeoverSection workspaceId="ws-tested" {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.addRoute }))
    fireEvent.click(screen.getByRole('button', { name: zh.addRouteDisabled }))
    const added = store.getSnapshot().routes[0]
    expect(added?.enabled).toBe(false)
    expect(added?.workspaceId).toBe('ws-tested')
    cleanup()
    render(<SimulationSection workspaceId="ws-tested" {...props} />)
    fireEvent.change(screen.getByLabelText(zh.simulationSelect), {
      target: { value: `all:${added?.id ?? ''}` },
    })
    expect(store.getSnapshot().simulationByWorkspace['ws-tested']).toBe(`all:${added?.id ?? ''}`)
    expect(screen.getByText(zh.toolsAvailable)).toBeTruthy()
    cleanup()
    store.update((draft) => {
      draft.conversation = {
        ...prototypeGuiSnapshot().conversation,
        role: 'simuser',
      }
    })
    render(<ConversationTab {...props} />)
    expect(screen.getByText(zh.senderExternal)).toBeTruthy()
    expect(screen.getByText(zh.deliveryUnknown)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh.openTested }))
    expect(store.getSnapshot().conversation.role).toBe('tested')
  })
})
