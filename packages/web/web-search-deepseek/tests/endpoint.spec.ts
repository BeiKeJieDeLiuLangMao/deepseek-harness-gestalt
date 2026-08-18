import { describe, expect, it } from 'vitest'
import { classifySearchEndpoint } from '../src/endpoint.ts'

describe('classifySearchEndpoint', () => {
  it('keeps DeepSeek Anthropic bases on Messages search', () => {
    expect(classifySearchEndpoint('https://api.deepseek.com/anthropic/v1')).toBe('deepseek-messages')
    expect(classifySearchEndpoint('https://gateway.internal/anthropic/v1')).toBe('deepseek-messages')
  })

  it('selects Moonshot dedicated search on official hosts', () => {
    expect(classifySearchEndpoint('https://api.moonshot.cn/v1/search')).toBe('moonshot-search')
    expect(classifySearchEndpoint('https://api.moonshot.ai/v1/search')).toBe('moonshot-search')
    expect(classifySearchEndpoint('https://api.kimi.com/v1/search')).toBe('moonshot-search')
    expect(classifySearchEndpoint('https://API.Kimi.AI/v1/search')).toBe('moonshot-search')
  })

  it('selects Moonshot dedicated search when the path ends in /search', () => {
    expect(classifySearchEndpoint('https://gateway.internal/v1/search')).toBe('moonshot-search')
    expect(classifySearchEndpoint('https://gateway.internal/v1/search/')).toBe('moonshot-search')
  })

  it('keeps an /anthropic path on Messages even on a Moonshot host', () => {
    expect(classifySearchEndpoint('https://api.moonshot.cn/anthropic/v1')).toBe('deepseek-messages')
  })

  it('defaults unparseable and unrelated URLs to Messages search', () => {
    expect(classifySearchEndpoint('not a url')).toBe('deepseek-messages')
    expect(classifySearchEndpoint('https://api.deepseek.com/anthropic/v1/')).toBe('deepseek-messages')
    expect(classifySearchEndpoint('https://example.test/v1')).toBe('deepseek-messages')
  })
})
