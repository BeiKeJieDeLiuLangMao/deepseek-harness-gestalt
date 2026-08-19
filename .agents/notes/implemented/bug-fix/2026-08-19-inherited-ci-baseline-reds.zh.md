# Agent Note: 修复基线上既有的 CI 红灯

Status: implemented

[English](2026-08-19-inherited-ci-baseline-reds.md) | 中文

## 问题

交付基线上存在三处独立的红色 lane，均非任何在途 PR 引入。第一，两条执行 coverage 清单的 lane——Linux coverage 与原生 Windows——都以默认的 depth-1 浅拉取检出，Desktop release-notes 测试因此无法通过 Git 图谱解析其锁定的 manifest 区间，在每台全新的托管 runner 上确定性失败。第二，Web 浏览器 replay 套件在几十个场景中失败：已录制的 aria 金标早于 composer 的图片接入按钮；两处 scroll-contract 流太短，在负载较高的 CI runner 到达增长断言之前就已流完；Desktop chrome 场景的 `window.dshDesktop` mock 不再覆盖 Desktop UI 插件所绑定的 preload 面；Models 设置页只列出 `configured` 的 provider 行——在 whole-section 占用判定变更之后，未配置密钥的 DeepSeek 路由连同其首启 setup 卡片一起消失。第三，四个 Desktop 测试断言了在 Windows 主机上不可能成立的 POSIX 路径与权限位写法；另有一个 subagent teardown 测试依赖 `vi.waitFor` 的一秒默认超时去等待一个异步结算告警。

## 决策

**coverage lane 拉取完整历史。** `ci.yml` 中每个运行包含 coverage 门禁的聚合的 lane 都以 `fetch-depth: 0` 检出；并新增一个 workflow 契约测试，按 run 命令枚举这些 lane 并拒绝浅检出，使新增的 coverage lane 无法再次引入该失败。release-notes CLI 保持离线：验证仍然只读本地 Git 图谱。

**fixture 跟随产品；行为缺陷则修复。** composer 的图片接入按钮是已发布的产品界面，因此通过受认可的 refresh 模式重新录制金标，并逐行审阅 diff。两条未设闸门的 scroll-contract 流从 120/240 个 paced chunk 增至 960 个，使流的持续时间超过最慢的 CI 交互间隙，而不再依赖时序运气。Desktop chrome 的 mock 现在实现完整的 `DesktopBridge` preload 面，account 与 pairing 均返回惰性的 `unavailable` 快照。Models 设置页再次列出所有已挂载的 whole-section provider——首启形态下渲染为打开的 setup 卡片，其余情况渲染为普通行——因为 `configured` 现在的含义是用户层占用该 section，而这在首启卡片必须渲染时恰好为 false。

**Desktop 测试断言平台语义。** 图标与运行时路径的期望改为按主机平台拼接路径，并在 Windows 上期望 `node.exe`；copy-tree 测试比较解析后的链接指向，而非某一平台的 `readlink` 写法；owner-only 权限位只在暴露 POSIX mode 语义的平台上断言。teardown 失败的观察窗口放宽到其同类断言已在使用的十秒。

## 验证

该 workflow 契约测试对旧的浅检出 workflow 失败、在每个 coverage lane 都使用 `fetch-depth: 0` 后通过。四个 Desktop spec 与 continuation spec 在本地通过；仅 Windows 相关的断言交由原生 Windows lane 判定。完整 Web 浏览器 replay 套件在只读 replay 模式下全绿，包括此前失败的 scroll-contract、onboarding、Desktop chrome、minimal-preset 与 shipped-composition 场景。

## 曾考虑的替代方案

**在测试中不依赖 Git 历史解析 release-notes 区间。** 否决：CLI 的祖先检查本身就是被测的产品行为，且所验证的区间是真实的仓库历史；错误出在 lane 上，而不是断言上。

**缩减 scroll-contract 的断言，而不是加长流。** 否决：增长断言正是被测行为——读者滚动离开后流式输出仍在继续——缩短观察窗口等于描述一个更弱的约定。

**回退 Models store 中 whole-section 的占用判定变更。** 否决：`configured` 与 `removable` 的占用语义是刻意设计且有单测钉住的；缺陷在于视图层只从 `configured` 推导列表。

## 影响

基于该基线的 PR 不再继承这三处红色 lane。Models 设置页在保留 provider 行改造引入的基于占用判定的 `configured` 与 `removable` 语义的同时，让首启用户重新可达 setup 卡片。scroll contract 的流长度现在是明示的容量约定（`LIVE_STREAM_CHUNKS`），而不再是隐式的竞速。
