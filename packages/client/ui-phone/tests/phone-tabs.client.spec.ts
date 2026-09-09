import { describe, expect, it, vi } from 'vitest'
import { phoneDeviceIdOf } from '../src/client/phone-device-id.ts'
import {
  buildOfficialPhoneDefinition, openPhoneDevicePanel, PHONE_DEFINITION_ID, PHONE_TAB_ID,
  PhoneOccurrenceRuntime, phoneDeviceTabMetaOf, phoneTabTitleOf,
} from '../src/client/registry.ts'

const SOURCE = {
  getBadge: () => ({ onlineCount: 0 }), snapshot: () => ({ android: [], ios: [] }),
  refresh: async () => {}, subscribe: () => () => {},
}

describe('official single Phone tab', () => {
  it('keeps the picker reachable as one singleton', () => {
    const definition = buildOfficialPhoneDefinition({
      source: SOURCE, title: () => '手机', occupiedTitle: phoneTabTitleOf,
    })
    expect(definition).toMatchObject({
      id: PHONE_DEFINITION_ID, kind: PHONE_TAB_ID, single: true, order: 55,
    })
    expect(definition.create?.({ payload: undefined } as never)).toEqual({ title: '手机', payload: {} })
    expect(definition.dedupeKey?.({} as never)).toBe('phone')
  })

  it('restores device id and name from the durable payload', () => {
    expect(phoneDeviceTabMetaOf({ kind: 'device', serial: 'R3CN30', name: 'SM-S9310' }))
      .toEqual({ kind: 'device', serial: 'R3CN30', name: 'SM-S9310' })
    expect(phoneDeviceTabMetaOf({ kind: 'device', serial: '', name: 'SM-S9310' })).toBeUndefined()
    expect(phoneDeviceTabMetaOf({ kind: 'device', serial: 'R3CN30', name: '' })).toBeUndefined()
    expect(phoneDeviceTabMetaOf('junk')).toBeUndefined()
  })

  it('opens Settings selections into the official singleton and updates it in place', async () => {
    const openTab = vi.fn(async () => 'tab-phone')
    const update = vi.fn()
    const sidebar = { openTab, update }
    await openPhoneDevicePanel(
      sidebar as never, () => true, phoneDeviceIdOf('fbcd1d21'), 'MI 8', phoneTabTitleOf,
    )
    expect(openTab).toHaveBeenCalledWith('phone')
    expect(update).toHaveBeenCalledWith('tab-phone', {
      title: '手机·MI 8', payload: { kind: 'device', serial: 'fbcd1d21', name: 'MI 8' },
    })
  })

  it('does not open a device while the gate is disabled', async () => {
    const sidebar = { openTab: vi.fn(), update: vi.fn() }
    await openPhoneDevicePanel(
      sidebar as never, () => false, phoneDeviceIdOf('blocked'), 'Blocked', phoneTabTitleOf,
    )
    expect(sidebar.openTab).not.toHaveBeenCalled()
    expect(sidebar.update).not.toHaveBeenCalled()
  })

  it('uses the supplied locale for occupied titles', () => {
    const definition = buildOfficialPhoneDefinition({
      source: SOURCE, title: () => 'Phone', occupiedTitle: name => `Phone · ${name}`,
    })
    expect(definition.create?.({
      payload: { kind: 'device', serial: 'emulator-5554', name: 'Pixel' },
    } as never)).toEqual({
      title: 'Phone · Pixel', payload: { kind: 'device', serial: 'emulator-5554', name: 'Pixel' },
    })
  })

  it('keeps the controller through remounts and disposes it on occurrence removal', () => {
    const controller = { setVisible: vi.fn(), dispose: vi.fn() }
    let tabs: unknown[] = [{
      sessionId: 's1', record: { id: 'phone', kind: 'phone' }, visible: false,
      state: { payload: { kind: 'device', serial: 'R3CN30', name: 'Phone' } },
    }]
    const runtime = new PhoneOccurrenceRuntime({
      sidebarRight: { getSnapshot: () => ({ sessions: [{ sessionId: 's1', tabs }] }) },
    } as never, () => controller as never)
    runtime.sync()
    runtime.sync()
    expect(runtime.controllerFor('s1', 'phone')).toBe(controller)
    expect(controller.setVisible).toHaveBeenLastCalledWith(false)
    expect(controller.dispose).not.toHaveBeenCalled()
    tabs = []
    runtime.sync()
    expect(controller.dispose).toHaveBeenCalledOnce()
  })
})
