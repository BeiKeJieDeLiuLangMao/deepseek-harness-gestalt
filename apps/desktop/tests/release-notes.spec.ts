import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  loadReleaseNotesManifest,
  renderReleaseNotes,
} from '../scripts/render-release-notes.mjs'

const releaseTarget = 'de2610c9590f2e5b33ab366eb338f7c42058b11b'

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('expected record')
  }
  return value as Record<string, unknown>
}

describe('Desktop release notes', () => {
  it('renders the complete bilingual 0.1.0 changelog from its tracked manifest', () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'apps/desktop/release-notes/0.1.0.json'), 'utf8'),
    ) as unknown
    const expected = readFileSync(
      join(process.cwd(), 'apps/desktop/tests/fixtures/release-notes-0.1.0.expected.md'),
      'utf8',
    )

    expect(
      renderReleaseNotes({
        manifest,
        requestedVersion: '0.1.0',
        releaseTarget,
        isAncestor: () => true,
        countCommits: () => 25,
      }),
    ).toBe(expected)
  })

  it('rejects a missing version manifest', () => {
    expect(() => loadReleaseNotesManifest('9.9.9')).toThrow(
      'Desktop release-note manifest is missing for 9.9.9',
    )
  })

  it('rejects incomplete bilingual content', () => {
    const manifest = structuredClone(loadReleaseNotesManifest('0.1.0'))
    delete record(record(manifest).content).en

    expect(() =>
      renderReleaseNotes({
        manifest,
        requestedVersion: '0.1.0',
        releaseTarget,
        isAncestor: () => true,
        countCommits: () => 25,
      }),
    ).toThrow('complete Chinese and English content')
  })

  it('rejects a manifest version that differs from the requested bundle', () => {
    const manifest = structuredClone(loadReleaseNotesManifest('0.1.0'))
    record(manifest).version = '0.2.0'

    expect(() =>
      renderReleaseNotes({
        manifest,
        requestedVersion: '0.1.0',
        releaseTarget,
        isAncestor: () => true,
        countCommits: () => 25,
      }),
    ).toThrow('manifest version 0.2.0 does not match requested Desktop Bundle 0.1.0')
  })

  it('rejects a baseline that is not an ancestor of the release target', () => {
    expect(() =>
      renderReleaseNotes({
        manifest: loadReleaseNotesManifest('0.1.0'),
        requestedVersion: '0.1.0',
        releaseTarget,
        isAncestor: () => false,
        countCommits: () => 25,
      }),
    ).toThrow('baseline is not an ancestor of release target')
  })

  it('rejects a tag that does not derive from the manifest version', () => {
    const manifest = structuredClone(loadReleaseNotesManifest('0.1.0'))
    record(manifest).tag = 'gestalt-v0.2.0'

    expect(() =>
      renderReleaseNotes({
        manifest,
        requestedVersion: '0.1.0',
        releaseTarget,
        isAncestor: () => true,
        countCommits: () => 25,
      }),
    ).toThrow('manifest tag gestalt-v0.2.0 does not match version 0.1.0')
  })

  it('rejects an unknown baseline kind', () => {
    const manifest = structuredClone(loadReleaseNotesManifest('0.1.0'))
    record(record(manifest).source).baselineKind = 'fork-point'

    expect(() =>
      renderReleaseNotes({
        manifest,
        requestedVersion: '0.1.0',
        releaseTarget,
        isAncestor: () => true,
        countCommits: () => 25,
      }),
    ).toThrow('unsupported baseline kind: fork-point')
  })

  it('labels a previous-release baseline in both languages', () => {
    const manifest = structuredClone(loadReleaseNotesManifest('0.1.0'))
    const source = record(record(manifest).source)
    source.baselineKind = 'previous-release'
    source.baselineRepository = 'BeiKeJieDeLiuLangMao/deepseek-harness-gestalt'

    const body = renderReleaseNotes({
      manifest,
      requestedVersion: '0.1.0',
      releaseTarget,
      isAncestor: () => true,
      countCommits: () => 25,
    })
    expect(body).toContain('上一版本基线：')
    expect(body).toContain('Previous release baseline: ')
  })

  it('renders the 0.1.1 previous-release changelog from its tracked manifest', () => {
    const body = renderReleaseNotes({
      manifest: loadReleaseNotesManifest('0.1.1'),
      requestedVersion: '0.1.1',
      releaseTarget,
      isAncestor: () => true,
      countCommits: () => 10,
    })
    expect(body).toContain('DeepSeek Gestalt 0.1.1 收录上一版本之后的 10 个提交。')
    expect(body).toContain('DeepSeek Gestalt 0.1.1 contains the 10 commits after the previous Desktop Bundle.')
    expect(body).toContain('上一版本基线：')
    expect(body).toContain('Previous release baseline: ')
    expect(body).toContain('gestalt-v0.1.1')
    expect(body).toContain('de2610c9590f2e5b33ab366eb338f7c42058b11b...gestalt-v0.1.1')
  })

  it('renders the 0.1.2 previous-release changelog from its tracked manifest', () => {
    const body = renderReleaseNotes({
      manifest: loadReleaseNotesManifest('0.1.2'),
      requestedVersion: '0.1.2',
      releaseTarget,
      isAncestor: () => true,
      countCommits: () => 3,
    })
    expect(body).toContain('DeepSeek Gestalt 0.1.2 收录上一版本之后的 3 个提交。')
    expect(body).toContain('DeepSeek Gestalt 0.1.2 contains the 3 commits after the previous Desktop Bundle.')
    expect(body).toContain('gestalt-v0.1.2')
    expect(body).toContain('a7482b9709e4631d624f6b471ef2aeec249baf7d...gestalt-v0.1.2')
  })

  it('renders the 0.1.3 previous-release changelog from its tracked manifest', () => {
    const body = renderReleaseNotes({
      manifest: loadReleaseNotesManifest('0.1.3'),
      requestedVersion: '0.1.3',
      releaseTarget,
      isAncestor: () => true,
      countCommits: () => 2,
    })
    expect(body).toContain('DeepSeek Gestalt 0.1.3 收录上一版本之后的 2 个提交。')
    expect(body).toContain('DeepSeek Gestalt 0.1.3 contains the 2 commits after the previous Desktop Bundle.')
    expect(body).toContain('gestalt-v0.1.3')
    expect(body).toContain('4bbbf74a07799fb681e033288fb55b3b16fc08c0...gestalt-v0.1.3')
  })

  it('rejects a CLI invocation without version, target, and output path', () => {
    const result = spawnSync(
      process.execPath,
      ['apps/desktop/scripts/render-release-notes.mjs'],
      { cwd: process.cwd(), encoding: 'utf8' },
    )
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('usage: render-release-notes.mjs')
  })
})
