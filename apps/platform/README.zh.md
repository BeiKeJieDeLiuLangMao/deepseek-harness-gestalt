# `@deepseek-ai/dsh-platform`

[English](README.md) | 中文

Platform 监听进程以容器发布。GitHub Actions 会为触及 Platform 树的拉取请求以及匹配的 master 推送构建镜像。推送到 GHCR 必须显式派发 Platform Image 并勾选 **push**。ECS 拉取已发布的 tag。密钥在部署时从 GitHub Environment `production` 注入，不会写入镜像层。

实际运行的监听进程与产品客户端只接受一套生产身份。`PLATFORM_ORIGIN`、固定回调、GitHub client id 与 credential reference、PostgreSQL database identity、identity namespace、Redis ACL identity 和 Relay Redis key prefix 都是必填项；不存在开发、staging 或默认身份。

`GET /` 提供 DeepSeek Gestalt 产品首页。在所需部署密钥齐备后，`GET /healthz` 与 `GET /readyz` 返回 `{ ok: true }`。身份、端口或 TLS 配置缺失或不一致时，会在连接 PostgreSQL 或 Redis 前失败。Account HTTP 挂在 `/v1/account/*`，持久化走 PostgreSQL 与 Redis。`OperatedRemoteAccessResources` 使用 Redis Relay coordinator 构造 PostgreSQL Personal Pairing authority 与 Relay route store，并在监听前迁移持久表。在通过已评审的 Noise handshake 之前，不挂载配对 HTTP 和 Relay WSS。

```sh
docker build -f apps/platform/Dockerfile -t dsh-platform .
```

发布：Actions → Platform Image → Run workflow → 勾选 **push**。部署：Actions → Platform Deploy；工作流先校验 Environment `production` 中的名称，仅在勾选 **deploy** 时才把镜像应用到两台 ECS。ECS 将主机 80 映射到容器 8080，供 ALB 443 转发到 VPC 80。应用步骤使用 Docker `json-file` 轮转（`20m` × `3` 个文件），容器 stdout/stderr 不会占满主机磁盘。同时运行 LoongCollector（`dsh-loongcollector`），把 `dsh-platform` 的 stdout/stderr 送到杭州 SLS 项目 `gestalt` 的 Logstore `application`。采集器以用户自定义机器组标识 `gestalt-platform` 注册，并从加固模式 ECS 元数据读取阿里云账号 ID，空则回退 `PLATFORM_SLS_ACCOUNT_ID`。在该 Logstore 的 Docker 标准输出 Logtail 配置里绑定这个机器组。ECS SSH 与运行密钥放在 Environment `production`。

## 已知限制与暂缓事项

- 本镜像不挂载配对 HTTP 和 Remote Relay WSS。
- 产品配置不能关闭 Redis 与 PostgreSQL 的证书校验。临时本地存储测试会注入名称明确的非 TLS fixture，不导入监听入口，也不构成实际运行验收。
