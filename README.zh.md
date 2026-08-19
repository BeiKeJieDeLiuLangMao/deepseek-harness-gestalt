# DeepSeek Gestalt

[English](README.md) | 中文

DeepSeek Gestalt 是建立在 [DeepSeek Harness](https://www.deepseek.com/harness/)（`dsh`）上的桌面端与手机端产品。在电脑上打开会话后，可以配对到手机上继续同一条会话。

站点：[www.gestaltrun.com](https://www.gestaltrun.com/)。

DeepSeek Harness 是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。它采用**一切皆插件**的架构，并由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper)。

## 桌面端与手机

安装 DeepSeek Gestalt 桌面端，即可使用完整会话：写代码、用工具、回放轨迹。

把手机和桌面端配对后，可以在手机上继续同一条会话，而不必另开一条。

## 开发者预览

DeepSeek Harness 目前处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

## 运行

### 桌面端

从 [Releases](https://github.com/BeiKeJieDeLiuLangMao/deepseek-harness-gestalt/releases) 下载桌面安装包。

从仓库源码启动开发界面：

```sh
pnpm install
pnpm gestalt:dev
```

### 通过 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令会启动 Web UI，默认地址为 `http://127.0.0.1:3080`。详见 [Web UI 指南](docs/user/guide/index.md)。

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/BeiKeJieDeLiuLangMao/deepseek-harness-gestalt.git
cd deepseek-harness-gestalt
pnpm install
pnpm run build
pnpm dsh web
```

## 社区与支持

- 欢迎通过 [GitHub Issues](https://github.com/BeiKeJieDeLiuLangMao/deepseek-harness-gestalt/issues) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开发

请先阅读[开发指南](docs/development.md)与[架构文档](docs/architecture.md)。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
