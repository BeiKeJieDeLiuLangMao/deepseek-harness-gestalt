import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CredentialProvider, type CredentialInfo, type CredentialRef, type ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import type WangwangAdapterService from '@deepseek-ai/dsh-im-wangwang'

export class FakeLoaderCredentialProvider extends CredentialProvider {
  private readonly store = new Map<string, string>([
    ['WANGWANG_TEST_AK', 'ak-123456'],
    ['WANGWANG_TEST_SK', 'sk-abcdef'],
  ])

  async resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const val = this.store.get(ref)
    if (!val) return undefined
    return { value: val, source: 'fake-loader' }
  }

  async describe(ref: CredentialRef): Promise<CredentialInfo> {
    const exists = this.store.has(ref)
    return { configured: exists, ...(exists ? { source: 'fake-loader' } : {}), writable: true }
  }

  async set(ref: CredentialRef, value: string): Promise<void> {
    this.store.set(ref, value)
  }
  async unset(ref: CredentialRef): Promise<void> {
    this.store.delete(ref)
  }
  async readRecord(): Promise<undefined> { return undefined }
  async describeRecord(): Promise<never> { throw new Error('not implemented') }
  async modifyRecord(): Promise<never> { throw new Error('not implemented') }
  async deleteRecord(): Promise<void> {}
  async listRecords(): Promise<[]> { return [] }
}

const configPath = process.argv[2]
if (!configPath) throw new Error('configPath required')

const ctx = new Context()
new FakeLoaderCredentialProvider(ctx)

await ctx.plugin(Loader)
ctx.loader.builtins.include = Include

await ctx.loader.create({
  name: 'cordis:include',
  config: { path: pathToFileURL(configPath).href },
})
await ctx.loader.await()

const service = ctx.get('imWangwang') as WangwangAdapterService
if (!service) throw new Error('imWangwang service not loaded by real Loader')

const merchant = service.getAdmittedMerchant('merchant_loader_01')
const reportFile = './wangwang-loader-report.json'

await writeFile(reportFile, JSON.stringify({
  success: true,
  merchantId: merchant.merchantId,
  accountId: merchant.accountId,
  displayName: merchant.displayName,
}))

await ctx.fiber.dispose()
