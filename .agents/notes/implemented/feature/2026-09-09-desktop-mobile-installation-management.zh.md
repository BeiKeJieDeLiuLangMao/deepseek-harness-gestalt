# Agent Note: Desktop 管理 Mobile 登录安装

Status: implemented

[English](2026-09-09-desktop-mobile-installation-management.md) | 中文

## Problem

验收运行或设备丢失留下活跃 Account Session 后，Platform Account 可能用完 Mobile installation 配额。当前安装退出登录无法撤销另一个安装；Personal Pairing 撤销移除的是独立的 Desktop 访问权威，也不会释放 Account installation 名额。[Issue #644](https://github.com/gestaltrun/deepseek-harness-gestalt/issues/644)负责区分这两类权威，并提供 Desktop 恢复路线。

该操作必须与账号删除、refresh 轮换和已经授权但尚未完成轮询的登录保持一致。只撤销事务前读到的 Session，可能使其中一个并发操作在 Desktop 报告成功后恢复目标访问。

## Decision

现有 Platform Account 模块提供两个仅供 Desktop 使用的操作。`listMobileInstallations` 验证调用方 Desktop Account Session，并返回同一 Account 拥有的活跃 Mobile 安装。`revokeMobileInstallation` 验证调用方 Desktop，将一次性 installation proof 绑定到目标 Installation id，然后把原子比较与修改交给 Account backend。事务同时提交每个被撤销的 Session 和对应的持久失效记录。Service 分别尝试全部发布，只确认总线已经接受的投递。

视图携带 opaque Installation id，供后续已认证 mutation 使用，但展示代码不得渲染该值，也不得把它当作用户引用。界面展示经过认证的设备名称、平台和 Installation-id SHA-256 摘要的前十二个十六进制字符。展示字段引入前创建的持久 Session 仍会以明确的不可用标签列出，并且可以移除。短引用只是稳定的展示数据。列表不从 Session 行推测创建时间、最近活动时间、在线状态或 IP 地址。

只有活跃 Desktop Installation 可以调用这两个操作。Backend 事务先按 id 顺序锁定目标 Installation 已经授权的 login attempt，再锁定 Account 行、调用方 Session 和目标 Session 行。它会拒绝发生变化的调用方、正在删除的 Account、不属于调用方 Account 的目标，以及既没有活跃 Mobile Session 也没有待投递失效记录的目标。该顺序遵循 login 的 Attempt、Account、Session 顺序，同时保留账号删除的 Account 先于 Session 顺序。Refresh 要么在目标 Session 撤销前提交，要么在撤销后看到非活跃 Session。

事务把全部匹配的活跃目标 Session 标记为非活跃，移除 refresh authority，并把同一 provider identity 下目标 Installation 已经授权的 login attempt 标记为已使用。失效记录不使用 Account 或 Session 外键，因此账号删除不会移除尚未投递的工作。每个 Platform Account composition 都要提供 `sessionInvalidationRetryIntervalMs`；独立恢复定时器只列出当前 identity namespace 的记录，在进程重启后重复执行幂等失效投递，并且只在总线接受该 Session id 后删除记录。Attempt 扫描后才完成授权的目标登录属于后续用户动作，可以完成。撤销后新发起的登录也可以建立 Session，因此移除是远程退出登录，不是永久禁止该 Installation。尚无 provider identity 的 pending attempt 无法归属某个 Account，不属于该操作。

Desktop Settings 保留现有 Mobile pairing 路由。在已登录 Account 卡片下展示**已登录的移动端安装**，包含加载、空、错误和就绪状态；每次进入该区域都会刷新列表。每一行显示设备名称、平台、稳定引用和**移除**。二次确认明确说明：移除会让该 Mobile 退出登录并结束其 Platform Account 访问；Personal Pairing、项目和本地文件保留；以后仍可重新登录。现有控制项放在独立的**个人配对**标题下，其撤销操作保留当前权威和文案。

## Alternatives considered

**把 Personal Pairing 撤销当作 Account Session 移除。** 否决，因为 pairing 和 Account Session 是独立授权，也可以彼此不存在而单独存在。

**删除事务前读取的一个 Session。** 否决，因为替换登录和 refresh 可以与过期读取竞态，而且历史数据即使违反当前唯一索引，也可能包含多个活跃行。

**持久化 Installation 黑名单。** 否决，因为远程退出登录必须允许用户以后主动重新登录。取消事务前已经授权的 attempt 可以关闭现有竞态，不需要创建持久拒绝状态。

**展示时间或在线状态。** 否决，因为 Account Session 存储不拥有可靠的 installation 创建时间、最近活动时间或连接存在信息。

## Verification

- Memory 与 PostgreSQL 测试固定配额释放、调用方与目标权限、已授权登录与 refresh 竞态、旧展示、持久失效投递、账号删除后留存和后续登录。
- HTTP、client、Desktop bridge 与 renderer 测试固定请求、解析、重新进入时刷新、展示不可用标签和确认行为。
- Keyless Platform Account 示例通过组装后的 provider 执行 Mobile 登录、Desktop 列表、跨实例移除和后续重新登录。
- 实际 Desktop GUI 与发布验收仍是 keyless fixture 之外的产品交付证据。

## Consequences

Attempt 扫描定义操作的时间边界：扫描后才提交的授权属于后续登录，可以成功。文案不得暗示移除会封禁物理设备。持久 Session 状态仍是授权来源；保留的 outbox 与独立重试预算让发布失败或进程重启后的连接关闭仍可恢复。每个 composition 会增加一个空闲恢复定时器，并在每个配置间隔查询一次 outbox。生产清理必须使用与已批准短引用对应的完整 opaque id 精确选择三个测试行；相似设备名和通用 Android 标签不能作为操作权威。
