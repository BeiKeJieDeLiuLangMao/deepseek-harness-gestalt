/** Redis Pub/Sub invalidation bus shared by both Platform Instances. */

import { createClient, type RedisClientType } from 'redis'
import type { AccountSessionId } from '@deepseek-ai/dsh-platform-account'
import type { AccountInvalidationBus } from '@deepseek-ai/dsh-platform-account-core'

const CHANNEL = 'gestalt:account:invalidate'

/** Cross-instance session invalidation over Redis Pub/Sub. */
export class RedisAccountInvalidationBus implements AccountInvalidationBus {
  private readonly listeners = new Set<(sessionId: AccountSessionId) => void | Promise<void>>()

  /**
   * @param publisher - connected Redis client used to publish.
   * @param subscriber - dedicated subscribed Redis client.
   */
  constructor(
    private readonly publisher: RedisClientType,
    private readonly subscriber: RedisClientType,
  ) {}

  /** Subscribe the dedicated client to the invalidation channel. */
  async listen(): Promise<void> {
    await this.subscriber.subscribe(CHANNEL, (message) => {
      const sessionId = message as AccountSessionId
      for (const listener of this.listeners) {
        void Promise.resolve(listener(sessionId)).catch(() => {
          /* a late subscriber error must not drop later listeners */
        })
      }
    })
  }

  async publish(sessionId: AccountSessionId): Promise<void> {
    await this.publisher.publish(CHANNEL, sessionId)
    const errors: Error[] = []
    for (const listener of this.listeners) {
      try {
        await listener(sessionId)
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)))
      }
    }
    if (errors[0] !== undefined) throw errors[0]
  }

  subscribe(listener: (sessionId: AccountSessionId) => void | Promise<void>): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

/**
 * Open a Redis command client with TLS when requested.
 * @param url - redis:// or rediss:// URL.
 */
export async function connectRedis(url: string): Promise<RedisClientType> {
  const client = createClient({
    url,
    socket: url.startsWith('rediss://') ? { tls: true, rejectUnauthorized: false } : {},
  }) as RedisClientType
  await client.connect()
  return client
}
