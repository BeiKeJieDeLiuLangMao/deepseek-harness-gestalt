import type {} from '@deepseek-ai/dsh-member-question-receiver/types'

/** Remote Events consumed by Session Controller Client. */
type SessionControllerConsumedRemoteEvent =
  | 'api-session/activity'
  | 'api-session/added'
  | 'api-session/error'
  | 'api-session/removed'
  | 'api-session/status'
  | 'member-question-receiver/changed'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteEventSelection extends
    Record<SessionControllerConsumedRemoteEvent, true> {}
}

export {}
