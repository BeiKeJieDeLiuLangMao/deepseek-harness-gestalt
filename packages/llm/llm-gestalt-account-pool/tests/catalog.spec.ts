import { describe, expect, it } from 'vitest'
import { mergeAccountPoolCatalogs, parseAccountPoolCatalog, toPiAiModels } from '../src/catalog.ts'

describe('account-pool catalog projection', () => {
  it('keeps names, context, output caps, modalities, and think levels', () => {
    const models = parseAccountPoolCatalog({
      data: [
        {
          id: 'grok-4',
          display_name: 'Grok 4',
          context_window: 256000,
          max_output_tokens: 64000,
          input_modalities: ['text', 'image', 'audio'],
          supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }, { effort: 'none' }],
          default_reasoning_level: 'high',
        },
        {
          id: 'plain',
          name: 'Plain',
          context_length: 128000,
          max_tokens: 8192,
          reasoning: false,
        },
        { id: '' },
        null,
        3,
      ],
    })
    expect(models).toEqual([
      {
        id: 'grok-4',
        name: 'Grok 4',
        contextWindow: 256000,
        maxTokens: 64000,
        input: ['text', 'image'],
        reasoningEfforts: { low: 'low', high: 'high', off: null },
        defaultReasoningLevel: 'high',
      },
      {
        id: 'plain',
        name: 'Plain',
        contextWindow: 128000,
        maxTokens: 8192,
        reasoningEfforts: false,
      },
    ])
    expect(toPiAiModels(models)[0]).toMatchObject({
      id: 'grok-4',
      name: 'Grok 4',
      contextWindow: 256000,
      reasoningEfforts: { low: 'low', high: 'high', off: null },
      defaultReasoningLevel: 'high',
    })
  })

  it('maps string reasoning efforts and drops unknown names', () => {
    const models = parseAccountPoolCatalog({
      data: [{
        id: 'codex',
        reasoning_efforts: ['none', 'medium', 'ultra', { value: 'xhigh' }],
        default_reasoning_level: 'none',
      }],
    })
    expect(models).toEqual([{
      id: 'codex',
      reasoningEfforts: { off: null, medium: 'medium', xhigh: 'xhigh' },
      defaultReasoningLevel: 'off',
    }])
  })

  it('treats off-only listings as non-reasoning models', () => {
    expect(parseAccountPoolCatalog({
      data: [{ id: 'plain', supported_reasoning_levels: [{ effort: 'none' }] }],
    })).toEqual([{ id: 'plain', reasoningEfforts: false }])
    expect(toPiAiModels([{ id: 'plain', reasoningEfforts: false }])).toEqual([
      { id: 'plain', reasoningEfforts: false },
    ])
  })

  it('omits empty modalities and an unknown default think level', () => {
    expect(parseAccountPoolCatalog({
      data: [{
        id: 'text-only',
        input_modalities: ['audio'],
        supported_reasoning_levels: ['high'],
        default_reasoning_level: 'mystery',
      }],
    })).toEqual([{
      id: 'text-only',
      reasoningEfforts: { high: 'high' },
    }])
  })

  it('rejects a listing without a data array', () => {
    expect(() => parseAccountPoolCatalog({})).toThrow(/invalid/)
  })

  it('reads a Codex-client listing by slug and unions missing ids onto the Grok Shell catalog', () => {
    const unified = parseAccountPoolCatalog({
      data: [{ id: 'grok-4', name: 'Grok 4', context_window: 256000 }],
    })
    const codex = parseAccountPoolCatalog({
      models: [{
        slug: 'gpt-5.4',
        display_name: 'GPT 5.4',
        max_context_length: 272000,
        max_completion_tokens: 128000,
      }],
    })
    expect(mergeAccountPoolCatalogs(unified, codex)).toEqual([
      { id: 'grok-4', name: 'Grok 4', contextWindow: 256000 },
      { id: 'gpt-5.4', name: 'GPT 5.4', contextWindow: 272000, maxTokens: 128000 },
    ])
  })
})
