import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { EditorState } from '@codemirror/state'
import { serializeEditorText } from '../src/client/TextEditor.tsx'

let directory: string | undefined

afterEach(async () => {
  if (directory !== undefined) await rm(directory, { recursive: true, force: true })
  directory = undefined
})

describe('TextEditorCore line endings', () => {
  it.each([
    ['LF with terminator', 'alpha\nbeta\n', 'alpha changed\nbeta\n'],
    ['CRLF with terminator', 'alpha\r\nbeta\r\n', 'alpha changed\r\nbeta\r\n'],
    ['no final newline', 'alpha\nbeta', 'alpha changed\nbeta'],
    ['multiple trailing blank lines', 'alpha\r\nbeta\r\n\r\n', 'alpha changed\r\nbeta\r\n\r\n'],
  ])('preserves %s during a real CodeMirror document edit and disk write', async (_name, source, expected) => {
    directory = await mkdtemp(join(tmpdir(), 'dsh-editor-lines-'))
    const path = join(directory, 'file.txt')
    await writeFile(path, source)
    const state = EditorState.create({ doc: source })
    const line = state.doc.line(1)
    const edited = state.update({ changes: { from: line.from, to: line.to, insert: 'alpha changed' } }).state.doc.toString()
    await writeFile(path, serializeEditorText(source, edited))
    expect(await readFile(path)).toEqual(Buffer.from(expected))
  })
})
