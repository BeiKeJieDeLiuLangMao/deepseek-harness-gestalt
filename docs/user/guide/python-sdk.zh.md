# Python SDK 快速上手

[English](python-sdk.md) | 中文

本教程介绍如何安装已发布的 Python SDK、运行随附的独立最小 profile，以及如何在自己的程序中自定义同一个 `dsh` profile。

## 前置要求

- Python 3.10 或更高版本
- Git
- Linux x64、Linux arm64、macOS 14 或更高版本的 arm64，或者 Windows x64
- DeepSeek 兼容的 API 端点与凭据
- 隔离的 workspace 和隔离的 Harness home

## 安装 SDK

### Linux 和 macOS

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
python -m venv .venv
. .venv/bin/activate
python -m pip install deepseek-harness-sdk
```

### Windows PowerShell

```powershell
git clone https://github.com/deepseek-ai/deepseek-harness.git
Set-Location deepseek-harness
py -3.10 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install deepseek-harness-sdk
```

安装内容包括同版本的原生运行时 wheel 和 `dsh` 命令。SDK 的常规执行不需要系统提供 Node.js。需要构建制品的仓库贡献者应使用 [Python 贡献者工作流](../../../python/development.zh.md)。

## 运行仓库内置示例

导出凭据，并在需要时设置兼容代理端点：

### Linux 和 macOS

```sh
export DEEPSEEK_API_KEY=sk-your-key-here
# export DEEPSEEK_BASE_URL=http://127.0.0.1:8000/v1
```

### Windows PowerShell

```powershell
$env:DEEPSEEK_API_KEY = "sk-your-key-here"
# $env:DEEPSEEK_BASE_URL = "http://127.0.0.1:8000/v1"
```

使用显式的 workspace 和 home 路径运行一个任务：

### Linux 和 macOS

```sh
python python/sdk/examples/minimal.py \
  --workspace /absolute/path/to/disposable-workspace \
  --dsh-home /absolute/path/to/example-dsh-home \
  --session-id example-001 \
  "Inspect the repository and fix the failing tests."
```

### Windows PowerShell

```powershell
python python/sdk/examples/minimal.py `
  --workspace C:\work\disposable-workspace `
  --dsh-home C:\work\example-dsh-home `
  --session-id example-001 `
  "Inspect the repository and fix the failing tests."
```

脚本会打印 assistant 的最终回复。指定的 home 会收到生成的 `sdk-minimal` profile、已安装的插件，以及 `sessions/` 下未压缩的 JSONL 会话日志。示例和 SDK 都不会静默读取 `~/.dsh`。

## 在自己的程序中使用 SDK

```python
from pathlib import Path

from deepseek_harness import DeepSeekHarness

workspace = Path("/absolute/path/to/disposable-workspace").resolve()
dsh_home = Path("/absolute/path/to/example-dsh-home").resolve()
with DeepSeekHarness(
    provider="deepseek-official",
    model="deepseek-v4-flash",
    max_tokens=49_152,
    cwd=str(workspace),
    dsh_home=str(dsh_home),
    profile="sdk-minimal",
) as harness:
    result = harness.run(
        "Inspect the repository and fix the failing tests.",
        session_id="example-001",
    )

print(result.final_response)
```

SDK 会延迟启动内置的 `dsh --profile sdk-minimal` 进程，并持续复用，直至退出上下文管理器。profile、它的持久 patch、home patch 和任何有序的 `patches` 元组共同构成应用配置。不存在单独的 Python runtime bin 或完整配置选项。

## 安装或定义插件

对于需要在此 home 中持久保留的依赖和 bundle 层，请使用 `dsh plugin`：

### Linux 和 macOS

```sh
export DSH_HOME=/absolute/path/to/example-dsh-home
dsh --profile sdk-minimal --dump-default-config >/dev/null
dsh plugin --profile sdk-minimal add file:/absolute/path/to/my-plugin-bundle
```

### Windows PowerShell

```powershell
$env:DSH_HOME = "C:\work\example-dsh-home"
dsh --profile sdk-minimal --dump-default-config | Out-Null
dsh plugin --profile sdk-minimal add file:C:/work/my-plugin-bundle
```

第一条命令会初始化随附的独立 profile。第二条命令将包管理转交给 `pnpm`，随后记录所有导出 `dsh.bundle` 层的已安装包。只需为这条管理命令安装 `pnpm`；启动已安装的 SDK 不需要它。若要持久修改配置行，请编辑 `$DSH_HOME/profiles/sdk-minimal/cordis.patch.yml`；若要按每次启动修改配置，请从 Python 传入 patch 文件。

另一个 `profile` 只有在包含 `@deepseek-ai/dsh-sdk-app` 或其他 JSON-RPC server 行时才有效。server 行缺失、插件无法解析和 patch 无效都会在启动时失败，而不会回退到另一个组合。

## 了解最小 profile

| 属性 | 值 |
|---|---|
| 系统提示词 | `DSH_SYSTEM_PROMPT`；未设置时使用 `You are a helpful software engineer assistant.` |
| `minimal.py` 使用的模型 | `--model`，其次为 `DSH_MODEL`，最后为 `deepseek-v4-flash` |
| 面向模型的工具 | Linux/macOS 上为持久 `bash`，Windows 上为 `pwsh`，另有 `str_replace_editor` |
| Shell 超时 | 300 秒 |
| 编辑器输出上限 | 16,000 个字符 |
| 运行时上下文与压缩 | 不包含 |
| 会话持久化 | `<dsh_home>/sessions` 下未压缩的 JSONL |

该 profile 的唯一 bundle 会在空 root 上插入完整配置树，并且不包含 `dsh-base`；因此后续 base profile 的工具不会隐式出现。它包含 SDK 协议、一个由环境配置的 DeepSeek adapter、本地执行和持久化，但不包含设置、托管凭据、遥测、Web 工具、subagent、本地指令发现和压缩。它固定使用 `danger-full-access`，因此平台选择的持久 shell 和编辑器可以修改运行时可见的任何路径；请使用可丢弃的 checkout 或容器。

已安装的 wheel 仍会打包完整的 `web` profile 和前端资源。如果 Python SDK 部署还需要浏览器应用，请针对显式的 `DSH_HOME` 运行 `dsh web`；`web` 是独立的 CLI 应用，不能服务 Python SDK 客户端。

当 profile、插件、凭据、设置和会话必须隔离时，请使用新的 home。独立任务应使用新的 session id；只有需要延续同一段持久对话及其会话自有资源时，才复用 harness、home 和 id。

准确的配置树由 [bundle 参考](../../../packages/bundle/sdk-minimal/README.zh.md)所有，[示例参考](../../../python/sdk/examples/README.zh.md)提供可运行程序。[Python SDK 参考](../../../python/sdk/README.zh.md)介绍生命周期、结果、通知和底层行为；[dsh CLI 参考](../../../apps/cli/reference/README.zh.md)介绍 profile 分层。
