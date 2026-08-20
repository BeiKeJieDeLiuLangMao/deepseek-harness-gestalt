# `@deepseek-ai/dsh-platform`

English | [中文](README.zh.md)

Platform listen process packaged as a container. GitHub Actions builds the image for pull requests that touch the Platform tree and for matching master pushes. Publishing to GHCR requires an explicit Platform Image dispatch with **push**. ECS pulls a published tag. Secrets come from GitHub Environment `production` at deploy time and are never stored in image layers.

The operated listen process accepts only `PLATFORM_ENVIRONMENT=production`. Client packaging may still parse a development/production pair so a mis-selected origin fails before traffic. There is no staging selector and no second operated Platform.

`GET /` serves the DeepSeek Gestalt product homepage. `GET /healthz` and `GET /readyz` answer `{ ok: true }` after required deployment secrets are present. Missing secrets fail the process before listen. Account HTTP is mounted on `/v1/account/*` against PostgreSQL and Redis. Remote Relay composition is not mounted in this image yet.

```sh
docker build -f apps/platform/Dockerfile -t dsh-platform .
```

Publish: Actions → Platform Image → Run workflow → set **push**. Deploy: Actions → Platform Deploy; the workflow validates Environment `production` names first, and applies the image on both ECS hosts only when **deploy** is set. ECS publishes host port 80 to the container listen port 8080 so ALB HTTPS:443 can forward to VPC:80. ECS SSH and runtime secrets live in Environment `production`.

## Known Limitations and Deferred Work

- Remote Relay is not mounted in this image.
- Redis uses TLS (`PLATFORM_REDIS_TLS=1`). PostgreSQL uses `sslmode=require` when the RDS instance has SSL enabled.
