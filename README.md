# DeepSeek Gestalt

English | [中文](README.zh.md)

DeepSeek Gestalt is the desktop and phone product on [DeepSeek Harness](https://www.deepseek.com/harness/) (`dsh`). Start a session on the computer, then continue the same session on a paired phone.

The site is [www.gestaltrun.com](https://www.gestaltrun.com/).

DeepSeek Harness is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com). It uses an architecture where **everything is a plugin**, and is powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

## Desktop and phone

Install the DeepSeek Gestalt desktop app for the full session: write code, use tools, and replay the trail.

Pair a phone with that desktop app to continue the same session on the phone. You do not open a second session.

## Developer preview

DeepSeek Harness is currently in _developer preview_ and is iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

## Run

### Desktop

Download a desktop build from [Releases](https://github.com/BeiKeJieDeLiuLangMao/deepseek-harness-gestalt/releases).

From a repository checkout:

```sh
pnpm install
pnpm gestalt:dev
```

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI, served at `http://127.0.0.1:3080` by default. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/BeiKeJieDeLiuLangMao/deepseek-harness-gestalt.git
cd deepseek-harness-gestalt
pnpm install
pnpm run build
pnpm dsh web
```

## Community and support

- Feel free to submit feedback or bug reports through [GitHub Issues](https://github.com/BeiKeJieDeLiuLangMao/deepseek-harness-gestalt/issues).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
