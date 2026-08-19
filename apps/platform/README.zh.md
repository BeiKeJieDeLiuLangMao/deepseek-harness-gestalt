# `@deepseek-ai/dsh-platform`

[English](README.md) | 中文

Platform 监听进程以容器发布。GitHub Actions 负责构建和推送镜像，ECS 拉取运行。密钥在部署时从 GitHub Environment `production` 注入，不会写入镜像层。

在所需部署密钥齐备后，`GET /healthz` 与 `GET /readyz` 返回 `{ ok: true }`。缺失密钥会在监听前失败退出。本镜像尚未挂载 Account HTTP 与 Remote Relay 的 Cordis 组合。

```sh
docker build -f apps/platform/Dockerfile -t dsh-platform .
```

## 已知限制与暂缓事项

- 镜像尚未启动 Account 或 Remote Access 的 Cordis 树，只验证发布与运行路径。
- Redis 应使用 TLS（`PLATFORM_REDIS_TLS=1`）。当前 RDS 实例仍未开启 PostgreSQL SSL。
