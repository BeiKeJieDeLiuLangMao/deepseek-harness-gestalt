/**
 * Shared test wiring for Wangwang adapter specs: in-memory storage domain,
 * fake CredentialProvider, IM core services, and public-lifecycle adapter start.
 */

import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import {
  CredentialProvider,
  credentialRef,
  type CredentialInfo,
  type CredentialRef,
  type ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { ImConfigService } from '@deepseek-ai/dsh-im-core'
import { ImDeliveryService } from '@deepseek-ai/dsh-im-core/delivery'
import type { ImAccountId } from '@deepseek-ai/dsh-im-core/types'
import { TestMemoryStorageBackend } from '../../../im-core/tests/memory-backend.ts'
import {
  WangwangAdapterService,
  type WangwangAdapterConfig,
  type WangwangAdmittedMerchant,
  type WangwangRawEvent,
} from '../../src/index.ts'

/** In-memory CredentialProvider fake for CredentialRef resolution tests. */
export class TestCredentialProvider extends CredentialProvider {
  private readonly store = new Map<string, string>()

  setSecret(ref: CredentialRef, value: string): void {
    this.store.set(ref, value)
  }

  async resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const val = this.store.get(ref)
    if (!val) return undefined
    return { value: val, source: 'test-memory' }
  }

  async describe(ref: CredentialRef): Promise<CredentialInfo> {
    const exists = this.store.has(ref)
    return { configured: exists, ...(exists ? { source: 'test-memory' } : {}), writable: true }
  }

  async set(ref: CredentialRef, value: string): Promise<void> {
    this.store.set(ref, value)
  }

  async unset(ref: CredentialRef): Promise<void> {
    this.store.delete(ref)
  }

  async readRecord(): Promise<undefined> {
    return undefined
  }
  async describeRecord(): Promise<never> {
    throw new Error('not implemented')
  }
  async modifyRecord(): Promise<never> {
    throw new Error('not implemented')
  }
  async deleteRecord(): Promise<void> {}
  async listRecords(): Promise<[]> {
    return []
  }
}

export const testAccountId = brandString<ImAccountId>('acc-ww-test-1')
export const testMerchantId = 'merchant_travel_999'
export const accessKeyRef = credentialRef('TEST_WANGWANG_AK')
export const secretKeyRef = credentialRef('TEST_WANGWANG_SK')

export const testMerchant: WangwangAdmittedMerchant = {
  merchantId: testMerchantId,
  accountId: testAccountId,
  displayName: 'Test Travel Merchant',
  accessKeyRef,
  secretKeyRef,
  mainServiceAccountId: 'kefu_main_01',
}

export const testAdapterConfig: WangwangAdapterConfig = {
  endpoint: 'https://openapi.test.fliggy.com',
  admittedMerchants: [testMerchant],
}

export interface WangwangTestRig {
  ctx: Context
  storageBackend: TestMemoryStorageBackend
  creds: TestCredentialProvider
  imConfig: ImConfigService
  imDelivery: ImDeliveryService
}

/**
 * Assemble a full in-memory host context: storage hub + domain facility +
 * credential provider + ImConfigService + ImDeliveryService, with the test
 * account registered. Pass an existing backend to simulate a restart over
 * the same durable medium.
 */
export async function createWangwangTestRig(
  storageBackend: TestMemoryStorageBackend = new TestMemoryStorageBackend(),
): Promise<WangwangTestRig> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', storageBackend)
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)

  const creds = new TestCredentialProvider(ctx)
  creds.setSecret(accessKeyRef, 'test-access-key-xyz')
  creds.setSecret(secretKeyRef, 'test-secret-key-456')

  await ctx.plugin(ImConfigService)
  await ctx.plugin(ImDeliveryService)

  await ctx.imConfig.upsertAccount({
    id: testAccountId,
    platform: 'wangwang',
    displayName: 'Test Travel Merchant',
    status: 'connected',
    paused: false,
  })

  return { ctx, storageBackend, creds, imConfig: ctx.imConfig, imDelivery: ctx.imDelivery }
}

/**
 * Start the adapter through the public cordis plugin lifecycle (`ctx.plugin`),
 * which is what runs `[Service.init]` in production. A test fetch is bound via
 * a subclass through the constructor seam so no protected member is touched.
 */
export async function startWangwangAdapter(
  ctx: Context,
  config: WangwangAdapterConfig = testAdapterConfig,
  testFetch?: typeof fetch,
): Promise<WangwangAdapterService> {
  if (testFetch === undefined) {
    await ctx.plugin(WangwangAdapterService, config)
  } else {
    class TestFetchWangwangAdapter extends WangwangAdapterService {
      constructor(subCtx: Context, subConfig: WangwangAdapterConfig) {
        super(subCtx, subConfig, testFetch)
      }
    }
    await ctx.plugin(TestFetchWangwangAdapter, config)
  }
  return ctx.imWangwang
}

/** Build a raw Wangwang event fixture with sane defaults. */
export function wangwangEvent(
  overrides: Partial<WangwangRawEvent> & { messageId: string },
): WangwangRawEvent {
  return {
    eventId: `evt-${overrides.messageId}`,
    merchantId: testMerchantId,
    senderType: 1,
    customerId: 'cust-1',
    conversationId: 'conv-1',
    msgType: 1,
    textContent: 'fixture text',
    msgTime: 1726000001000,
    raw: {},
    ...overrides,
  }
}

/** Offline fetch fixture answering a successful events-pull page. */
export function pullPageFetch(page: {
  events: readonly unknown[]
  nextSinceId: number
  hasMore?: boolean
}): typeof fetch {
  return async (): Promise<Response> => new Response(JSON.stringify({
    code: 0,
    data: {
      events: page.events,
      nextSinceId: page.nextSinceId,
      hasMore: page.hasMore ?? false,
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

/** Offline fetch fixture answering a successful send with the given messageId. */
export function sendReceiptFetch(messageId: string, extra?: Record<string, unknown>): typeof fetch {
  return async (): Promise<Response> => new Response(JSON.stringify({
    code: 0,
    data: { messageId, ...extra },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
