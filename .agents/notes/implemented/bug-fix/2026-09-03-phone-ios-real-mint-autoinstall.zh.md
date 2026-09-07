# Agent Note: 在 Host mint 时确保选中 iOS 设备的 agent

Status: implemented

[English](2026-09-03-phone-ios-real-mint-autoinstall.md) | 中文

## 问题

打开在线 iOS 面板时，第一条路径是铸造 `POST /phone/session`。缺失的真机 agent 会在 GUI 恢复运行前挡住画面。模拟器 mint 则完全跳过 agent status，因此当 mobilecli 只为另一台模拟器准备了 agent 时，任意选中的模拟器仍可能拿到 session。

## 决策

Host mint 持有对清单中确切 iOS 目标的第一次可恢复安装。`POST /phone/session` 先运行 `agentStatus`；真机或模拟器 agent 缺失时调用不带 `force` 的幂等 `installAgent`，复检同一设备，并只在 status 报告已安装后签发。路由把同一个事务 abort signal 传给三次调用。模拟器安装不携带 provisioning profile；真机安装使用 `phone-runtime` 选择的 profile。仅当安装后选中设备的 agent 仍缺失时才保留 `PHONE_AGENT_MISSING`。抛出的安装失败沿用既有 Host 映射：`PHONE_AGENT_PROFILE_REQUIRED`（包括 Host 对真机未配置 `provisioningProfilePath`）、`PHONE_REAL_DEVICE_ISSUE` 分支，以及经 `PHONE_UPSTREAM` 透出的 `INSTALL_FAILED_USER_RESTRICTED`。成功的 iOS session 携带 `agentManaged: true`；`recoverAgent` 仍是 GUI 处理残留缺失、强制重装与受限失败的路径。Android mint 不运行这段 iOS ensure 序列。

## Alternatives considered

**只在 GUI 错误卡上安装。** 拒绝：打开面板总是先 mint，因此即使可恢复，用户看到的第一失败仍是 `PHONE_AGENT_MISSING`。

**mint 时总是 `force` 重装。** 拒绝：对已安装 agent，mint 必须幂等；强制重装是显式恢复动作。

**未配置 `provisioningProfilePath` 时跳过安装。** 拒绝：缺失 profile 是 `PHONE_AGENT_PROFILE_REQUIRED`，不是静默跳过。

**依赖模拟器准备流程。** 拒绝：准备流程可以持有一台配置的模拟器，而设备选择器可以按 id 选中另一台在线模拟器。

## 后果

任何受信任的 mint 调用方（不限于 GUI）都能为它选中的 iOS id 安装可恢复的缺失 agent。不可恢复失败保持结构化，不会签发会话。请求取消会中断 status 或安装，而不是等待 mobilecli child ceiling。包测试固定选中 id 的 status → 安装 → 复检 → 200、共享事务取消、安装失败错误码、两类 iOS 设备的残留 `PHONE_AGENT_MISSING`、模拟器 MJPEG，以及不运行 iOS ensure 调用的 Android 路径。
