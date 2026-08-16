import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(join(process.cwd(), '.github/workflows/desktop-release.yml'), 'utf8')

describe('Desktop release workflow', () => {
  it('installs each macOS bundle on a matching runner architecture', () => {
    expect(workflow).toContain('arch: arm64\n            runner: macos-15')
    expect(workflow).toContain('arch: x64\n            runner: macos-15-intel')
    expect(workflow).toContain('runs-on: ${{ matrix.runner }}')
  })

  it('builds the Electron entry and publishes an explicit asset list', () => {
    expect(workflow.match(/@deepseek-ai\/dsh-desktop build:main/g)).toHaveLength(2)
    expect(workflow).toContain('node apps/desktop/scripts/release-assets.mjs dist')
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
})
