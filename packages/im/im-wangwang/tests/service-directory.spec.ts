/**
 * Admitted merchant directory, credential seam isolation, and lifecycle guard tests.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ImAccountId } from '@deepseek-ai/dsh-im-core/types'
import { WangwangAdapterService } from '../src/index.ts'
import {
  TestCredentialProvider,
  accessKeyRef,
  createWangwangTestRig,
  secretKeyRef,
  startWangwangAdapter,
  testAccountId,
  testAdapterConfig,
  testMerchantId,
  type WangwangTestRig,
} from './fixtures/testkit.ts'

describe('WangwangAdapterService - Admitted Merchant Directory & Credential Isolation', () => {
  let rig: WangwangTestRig | undefined

  afterEach(async () => {
    await rig?.ctx.fiber.dispose()
    rig = undefined
  })

  it('resolves admitted merchant and refuses unadmitted merchant with no guessing', async () => {
    rig = await createWangwangTestRig()
    const adapter = await startWangwangAdapter(rig.ctx)

    const merchant = adapter.getAdmittedMerchant(testMerchantId)
    expect(merchant.accountId).toBe(testAccountId)
    expect(adapter.getAdmittedMerchantByAccount(testAccountId).merchantId).toBe(testMerchantId)

    expect(() => {
      adapter.getAdmittedMerchant('random_unadmitted_merchant')
    }).toThrow(/WANGWANG_MERCHANT_NOT_ADMITTED/)

    expect(() => {
      adapter.getAdmittedMerchantByAccount(brandString<ImAccountId>('acc-unknown'))
    }).toThrow(/WANGWANG_ACCOUNT_NOT_ADMITTED/)
  })

  it('resolves secrets on demand through CredentialProvider and never exposes them', async () => {
    rig = await createWangwangTestRig()
    const adapter = await startWangwangAdapter(rig.ctx)

    const descAK = await rig.creds.describe(accessKeyRef)
    expect(descAK.configured).toBe(true)

    const resolved = await adapter.resolveCredentials(adapter.getAdmittedMerchant(testMerchantId))
    expect(resolved.accessKey).toBe('test-access-key-xyz')

    // Missing secretKey fails loud with the reference name, never the value
    await rig.creds.unset(secretKeyRef)
    await expect(adapter.resolveCredentials(adapter.getAdmittedMerchant(testMerchantId))).rejects.toThrow(
      /WANGWANG_CREDENTIAL_MISSING: secretKey for ref "TEST_WANGWANG_SK"/,
    )

    // Missing accessKey likewise
    await rig.creds.set(secretKeyRef, 'test-secret-key-456')
    await rig.creds.unset(accessKeyRef)
    await expect(adapter.resolveCredentials(adapter.getAdmittedMerchant(testMerchantId))).rejects.toThrow(
      /WANGWANG_CREDENTIAL_MISSING: accessKey for ref "TEST_WANGWANG_AK"/,
    )
  })

  it('fails loud when CredentialProvider is absent from the context', async () => {
    const bareCtx = new Context()
    const adapter = new WangwangAdapterService(bareCtx, testAdapterConfig)
    await expect(
      adapter.resolveCredentials(adapter.getAdmittedMerchant(testMerchantId)),
    ).rejects.toThrow(/CredentialProvider not available in context/)
    await bareCtx.fiber.dispose()
  })

  it('fails loud when durable domain accessors are used before initialization', async () => {
    const bareCtx = new Context()
    new TestCredentialProvider(bareCtx)
    const uninitialized = new WangwangAdapterService(bareCtx, testAdapterConfig)
    expect(() => uninitialized.getDurableCursor(testMerchantId)).toThrow(
      /has not initialized storageDomain/,
    )
    await bareCtx.fiber.dispose()
  })
})
