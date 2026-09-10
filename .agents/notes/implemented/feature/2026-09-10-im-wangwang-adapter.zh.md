# Agent Note: 用于账号接管的旺旺/千牛 IM 适配器

Status: implemented

[English](2026-09-10-im-wangwang-adapter.md) | 中文

## 问题

DeepSeek Harness 工作区智能体接管旺旺/千牛账号（#618，隶属于 #613；构建于 #615 IM 配置与 #616 投递/历史之上）需要一个专用适配器对接旺旺 OpenAPI，同时解耦业务逻辑并保护凭据安全：

1. 平台缺乏 `whoami` 接口，运行时猜测或 UI 手动输入商户 ID 是危险的。
2. AccessKey 与 SecretKey 必须严格通过 `CredentialRef` 接入 `CredentialProvider` 凭据隔离层，不得泄漏至配置、日志或实例状态。
3. 消息轮询必须在宿主重启后不重复读取历史，遵守整页原子投递后才推进游标，并在并发拉取下保持正确。
4. 出站发送必须区分前置校验失败（账号暂停、路由未配置或禁用）与歧义响应（网络失败或 5xx 造成的 `result_unknown`），且严禁对未知结果盲目重试。
5. 入站发送者类型必须依据可核验的本地证据划分为 `external`、`human_native`、`human_dsh`、`ai_outbound` 与 `unknown`，绝不采信上游自证——否则智能体会将己方出站回显重新摄入并形成循环。

## 决策

交付 `@deepseek-ai/dsh-im-wangwang`（`packages/im/im-wangwang`）：

- **准入商户目录**：预配置的 `admittedMerchants` 列表将 `merchantId` 映射至 Harness `accountId` 及 `CredentialRef`；拒绝动态探测。
- **按请求解析凭据**：AccessKey/SecretKey 在每次调用时经 `ctx.credentials.resolve(ref)` 解析；OpenAPI 客户端按请求接收凭据，不持有凭据状态。
- **原生 HMAC-SHA256 签名**：`node:crypto` 对方法、路径、规范排序查询参数与毫秒时间戳在 `x-api-*` 头下签名。
- **持久游标与串行拉取**：通道游标保存在适配器自有的 `im_wangwang` 存储域（`channel_cursors` 表）中，可在重启后恢复；按商家的互斥锁串行化 `pullAndDeliver`，游标读取 → 拉取 → 推进周期绝不交错；页面先持久化至 `ImDeliveryService` 再推进游标；倒退抛出 `CHANNEL_CURSOR_REGRESSION`。
- **出站证据核验的发送者判定**：每笔以 `sent` 结算的发送写入持久 `sent_echoes` 记录（merchantId::messageId → requestId + intent）。入站 senderType 2/3 声明依据该证据分类：仅在匹配到已结算回显时为 `human_dsh` / `ai_outbound`，未核验或矛盾的声明降级为 `unknown`。回显索引放在适配器侧，因为 `ImDeliveryService` 没有按外部 messageId 反查出站记录的接口，且其接口归属 #616。
- **结构化歧义**：网络失败与 408/429/5xx 抛出 `WangwangAmbiguousError`（携带 `httpStatus`/`rawDetails`）；适配器将其结算为 `result_unknown`，其余失败结算为 `confirmed_failed`。
- **单一前置校验归属**：账号暂停与路由检查由 `ImDeliveryService.registerOutbound` 负责；适配器映射其 `pre_send_failed` 记录，不重复校验。

## 已考虑的替代方案

- **采信上游 senderType/producerId 声明**——否决：自证会让己方发送的回显以客户或 AI 消息身份重新进入智能体循环。
- **内存游标 Map**——否决：宿主重启会重放或跳过历史；持久域表是唯一能抗重启的归属。
- **适配器侧重复前置校验**——否决：同一校验两个归属必然漂移；投递服务已持久化失败原因。
- **在普通 Error 上 `Reflect.set(err, 'isAmbiguous')`**——否决：类型系统不可见的隐形标记；专用错误类才承载歧义契约。
- **为 `ImDeliveryService` 增加按外部 messageId 反查出站的接口**——在本 PR 范围内否决：投递接口归属 #616，且适配器是旺旺出站唯一生产者，其自有持久回显索引即为充分证据。

## 后果

适配器拥有一个存储域（`im_wangwang`，版本 1）与两张表；记录在持久边界处经受校验。测试一律通过公共 cordis 插件生命周期（`ctx.plugin`）启动服务，测试 fetch 经子类构造器接缝绑定——受保护的生命周期符号从不被直接调用。该包已接入 Host tsconfig 项目图，并在单元门禁下保持 100% 语句/分支覆盖。消息持久化与游标推进之间的崩溃重放会重新拉取页面，并由投递域按 `externalMessageId` 去重。
