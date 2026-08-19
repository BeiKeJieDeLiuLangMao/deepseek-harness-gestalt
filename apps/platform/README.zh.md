# `@deepseek-ai/dsh-platform`

[English](README.md) | 中文

Platform 监听进程以容器发布。GitHub Actions 负责构建和推送镜像，ECS 拉取运行。密钥在部署时从 GitHub Environment `production` 注入，不会写入镜像层。

`GET /` 提供打进镜像的 VitePress 文档站。在所需部署密钥齐备后，`GET /healthz` 与 `GET /readyz` 返回 `{ ok: true }`。缺失密钥会在监听前失败退出。本镜像尚未挂载 Account HTTP 与 Remote Relay 的 Cordis 组合。

```sh
docker build -f apps/platform/Dockerfile -t dsh-platform .
```

发布：Actions → Platform Image → Run workflow → 勾选 **push**。部署：Actions → Platform Deploy，填写已发布的 tag。ECS 将主机 80 映射到容器 8080，供 ALB 443 转发到 VPC 80。ECS SSH 与运行密钥放在 Environment `production`。

## 已知限制与暂缓事项

- 镜像尚未启动 Account 或 Remote Access 的 Cordis 树，只验证发布与运行路径。
- Redis 使用 TLS（`PLATFORM_REDIS_TLS=1`）。RDS 开启 SSL 后 PostgreSQL 使用 `sslmode=require`。
