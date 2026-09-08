# Agent Note: Web 会话日志导出——宿主流式 ZIP 下载

状态：implemented

[English](2026-08-10-web-session-log-export.md) | 中文

## 问题

Trajectory 视图没有任何方式把调试工件交到人手里：原始会话日志存放在磁盘与宿主侧，客户端历史面只提供折叠后的投影（而非原始事件），而带子代理的会话横跨多个相互独立的会话日志。bug 报告需要整棵会话树的完整原始日志，并且形态要能在被转发后仍然可用。

## 决策

- **导出是宿主侧的下载面，不是 RPC**：`GET /api/session.export?sessionId=…&includeDescendants=true` 流式返回一个 ZIP 附件。每个会话文件都是通过 persistence read handle 读取完整逻辑日志后序列化得到的规范 JSONL：一行物理格式 header，其后每个已提交事件一行；根文件为 `session.jsonl`，后代文件为 `subagents/<id>/session.jsonl`。因此任意已挂载的持久化后端都会导出同一种表示，后端专用的分帧、压缩与键序不会跨越 seam。压缩在宿主侧使用 fflate 流式 `Zip`／`ZipDeflate` API 和已验证的 `compressionLevel` 0–9（默认 6），使部署可以在 CPU／延迟与归档大小之间取舍；每个条目按有界分块边产出边压缩，响应随生成分块写出，宿主从不把整个归档放进单个缓冲区（除预载的根外，最多同时持有一条后代的序列化日志）。到达 64 KiB 响应字节高水位后，生产会等待 Consumer pull 恢复容量；fflate 的同步回调最多只会在该队列界限外再增加一次有界输入 push。不写清单——每个会话文件都是有效的规范 JSONL，并通过自身 header 行自描述。
- **错误词汇是 HTTP 原生的**：无效 query → 400，服务缺失或根会话准备失败 → 500，根会话缺失 → 404，三者都在任何字节流出前判定。后代缺失或无法读取，以及附件读取失败，都会使流报错（fail-loud，绝不静默少导出）。请求中止会保持取消语义而不会改写成 500；请求取消与响应 Consumer 取消汇合到生产者 signal，该 signal 会传到血缘、持久化与附件读取，并终止活跃压缩器。Connection 先对 `/api` 应用信任围栏，再分发由 `session-log-export` 注册的精确 `GET`／`HEAD /api/session.export` 路由。
- **UI 只负责下载**：浏览器 Consumer 可以先发出不读取 body 的 `HEAD` 预检以取得准备阶段错误，再把 GET 端点交给浏览器原生下载管理器，因此 JavaScript 不会缓冲 ZIP。早先迭代发布的 `session.log` RPC 已删除——下载端点是它唯一的消费者，仓库规则是不留无当前所有者的公共接口。客户端 bundle 不包含任何归档实现。
- 当前 Header 与 `/export` Consumer 由 [session-log export 包约定](../../../../packages/session-query/session-log-export/README.zh.md)定义。

## 考虑过的替代方案

- **`session.log` 数据 RPC + 客户端打包**——先发布，后与用户共同否决：浏览器要拉取完整原始 JSON（约为最终 zip 的 10 倍）并在主线程压缩；对实际使用中 23 MB 级别的会话，宿主流式严格更优。迁移时把该 RPC 一并删除，而不是留作无消费者的公共接口。
- **用信封行把多会话编码进单一 JSONL**——与用户共同否决：把多个会话混进一个 JSONL 会失去干净的按文件边界；ZIP 让每个会话保持一个规范文件。
- **jszip**——更重（约 100 kB），依赖图还会拉入 readable-stream 的浏览器映射；fflate 专为此而生且体积小。
- **将 fflate 浏览器入口 vendoring 进仓库**——仓库的 vendoring 流程面向 cordis 级别的固定源码；resolveId 别名在保持维护中的依赖的同时无需复制代码（宿主侧 fflate 根本不需要别名）。

## 后果

- 导出保真度：读取每个实时根会话或后代前，导出器会通过权威的 `SessionStore.flush` 持久性屏障；每个导出文件都以规范 JSONL 表示该读取边界上的已提交逻辑日志。实时会话可能在自身读取后再次追加，因此归档是按会话读取边界形成的快照，而不是整棵树的原子快照。压缩包名为 `dsh-session-<sanitized-id>.zip`，归档路径在塑造条目前会先净化会话 id。
- 导出不需要 seam capability：每份日志都通过 persistence read handle 读取，并在这里序列化为规范 JSONL，因此任意已挂载的后端都以相同方式导出（[持久化导出与预发布精简](../simplification/2026-08-27-persistence-export-and-pre-release-trims.zh.md)记录了早先逐字工件 surface 的移除）。是否缺失由 `persistence.open(id, 'read')` 判定：只有 `SessionPersistenceNotFoundError` 是带类型的未找到结果，根会话会将其映射为 404；其他 open 或 read 失败均保持 fail-loud。`session-log-export` 向 Connection 注册一条精确的 Host-only Fetch 路由；流式响应没有对应的 Remote descriptor 或 JSON 信封。
- fixture 模式（无宿主）对导出应答 404，浏览器会将其报告为下载失败；navigation-panes golden 快照包含「导出」按钮。
- 暂缓：transcript.md 以及 report/feedback 打包留待后续；规范 JSONL、无清单的形态让 v2 的打包扩展保持廉价。
