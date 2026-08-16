import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(join(process.cwd(), '.github/workflows/desktop-release.yml'), 'utf8')
const parsed = load(workflow)
const desktopPackage = JSON.parse(
  readFileSync(join(process.cwd(), 'apps/desktop/package.json'), 'utf8'),
) as unknown

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('expected record')
  return value
}

function job(name: string): Record<string, unknown> {
  return record(record(record(parsed).jobs)[name])
}

function steps(name: string): Record<string, unknown>[] {
  const value = job(name).steps
  if (!Array.isArray(value)) throw new Error(`expected ${name} steps`)
  return value.map(record)
}

describe('Desktop release workflow', () => {
  it('plans an explicit Desktop Bundle version before packaging', () => {
    expect(workflow).toContain('version:')
    expect(workflow).toContain('node apps/desktop/scripts/prepare-release.mjs')
    expect(workflow.match(/needs: prepare/g)).toHaveLength(2)
  })

  it('keeps release credentials out of preparation and dry-run packaging', () => {
    expect(JSON.stringify(job('prepare'))).not.toContain('secrets.')
    const mac = job('pack-mac')
    expect(record(mac.environment).name).toBe(
      "${{ inputs.publish && 'desktop-release' || 'desktop-dry-run' }}",
    )
    const dry = steps('pack-mac').find(step => step.name === 'Package unsigned')
    expect(JSON.stringify(dry)).not.toContain('secrets.')
    expect(dry?.run).toContain('-c.mac.identity=null')
    expect(dry?.run).toContain('-c.mac.notarize=false')
  })

  it('installs each macOS bundle on a matching runner architecture', () => {
    expect(workflow).toContain('arch: arm64\n            runner: macos-15')
    expect(workflow).toContain('arch: x64\n            runner: macos-15-intel')
    expect(workflow).toContain('runs-on: ${{ matrix.runner }}')
    expect(record(record(record(desktopPackage).build).mac).target).toEqual(['zip', 'dmg'])
  })

  it('builds the Electron entry and publishes an explicit asset list', () => {
    expect(workflow.match(/@deepseek-ai\/dsh-desktop build:main/g)).toHaveLength(2)
    expect(workflow.match(/--config\.node-linker=hoisted/g)).toHaveLength(2)
    expect(workflow.match(/--config\.inject-workspace-packages=true/g)).toHaveLength(2)
    expect(workflow.match(/--filter @deepseek-ai\/dsh deploy --prod/g)).toHaveLength(2)
    expect(workflow).not.toContain('--legacy')
    expect(workflow).toContain('RELEASE_VERSION: ${{ needs.prepare.outputs.version }}')
    expect(workflow).toContain('node apps/desktop/scripts/release-assets.mjs dist "$RELEASE_VERSION"')
    expect(workflow).not.toContain('dist/**/*')
  })

  it('keeps the prepared workspace dependencies intact while packaging', () => {
    expect(record(record(desktopPackage).build).npmRebuild).toBe(false)
    expect(workflow).not.toContain('dsh-desktop exec electron-builder')
    expect(workflow.match(/node_modules\/\.bin\/electron-builder/g)).toHaveLength(3)
    const packageSteps = [...steps('pack-mac'), ...steps('pack-win')].filter(step =>
      String(step.name).startsWith('Package'),
    )
    expect(packageSteps).toHaveLength(3)
    expect(packageSteps.every(step => step['working-directory'] === 'apps/desktop')).toBe(true)
    const winPackage = steps('pack-win').find(step => step.name === 'Package')
    expect(winPackage?.run).toContain("if ('${{ inputs.publish }}' -eq 'true')")
    expect(winPackage?.run).toContain("$compression = 'normal'")
    expect(winPackage?.run).toContain("$compression = 'store'")
    expect(winPackage?.run).toContain('"-c.compression=$compression"')
  })

  it('smokes every packaged app before artifact upload', () => {
    expect(workflow.match(/electron-smoke-packaged\.spec\.ts/g)).toHaveLength(2)
    expect(workflow.match(/DSH_PACKAGED_APP_BIN/g)).toHaveLength(2)
    expect(workflow).not.toContain('pnpm exec vitest run apps/desktop/tests/electron-smoke-packaged.spec.ts')
    expect(workflow.match(/node_modules\/\.bin\/vitest/g)).toHaveLength(2)
    const macSmoke = workflow.indexOf('app_bin=$(find apps/desktop/release')
    const winSmoke = workflow.indexOf('$appBin = Get-ChildItem apps/desktop/release')
    expect(macSmoke).toBeGreaterThan(workflow.indexOf('electron-builder --mac'))
    expect(macSmoke).toBeLessThan(workflow.indexOf('name: gestalt-mac-'))
    expect(winSmoke).toBeGreaterThan(workflow.indexOf('electron-builder --win'))
    expect(winSmoke).toBeLessThan(workflow.indexOf('name: gestalt-win-x64'))
  })

  it('forces and verifies signing and notarization before signed artifacts upload', () => {
    const macSteps = steps('pack-mac')
    const signed = macSteps.findIndex(step => step.name === 'Package signed and notarized')
    const verify = macSteps.findIndex(step => step.name === 'Verify signed app')
    const upload = macSteps.findIndex(step => step.uses === 'actions/upload-artifact@v4')
    expect(JSON.stringify(macSteps[signed])).toContain('secrets.CSC_LINK')
    expect(macSteps[signed]?.run).toContain('-c.forceCodeSigning=true')
    expect(macSteps[verify]?.run).toContain('codesign --verify --deep --strict')
    expect(macSteps[verify]?.run).toContain('xcrun stapler validate')
    expect(signed).toBeLessThan(verify)
    expect(verify).toBeLessThan(upload)
  })

  it('raises the open-file limit before macOS signing starts', () => {
    const signed = steps('pack-mac').find(step => step.name === 'Package signed and notarized')
    const command = String(signed?.run)
    expect(command).toContain('ulimit -n 65536')
    expect(command.indexOf('ulimit -n 65536')).toBeLessThan(
      command.indexOf('electron-builder --mac'),
    )
  })

  it('publishes a verified draft only after every packaged smoke passes', () => {
    expect(workflow).toContain('needs: [prepare, pack-mac, pack-win]')
    expect(workflow).toContain('tag=${{ needs.prepare.outputs.tag }}')
    expect(workflow).toContain('gh release create "$tag"')
    expect(workflow).toContain('gh api --method POST "repos/$GITHUB_REPOSITORY/git/refs"')
    expect(workflow).toContain('--target "$GITHUB_SHA"')
    expect(workflow).toContain('--verify-tag')
    expect(workflow).toContain('--draft')
    expect(workflow).toContain('gh release upload "$tag"')
    expect(workflow).toContain('gh release edit "$tag" --draft=false --latest')
    expect(workflow).toContain('if [[ "$tag_owned" == \'true\' ]]')
    expect(workflow).toContain('trap cleanup EXIT')
    expect(workflow).toContain("trap 'exit 130' INT")
    expect(workflow).toContain("trap 'exit 143' TERM")
    expect(workflow).toContain('published=true')
    expect(workflow).toContain('trap - EXIT INT TERM')
    expect(workflow).not.toContain('trap cleanup ERR')
    expect(workflow).not.toContain('--cleanup-tag')
    expect(workflow).not.toContain('tag=${GITHUB_REF_NAME}')

    const createTag = workflow.indexOf('gh api --method POST "repos/$GITHUB_REPOSITORY/git/refs"')
    const createDraft = workflow.indexOf('gh release create "$tag"')
    const uploadAssets = workflow.indexOf('gh release upload "$tag"')
    const publishRelease = workflow.indexOf('gh release edit "$tag" --draft=false --latest')
    const markPublished = workflow.indexOf('published=true')
    expect(createTag).toBeLessThan(createDraft)
    expect(createDraft).toBeLessThan(uploadAssets)
    expect(uploadAssets).toBeLessThan(publishRelease)
    expect(publishRelease).toBeLessThan(markPublished)
  })
})
