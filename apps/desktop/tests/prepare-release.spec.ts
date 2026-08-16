import { describe, expect, it } from 'vitest'
import { prepareRelease } from '../scripts/prepare-release.mjs'

const signingEnvironment = {
  CSC_LINK: 'certificate',
  CSC_KEY_PASSWORD: 'password',
  APPLE_ID: 'developer@example.com',
  APPLE_APP_SPECIFIC_PASSWORD: 'app-password',
  APPLE_TEAM_ID: 'TEAM123',
}

describe('prepareRelease', () => {
  it('derives a release tag from the matching Desktop Bundle version', () => {
    expect(
      prepareRelease({
        requestedVersion: '0.1.0',
        packageVersion: '0.1.0',
        publish: true,
        refName: 'master',
        tagExists: false,
        environment: signingEnvironment,
      }),
    ).toEqual({ tag: 'gestalt-v0.1.0', version: '0.1.0' })
  })

  it('rejects a version that does not match the Desktop Bundle', () => {
    expect(() =>
      prepareRelease({
        requestedVersion: '0.2.0',
        packageVersion: '0.1.0',
        publish: false,
        refName: 'feature',
        tagExists: false,
        environment: {},
      }),
    ).toThrow('does not match')
  })

  it('requires master and an unused tag for publication', () => {
    const base = {
      requestedVersion: '0.1.0',
      packageVersion: '0.1.0',
      publish: true,
      tagExists: false,
      environment: signingEnvironment,
    }
    expect(() => prepareRelease({ ...base, refName: 'feature' })).toThrow('master')
    expect(() => prepareRelease({ ...base, refName: 'master', tagExists: true })).toThrow('already exists')
  })

  it('lists every missing signing and notarization secret before publication', () => {
    expect(() =>
      prepareRelease({
        requestedVersion: '0.1.0',
        packageVersion: '0.1.0',
        publish: true,
        refName: 'master',
        tagExists: false,
        environment: { CSC_LINK: 'certificate' },
      }),
    ).toThrow(
      'CSC_KEY_PASSWORD, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID',
    )
  })

  it('allows credential-free dry-run packaging from a branch', () => {
    expect(
      prepareRelease({
        requestedVersion: '0.1.0',
        packageVersion: '0.1.0',
        publish: false,
        refName: 'feature',
        tagExists: false,
        environment: {},
      }),
    ).toEqual({ tag: 'gestalt-v0.1.0', version: '0.1.0' })
  })
})
