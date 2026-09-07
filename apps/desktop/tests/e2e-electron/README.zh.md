# 预构建隐藏手机验收

[English](README.md) | 中文

仅测试的[运行器](../../scripts/run-hidden-phone-acceptance.mjs)只有在根会话已审核完整输入图、检出干净且与已发布 SHA 一致，并且所有权清单在启动器 spawn 时不足 60 秒的情况下才会启动。构建产物缺失、组件文件不完整、hash 或 realpath 变化、凭据 fallback 文件，以及陈旧或格式错误的清单都会在 WDIO 启动前拒绝执行。

## 可运行检查

```sh
export PATH=/Users/yishu.cy/.nvm/versions/node/v24.16.0/bin:/usr/bin:/bin
node --test --test-concurrency=1 apps/desktop/tests/e2e-electron/hidden-acceptance-*.test.mjs
```

这些 Node 测试只检查合成 fixture 和运行器策略，不会启动 Electron，也不能证明 Desktop 路线。

## 完成与恢复

启动器 owner 在就绪前记录直接创建的 WDIO 子进程，并独立于继承管道的 `close` 观察其 `exit`。只有校验器找到唯一就绪 Host、该 Host 的 `requestedStop=stop` 精确退出、唯一一条 `shutdown complete` 收据、零模型请求、未变化的输入 hash，并确认 Host、fake 和 CDP 监听器均已关闭时，零退出才会通过。随后运行器删除其精确私有 scratch；证据保留在 `.artifacts` 下。

超时和中断恢复只能向已捕获的 WDIO 子进程发送 TERM。恢复、非零或带 signal 的退出、缺失 shutdown 证据、输入变化或仍存活的监听器都会失败并保留 scratch。PID 发现、命令子串、父级 lineage、进程组成员关系、端口和 fixture observer 端点均不授予 signal 权限。

## 已审核输入图

manifest 命名规范 approved roots，以及每个已消费文件的解析路径和 SHA-256。Host、Client、Web、Desktop、Electron、WDIO 与 Node 组件均命名非空文件列表和一个 entry；组件 identity 是该列表的 digest，而非未经检查的 label。Host、Client 与 Web entry 分别绑定已消费的 `apps/cli/src/bin.ts`、`packages/client/web/lib/index.js` 与 `apps/web/dist/index.html` 文件。输入图必须包含实际 Node、WDIO 和 Electron 可执行文件，Desktop main/config/helper 输出，源码 Host 启动器输入，验收 wrapper/owner/config/helpers/spec，以及完整的 build-owner Host/Client/Web 闭包。operated Platform 源和已生成配置必须包含相等的 JSON 值。运行器在 spawn 前一刻与 graceful exit 后重新检查输入图。

子进程环境是一个显式 keyless allowlist，包含全新空的 `HOME`、`DSH_HOME` 与 `TMPDIR`、固定 fake mobilecli、拒绝工具的 PATH 前缀和拒绝请求的 loopback 模型 provider。不复制用户设置或凭据。checkout 和 scratch 中的 `.env` 或 `.credentials.yaml` fallback 仅通过路径元数据拒绝，不读取其内容。

## 范围

该路线打开实际构建的 Desktop Session Surface，选择 fixture 分类的 iPhone，等待实际非均匀 H264 canvas 像素，观察已解码的 MJPEG fallback，刷新进入新的 waiting owner，重新绘制，并请求 `app.quit()`。生产 phone runtime 拥有并等待 fake mobilecli 子进程；[hidden-phone-fake-owner.mjs](../../scripts/hidden-phone-fake-owner.mjs)仍是独立的直接子进程 fixture 测试，不接入此路线。

此场景证明使用确定性 fixture 设备字节的已构建 Desktop 用户路线。它不证明物理设备行为、陈旧 decoder 拒绝、失败的 MJPEG、模型 `device_act`、原生 Host-SIGKILL 包含性，或同用户文件系统和网络隔离。源码树不存储完整的 build-owner manifest；在根会话为精确最终 revision 提供并审核一个 manifest 前，启动仍会被拒绝。
