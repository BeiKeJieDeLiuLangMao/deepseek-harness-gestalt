import { describe, expect, it } from 'vitest'
import { clientSourceRoot, findUiI18nViolations } from './verify-client-ui-i18n.ts'

function messages(source: string): string[] {
  return findUiI18nViolations('packages/client/ui-example/src/client/View.tsx', source)
    .map(violation => violation.text)
}

describe('Client UI i18n source check', () => {
  it('rejects direct JSX copy and copy-bearing attributes', () => {
    expect(messages(`
      const View = ({ ready }: { ready: boolean }) => <section aria-label="Overview">
        <span>Hard-coded text</span>
        <input placeholder={ready ? 'Search now' : ` + "`Wait ${'${ready}'}`" + `} />
        <div runningSummary="Still working" />
      </section>
    `)).toEqual(['Overview', 'Hard-coded text', 'Search now', 'Wait', 'Still working'])
  })

  it('rejects copy kept in label data and copy helper returns', () => {
    expect(messages(`
      const TABS = [{ id: 'summary', label: 'Summary' }]
      function statusLabel(status: string): string {
        if (status === 'done') return 'Complete'
        return 'Still running'
      }
      function duration(): string { return 'Not recorded' }
      function mode(): string { return 'compact' }
      function displayFailureMessage(): string { return 'API key is invalid' }
      const emptySummary = 'Nothing to show'
      function Dialog({ closeLabel = 'Close dialog' }: { closeLabel?: string }) { return closeLabel }
    `)).toEqual([
      'Summary', 'Complete', 'Still running', 'Not recorded', 'API key is invalid',
      'Nothing to show', 'Close dialog',
    ])
  })

  it('normalizes native separators before deriving a Client source root', () => {
    expect(clientSourceRoot('packages/extensions/sample/src/client/View.tsx'))
      .toBe('packages/extensions/sample/src/client')
    expect(clientSourceRoot('packages\\extensions\\sample\\src\\client\\View.tsx'))
      .toBe('packages/extensions/sample/src/client')
    expect(clientSourceRoot('packages/extensions/sample/src/server/index.ts')).toBeUndefined()
  })

  it('accepts translated copy, dynamic values, structural attributes, and language tokens', () => {
    expect(messages(`
      const View = ({ t, value }: { t: (key: string) => string; value: string }) => (
        <section className="root" role="region" aria-label={t('overview')}>
          <span>{t('status.complete')}</span>
          <code>null</code>
          {value === 'pending' && <output>{value}</output>}
          <output>{value}</output>
        </section>
      )
    `)).toEqual([])
  })

  it('accepts explicitly invariant literals while retaining nearby copy checks', () => {
    expect(messages(`
      /** @uiI18n protocol */
      const SESSION_TITLE = 'Side: New thread'
      /** @uiI18n diagnostic */
      const ERROR_MESSAGE = 'runtime connection failed'
      /** @uiI18n unsupported */
      const DIALOG_TITLE = 'Hard-coded dialog title'
      const View = () => <>
        <span translate="no">GESTALT</span>
        <svg><text data-ui-i18n="brand">GESTALT</text><text>Translate me too</text></svg>
        <div data-ui-i18n="brand">Still translate me</div>
        <svg><g data-ui-i18n="brand"><text>Nested brand marker is invalid</text></g></svg>
        <svg><text data-ui-i18n="protocol">Wrong SVG category</text></svg>
        <span>Translate me</span>
      </>
    `)).toEqual([
      'Hard-coded dialog title',
      'Translate me too',
      'Still translate me',
      'Nested brand marker is invalid',
      'Wrong SVG category',
      'Translate me',
    ])
  })

  it('ignores a structural HTML document while retaining static body and accessible copy', () => {
    expect(messages(`
      function structuralDocument(body: string): string {
        return \`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'"></head><body>\${body}</body></html>\`
      }
    `)).toEqual([])
    expect(messages(`
      function exportDocument(): string {
        return '<!doctype html><html><body>Hard-coded body</body></html>'
      }
    `)).toHaveLength(1)
    for (const attribute of ['aria-label=Export', 'alt=Preview', 'placeholder=Search', 'title=Details']) {
      expect(messages(`
        function exportDocument(): string {
          return '<!doctype html><html><body ${attribute}></body></html>'
        }
      `)).toHaveLength(1)
    }
    expect(messages(`
      function exportDocument(): string {
        return '<!doctype html><html><body aria-label="Export preview"></body></html>'
      }
    `)).toHaveLength(1)
  })

  it('does not inspect locale dictionary owners', () => {
    expect(findUiI18nViolations(
      'packages/client/ui-example/src/client/locales.ts',
      'export const en = { title: "Hard-coded by design" }',
    )).toEqual([])
  })
})
