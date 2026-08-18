import { describe, expect, it } from 'vitest'
import {
  BrowserInstanceId,
  BrowserProfileId,
  BrowserRuntimeError,
  BrowserTabId,
  BrowserWorkspaceId,
} from '@deepseek-ai/dsh-browser-runtime'

describe('Browser Runtime public vocabulary', () => {
  it('brands opaque identities without changing Provider-issued values', () => {
    expect({
      profileId: BrowserProfileId('profile'),
      workspaceId: BrowserWorkspaceId('workspace'),
      browserId: BrowserInstanceId('browser'),
      tabId: BrowserTabId('tab'),
    }).toEqual({
      profileId: 'profile',
      workspaceId: 'workspace',
      browserId: 'browser',
      tabId: 'tab',
    })
  })

  it('retains the stable Browser Runtime error code', () => {
    const error = new BrowserRuntimeError('missing target', 'BROWSER_NOT_FOUND')
    expect(error).toMatchObject({ name: 'BrowserRuntimeError', message: 'missing target', code: 'BROWSER_NOT_FOUND' })
  })
})
