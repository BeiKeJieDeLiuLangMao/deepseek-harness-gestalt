import { writeFile } from 'node:fs/promises'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { type SessionEvent } from '@deepseek-ai/dsh-session'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const driver = fileURLToPath(new URL(
  '../../../../examples/headless-agent/tests/fixtures/context/workspace-reference/driver.ts',
  import.meta.url,
))
const configPath = fileURLToPath(new URL(
  '../../../../examples/headless-agent/tests/fixtures/context/workspace-reference/cordis.yml',
  import.meta.url,
))
const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

async function jsonlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const paths = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return jsonlFiles(path)
    return entry.isFile() && entry.name.endsWith('.jsonl') ? [path] : []
  }))
  return paths.flat()
}

describe('workspace-reference through a real headless cordis.yml', () => {
  it('persists an existence-only marker for a validated @path', async () => {
    let events: SessionEvent[] = []
    const { stderr } = await runLoaderSmoke({
      label: 'workspace-reference headless smoke',
      tempDirPrefix: 'workspace-reference-e2e-',
      binScript: driver,
      libBinScript: driver,
      configPath,
      tsconfigPath: repoTsconfig,
      prepare: async (cwd) => {
        await writeFile(join(cwd, 'README.md'), '# fixture\n')
      },
      inspect: async (cwd) => {
        const logs = await jsonlFiles(join(cwd, '.sessions'))
        expect(logs).toHaveLength(1)
        const lines = (await readFile(logs[0] as string, 'utf8')).trimEnd().split('\n')
        events = lines.slice(1).map(line => JSON.parse(line) as SessionEvent)
      },
    })
    expect(stderr).not.toContain('UNHANDLED')
    const references = events.filter(
      (event): event is SessionEvent<'user/message'> =>
        event.type === 'user/message' && event.data.source.kind === 'workspace-reference',
    )
    expect(references).toHaveLength(1)
    expect(references[0]!.data.source).toEqual({
      kind: 'workspace-reference',
      path: 'README.md',
      pathKind: 'file',
    })
    const text = references[0]!.data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
    expect(text).toBe('<workspace-reference path="README.md" kind="file" />')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
