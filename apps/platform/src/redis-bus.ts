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
      const sessionId = message as unknown as AccountSessionId
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

/** Connection fields for one Redis client. */
export interface RedisConnectOptions {
  /** Redis hostname. */
  host: string
  /** Redis ACL username, when present. */
  username?: string
  /** Redis password. */
  password: string
  /** Redis TCP port. */
  port: number
  /** Whether to use TLS. */
  tls: boolean
}

/** Connected Redis client plus the listener-safe process resource owner. */
export interface RedisConnection {
  /** Client used by Platform adapters while the owner is open. */
  readonly client: RedisClientType
  /** Quit the client and detach its process error listener exactly once. */
  close(): Promise<void>
}

/**
 * Open a Redis command client without putting the password in a URL.
 * @param options - host, credentials, and TLS.
 * @returns connected client and its quiescent close owner.
 */
export async function connectRedis(options: RedisConnectOptions): Promise<RedisConnection> {
  const client = createClient({
    ...(options.username === undefined ? {} : { username: options.username }),
    password: options.password,
    socket: {
      host: options.host,
      port: options.port,
      ...(options.tls ? { tls: true, rejectUnauthorized: true } : {}),
    },
  }) as RedisClientType
  const handleError = (): void => {
    console.error('platform: Redis client reported an error')
  }
  client.on('error', handleError)
  try {
    await client.connect()
  } catch (error) {
    let cleanupError: unknown
    try {
      client.destroy()
    } catch (failure) {
      cleanupError = failure
    } finally {
      client.removeListener('error', handleError)
    }
    if (cleanupError !== undefined) {
      throw new AggregateError([error, cleanupError], 'Redis connection and cleanup failed')
    }
    throw error
  }
  let closed = false
  return {
    client,
    async close(): Promise<void> {
      if (closed) return
      closed = true
      try {
        await client.quit()
      } catch (error) {
        client.destroy()
        throw error
      } finally {
        client.removeListener('error', handleError)
      }
    },
  }
}
