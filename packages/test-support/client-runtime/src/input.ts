/** Production-shaped Client input fixtures with fail-loud action defaults. */
import type {
  InputActions, InputState,
} from '@deepseek-ai/dsh-client-ui-conversation/client'

function unstubbed(name: keyof InputActions): never {
  throw new Error(`test input action "${name}" is not stubbed`)
}

/**
 * Create one complete quiescent input snapshot.
 * @param overrides - state fields needed by the scenario.
 * @returns a fresh production-shaped input value.
 */
export function inputState(overrides: Partial<InputState> = {}): InputState {
  return {
    draft: '',
    imageIds: [],
    draftRev: 0,
    phase: 'plain',
    occurrences: [],
    queue: [],
    annotations: [],
    ...overrides,
  }
}

/**
 * Create the complete public input action face.
 * Unspecified actions fail at the call site so a test cannot exercise behavior
 * it did not declare.
 * @param overrides - action implementations used by the scenario.
 * @returns a production-shaped input action face.
 */
export function inputActions(overrides: Partial<InputActions> = {}): InputActions {
  return {
    setDraft: () => unstubbed('setDraft'),
    addImages: () => unstubbed('addImages'),
    removeImage: () => unstubbed('removeImage'),
    pruneImages: () => unstubbed('pruneImages'),
    submit: () => unstubbed('submit'),
    addTextAnnotation: () => unstubbed('addTextAnnotation'),
    updateTextAnnotation: () => unstubbed('updateTextAnnotation'),
    removeTextAnnotation: () => unstubbed('removeTextAnnotation'),
    discardTextAnnotations: () => unstubbed('discardTextAnnotations'),
    addImagePin: () => unstubbed('addImagePin'),
    updateImagePin: () => unstubbed('updateImagePin'),
    ...overrides,
  }
}
