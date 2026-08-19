// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import {
  apply as applySettings,
  inject as settingsInject,
} from '@deepseek-ai/dsh-client-ui-settings-general/client'
import { CloseLabel, HeaderContent, TriggerContent } from '@deepseek-ai/dsh-client-ui-settings-general/src/client/chrome.tsx'
import { GeneralSection } from '@deepseek-ai/dsh-client-ui-settings-general/src/client/GeneralSection.tsx'
import { SettingsRoot } from '@deepseek-ai/dsh-client-ui-settings-general/src/client/SettingsRoot.tsx'
import type { SettingsRootInjected } from '@deepseek-ai/dsh-client-ui-settings-general/src/client/shell-contract.ts'
import { apply as applyDesktop, inject as desktopInject } from '@deepseek-ai/dsh-client-ui-desktop/client'
import { AccountControl } from '../src/client/AccountControl.tsx'
import type { AccountControlInjected } from '../src/client/AccountControl.tsx'
import type { DesktopAccountSnapshot, DesktopBridge, DesktopPairingSnapshot } from '../src/protocol.ts'

usePinnedBrowserLanguages('zh-CN')

afterEach(() => {
  cleanup()
  delete window.dshDesktop
})

describe('Desktop Settings shell Mobile Access placement', () => {
  it('places Mobile Access only in the 手机配对 Settings section', async () => {
    const assembled = await assemble()
    const sectionIds = assembled.slots.entries('settings.section').map(entry => entry.options.id)
    expect(sectionIds).toEqual(['general', 'mobile-pairing'])
    expect(resolveSlotLabel(assembled.slots.entries('settings.section')[0]!.options.label)).toBe('通用设置')
    expect(resolveSlotLabel(assembled.slots.entries('settings.section')[1]!.options.label)).toBe('手机配对')
    expect(assembled.slots.entries('conversation').map(entry => entry.component)).not.toContain(AccountControl)
    expect(assembled.slots.entries('conversation.session')).toEqual([])
    expect(assembled.slots.entries('conversation.composer')).toEqual([])
    expect(assembled.slots.entries('sidebar.workspaces')).toEqual([])
    expect(assembled.slots.entries('sidebar.brand').length).toBeGreaterThan(0)
    expect(assembled.slots.entries('sidebar.footer.action').map(entry => entry.options.id)).toContain('desktop-update')

    await vi.waitFor(() => {
      expect(assembled.pairingInject().hooks.account.getSnapshot().status).toBe('signed-in')
      expect(assembled.pairingInject().hooks.pairing.getSnapshot().enabled).toBe(false)
    })

    const unused = (() => { throw new Error('unused by SettingsRoot') }) as never
    const settingsT = assembled.locale.bind('settings')
    const desktopT = assembled.locale.bind('desktop')
    render(
      <SettingsRoot
        wide
        useSessions={select => select({
          phase: 'ready',
          current: 'active-session',
          byId: { 'active-session': { blank: false } },
        } as never)}
        useWorkspaces={unused}
        useOnboardingSteps={select => select([])}
        useSections={select => select(assembled.shellInject().hooks.sections.getSnapshot())}
        renderSlot={(key, owner, opts) => {
          if (key === 'settings.trigger') {
            return <TriggerContent t={settingsT} wide useSessions={unused} useWorkspaces={unused} />
          }
          if (key === 'settings.header') {
            return <HeaderContent t={settingsT} useSessions={unused} useWorkspaces={unused} />
          }
          if (key === 'settings.close') {
            return <CloseLabel t={settingsT} useSessions={unused} useWorkspaces={unused} />
          }
          if (key === 'settings.action') return null
          if (key === 'settings.section' && opts?.only === 'general') {
            return <GeneralSection useSessions={unused} useWorkspaces={unused} close={vi.fn()} renderSlot={() => null} />
          }
          if (key === 'settings.section' && opts?.only === 'mobile-pairing') {
            const hooks = assembled.pairingInject().hooks
            return (
              <AccountControl
                t={desktopT}
                useSessions={unused}
                useWorkspaces={unused}
                close={'close' in owner ? owner.close as () => void : vi.fn()}
                useAccount={select => select(hooks.account.getSnapshot())}
                usePairing={select => select(hooks.pairing.getSnapshot())}
              />
            )
          }
          return null
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(screen.getByRole('button', { name: '手机配对' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '通用设置' }).getAttribute('aria-current')).toBe('true')
    expect(screen.queryByRole('switch', { name: 'Mobile Access' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '手机配对' }))
    const access = screen.getByRole('switch', { name: 'Mobile Access' })
    expect(access.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(access)
    expect(assembled.desktop.pairingSetEnabled).toHaveBeenCalledWith(true)

    fireEvent.click(screen.getByRole('button', { name: '通用设置' }))
    expect(screen.queryByRole('switch', { name: 'Mobile Access' })).toBeNull()
    await assembled.fiber.dispose()
  })
})

async function assemble() {
  const account: DesktopAccountSnapshot = {
    status: 'signed-in',
    privacyAccepted: true,
    account: {
      id: 'account-1',
      githubId: 1,
      githubLogin: 'octocat',
      avatarUrl: 'https://avatars.example/octocat',
    },
  }
  const pairing: DesktopPairingSnapshot = { status: 'ready', enabled: false, pairings: [] }
  const desktop = bridge(account, pairing)
  window.dshDesktop = desktop
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  ctx.provide('connection', {
    api: {
      settings: {
        describe: vi.fn(async () => ({
          rpcId: 'settings-general',
          result: { ok: true, value: { writable: true, hasDocument: true, namespaces: [] } },
        })),
        openDocument: vi.fn(async () => ({
          rpcId: 'settings-open',
          result: { ok: true, value: { opened: true } },
        })),
      },
    },
    isLoopback: true,
  } as never)
  const slots = ctx.get('slots') as SlotRegistry
  slots.register(
    {
      name: 'root',
      children: {
        sidebar: { kind: 'single', scope: 'root' },
        'sidebar.settings': { kind: 'single', scope: 'root' },
        conversation: { kind: 'single', scope: 'session-maybe' },
      },
    } as never,
    () => null,
  )
  slots.register(
    {
      name: 'sidebar',
      children: {
        'sidebar.brand': { kind: 'chain', scope: 'root' },
        'sidebar.chrome.drag': { kind: 'list', scope: 'root' },
        'sidebar.footer.action': { kind: 'list', scope: 'root' },
        'sidebar.workspaces': { kind: 'single', scope: 'root' },
      },
    } as never,
    () => null,
  )
  slots.register(
    {
      name: 'conversation',
      children: {
        'conversation.session': { kind: 'single', scope: 'session' },
        'conversation.composer': { kind: 'chain', scope: 'session' },
      },
    } as never,
    () => null,
  )
  await ctx.plugin({ inject: [...settingsInject], apply: applySettings }).await()
  const fiber = ctx.plugin({ inject: [...desktopInject], apply: applyDesktop })
  await fiber.await()
  return {
    desktop,
    locale,
    slots,
    fiber,
    shellInject: () => (slots.entries('sidebar.settings')[0]!.inject as () => SettingsRootInjected)(),
    pairingInject: () => (
      slots.entries('settings.section').find(entry => entry.options.id === 'mobile-pairing')!.inject as () => AccountControlInjected
    )(),
  }
}

function bridge(account: DesktopAccountSnapshot, pairing: DesktopPairingSnapshot): DesktopBridge {
  return {
    platform: 'darwin',
    getStatus: async () => ({ state: 'idle', lastCheckedAt: null }),
    checkNow: vi.fn(),
    downloadNow: vi.fn(),
    quitAndInstall: vi.fn(),
    onStatus: () => () => {},
    windowMinimize: vi.fn(),
    windowMaximize: vi.fn(),
    windowClose: vi.fn(),
    accountGetSnapshot: vi.fn().mockResolvedValue(account),
    accountAcceptPrivacy: vi.fn(),
    accountBeginLogin: vi.fn(),
    accountSignOut: vi.fn(),
    onAccountSnapshot: vi.fn(() => () => {}),
    pairingGetSnapshot: vi.fn().mockResolvedValue(pairing),
    pairingSetEnabled: vi.fn(),
    pairingCreateChallenge: vi.fn(),
    pairingCancelChallenge: vi.fn(),
    pairingConfirm: vi.fn(),
    pairingReject: vi.fn(),
    pairingRevoke: vi.fn(),
    onPairingSnapshot: vi.fn(() => () => {}),
  }
}
