import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(join(process.cwd(), '.github/workflows/desktop-release.yml'), 'utf8')

describe('Desktop release workflow', () => {
  it('plans an explicit Desktop Bundle version before packaging', () => {
    expect(workflow).toContain('version:')
    expect(workflow).toContain('node apps/desktop/scripts/prepare-release.mjs')
    expect(workflow.match(/needs: prepare/g)).toHaveLength(2)
  })

  it('installs each macOS bundle on a matching runner architecture', () => {
    expect(workflow).toContain('arch: arm64\n            runner: macos-15')
    expect(workflow).toContain('arch: x64\n            runner: macos-15-intel')
    expect(workflow).toContain('runs-on: ${{ matrix.runner }}')
  })

  it('builds the Electron entry and publishes an explicit asset list', () => {
    expect(workflow.match(/@deepseek-ai\/dsh-desktop build:main/g)).toHaveLength(2)
    expect(workflow).toContain('RELEASE_VERSION: ${{ needs.prepare.outputs.version }}')
    expect(workflow).toContain('node apps/desktop/scripts/release-assets.mjs dist "$RELEASE_VERSION"')
    expect(workflow).not.toContain('dist/**/*')
  })

  it('smokes every packaged app before artifact upload', () => {
    expect(workflow.match(/electron-smoke-packaged\.spec\.ts/g)).toHaveLength(2)
    expect(workflow.match(/DSH_PACKAGED_APP_BIN/g)).toHaveLength(2)
    const macSmoke = workflow.indexOf('app_bin=$(find apps/desktop/release')
    const winSmoke = workflow.indexOf('$appBin = Get-ChildItem apps/desktop/release')
    expect(macSmoke).toBeGreaterThan(workflow.indexOf('electron-builder --mac'))
    expect(macSmoke).toBeLessThan(workflow.indexOf('name: gestalt-mac-'))
    expect(winSmoke).toBeGreaterThan(workflow.indexOf('electron-builder --win'))
    expect(winSmoke).toBeLessThan(workflow.indexOf('name: gestalt-win-x64'))
  })

  it('makes dry runs explicitly unsigned and reserves credentials for publication', () => {
    expect(workflow).toContain('CSC_IDENTITY_AUTO_DISCOVERY=false')
    expect(workflow).toContain('-c.mac.notarize=false')
    expect(workflow).toContain('CSC_LINK: ${{ secrets.CSC_LINK }}')
    expect(workflow).toContain('APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}')
  })

  it('creates the tag and release only after every packaged smoke passes', () => {
    expect(workflow).toContain('needs: [prepare, pack-mac, pack-win]')
    expect(workflow).toContain('tag=${{ needs.prepare.outputs.tag }}')
    expect(workflow).toContain('gh release create "$tag"')
    expect(workflow).toContain('--target "$GITHUB_SHA"')
    expect(workflow).not.toContain('tag=${GITHUB_REF_NAME}')
  })
})
