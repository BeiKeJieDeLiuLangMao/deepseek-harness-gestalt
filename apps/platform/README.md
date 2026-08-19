# `@deepseek-ai/dsh-platform`

English | [中文](README.zh.md)

Platform listen process packaged as a container. GitHub Actions builds and publishes the image; ECS pulls it. Secrets come from GitHub Environment `production` at deploy time and are never stored in image layers.

`GET /healthz` and `GET /readyz` answer `{ ok: true }` after required deployment secrets are present. Missing secrets fail the process before listen. Account HTTP and Remote Relay composition are not mounted in this image yet.

```sh
docker build -f apps/platform/Dockerfile -t dsh-platform .
```

Publish: Actions → Platform Image → Run workflow → set **push**. Deploy: Actions → Platform Deploy with the published tag. ECS publishes host port 80 to the container listen port 8080 so ALB HTTPS:443 can forward to VPC:80. ECS SSH and runtime secrets live in Environment `production`.

## Known Limitations and Deferred Work

- The image does not yet boot the Account or Remote Access Cordis tree; it only proves the publish-and-run path.
- Redis should use TLS (`PLATFORM_REDIS_TLS=1`). PostgreSQL SSL is still disabled on the current RDS instance.
