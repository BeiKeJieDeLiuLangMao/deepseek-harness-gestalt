import type { RedisClientType } from 'redis'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const redis = vi.hoisted(() => ({ createClient: vi.fn() }))

vi.mock('redis', () => ({ createClient: redis.createClient }))

import { connectRedis } from '../src/redis-bus.ts'

describe('operated Redis connection ownership', () => {
  beforeEach(() => {
    redis.createClient.mockReset()
  })

  it('destroys a failed connection and removes its process error listener', async () => {
    const failure = new Error('Redis connect failed')
    const client = fakeRedisClient(async () => { throw failure })
    redis.createClient.mockReturnValue(client)

    await expect(connectRedis(redisOptions())).rejects.toBe(failure)

    expect(client.on).toHaveBeenCalledWith('error', expect.any(Function))
    expect(client.destroy).toHaveBeenCalledOnce()
    expect(client.removeListener).toHaveBeenCalledWith('error', client.on.mock.calls[0]?.[1])
  })

  it('keeps the error listener through use and removes it after quiescent close', async () => {
    const client = fakeRedisClient(async () => {})
    redis.createClient.mockReturnValue(client)

    const connection = await connectRedis(redisOptions())
    expect(connection.client).toBe(client)
    expect(client.removeListener).not.toHaveBeenCalled()

    await connection.close()
    expect(client.quit).toHaveBeenCalledOnce()
    expect(client.removeListener).toHaveBeenCalledWith('error', client.on.mock.calls[0]?.[1])
  })
})

function redisOptions() {
  return { host: 'redis.fixture.example', port: 6379, username: 'fixture', password: 'secret', tls: true }
}

function fakeRedisClient(connect: () => Promise<void>) {
  const client = {
    on: vi.fn(),
    removeListener: vi.fn(),
    connect: vi.fn(connect),
    quit: vi.fn(async () => 'OK'),
    destroy: vi.fn(),
  }
  client.on.mockReturnValue(client)
  client.removeListener.mockReturnValue(client)
  return client as unknown as RedisClientType & typeof client
}
