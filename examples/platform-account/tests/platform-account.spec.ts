import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const driver = fileURLToPath(new URL('./fixtures/driver.ts', import.meta.url))
const config = fileURLToPath(new URL('../cordis.yml', import.meta.url))
const tsconfig = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))

describe('Platform Account keyless assembled lifecycle', () => {
  it('boots the Loader, logs in through two instances, and signs out this installation', async () => {
    const result = await runLoaderSmoke({
      label: 'platform-account-keyless',
      tempDirPrefix: 'platform-account-keyless-',
      binScript: driver,
      libBinScript: driver,
      configPath: config,
      tsconfigPath: tsconfig,
    })
    expect(result.stderr).toBe('')
    expect(result.stdout).toMatchInlineSnapshot(`
      "PRIVACY zh+en before authorization
      NOTICE zh=Platform 会保存 GitHub 数字 ID、公开登录名与头像，以及安装和配对元数据。原始 IP 日志最多保留 7 天，非内容安全事件最多保留 30 天；加密附件只在传输所需的短期内保留。你可以在手机账号页申请删除云端账号及关联个人资料；删除会撤销所有安装和配对，完成后清除此手机中该账号的密钥与缓存。其他设备的本地文件不会远程擦除。退出登录只撤销当前安装，不删除个人配对。
      NOTICE en=Platform stores the numeric GitHub id, public login and avatar, plus installation and pairing metadata. Raw IP logs are retained for at most 7 days, content-free security events for at most 30 days, and encrypted attachment blobs only for the short transfer lifetime. You can request deletion of the cloud account and associated personal data from the Mobile Account page. Deletion revokes all installations and pairings and clears this account’s keys and caches on the initiating Mobile after completion. Local files on other devices are not remotely erased. Signing out revokes only this installation and does not delete Personal Pairings.
      AUTHORIZE system-browser=https://github.com scope=none pkce=S256
      ACCOUNT githubId=13994321 login=octocat
      SESSION accessMinutes=15 refreshDays=30
      MOBILE_LIST count=1 name=Keyless iPhone platform=ios reference=c6c8975a27af
      MOBILE_REMOVE remaining=0 crossInstanceClosed=true
      MOBILE_RELOGIN sameInstallation=true
      SIGN_OUT crossInstanceClosed=true local=idle
      DELETE accepted=deleting
      DELETE ordinaryAuthorization=SESSION_REVOKED
      DELETE installationProofRecovery=complete
      "
    `)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
