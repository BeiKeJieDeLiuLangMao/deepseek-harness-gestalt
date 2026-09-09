import { describe, expect, it, vi } from 'vitest'
import type { PhoneConnectionController } from '../src/client/phone-connection.ts'
import {
  buildOfficialPhoneDefinition, PhoneOccurrenceRuntime, phoneDeviceTabMetaOf,
} from '../src/client/registry.ts'

const source = {
  getBadge: () => ({ onlineCount: 2 }),
  snapshot: () => ({ android: [], ios: [] }),
  refresh: async () => {},
  subscribe: () => () => {},
}

describe('official Phone occurrence', () => {
  it('creates one singleton picker or occupied payload', () => {
    const definition = buildOfficialPhoneDefinition({
      source,
      title: () => 'Phone',
      occupiedTitle: name => `Phone · ${name}`,
      guideDescription: () => 'Connect a device',
    })
    expect(definition.single).toBe(true)
    expect(definition.guide?.[0]?.description()).toBe('Connect a device')
    expect(definition.badge?.({} as never, {} as never)).toBe(2)
    expect(definition.create?.({ payload: undefined } as never)).toEqual({ title: 'Phone', payload: {} })
    expect(definition.create?.({
      payload: { kind: 'device', serial: 'emulator-5554', name: 'Pixel' },
    } as never)).toEqual({
      title: 'Phone · Pixel',
      payload: { kind: 'device', serial: 'emulator-5554', name: 'Pixel' },
    })
    expect(phoneDeviceTabMetaOf({ kind: 'device', serial: '', name: 'Pixel' })).toBeUndefined()
  })

  it('keeps a controller across view remounts and disposes it with the occurrence', () => {
    const setVisible = vi.fn()
    const dispose = vi.fn()
    const controller = { setVisible, dispose } as unknown as PhoneConnectionController
    let tabs: unknown[] = [{
      sessionId: 'session-1',
      record: { id: 'phone', kind: 'phone' },
      state: { payload: { kind: 'device', serial: 'emulator-5554', name: 'Pixel' } },
      visible: true,
    }]
    const ctx = {
      sidebarRight: { getSnapshot: () => ({ sessions: [{ sessionId: 'session-1', tabs }] }) },
    }
    const runtime = new PhoneOccurrenceRuntime(ctx as never, () => controller)
    runtime.sync()
    expect(runtime.controllerFor('session-1', 'phone')).toBe(controller)
    runtime.sync()
    expect(dispose).not.toHaveBeenCalled()
    expect(setVisible).toHaveBeenLastCalledWith(true)
    tabs = []
    runtime.sync()
    expect(dispose).toHaveBeenCalledOnce()
  })
})
