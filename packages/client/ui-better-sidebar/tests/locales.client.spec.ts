import { afterEach, describe, expect, it } from 'vitest'
import { attachLocale, saveShortcutTitle, t } from '../src/client/locales.ts'

afterEach(() => { attachLocale(undefined) })

describe('better sidebar locale copy', () => {
  it('switches visible error copy and shared save titles with the active locale', () => {
    const locale = { active: 'en' }
    attachLocale({ getSnapshot: () => locale })

    expect(t('renderError', { message: 'boom' })).toBe('dsh-better-sidebar: boom')
    expect(t('chunkMissing', { chunk: 'editor' })).toBe(
      '[dsh-better-sidebar] chunk "editor" is missing its component',
    )
    expect(saveShortcutTitle()).toBe('Save (Ctrl/Cmd+S)')

    locale.active = 'zh'
    expect(t('renderError', { message: '故障' })).toBe('dsh-better-sidebar：故障')
    expect(t('chunkMissing', { chunk: 'editor' })).toBe('[dsh-better-sidebar] 分块“editor”缺少组件')
    expect(saveShortcutTitle()).toBe('保存 (Ctrl/Cmd+S)')
  })
})
