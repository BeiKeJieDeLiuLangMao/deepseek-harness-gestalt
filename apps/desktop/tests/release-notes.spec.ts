import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

  it('writes the verified body through the release CLI', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-release-notes-'))
    const output = join(directory, 'notes.md')
    try {
      const result = spawnSync(
        process.execPath,
        ['apps/desktop/scripts/render-release-notes.mjs', '0.1.0', releaseTarget, output],
        { cwd: process.cwd(), encoding: 'utf8' },
      )
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
      expect(readFileSync(output, 'utf8')).toBe(
        readFileSync(
          join(process.cwd(), 'apps/desktop/tests/fixtures/release-notes-0.1.0.expected.md'),
          'utf8',
        ),
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
