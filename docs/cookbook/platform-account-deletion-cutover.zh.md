# 在 Platform 启用可恢复的账号删除

[English](platform-account-deletion-cutover.md) | 中文

本流程将双实例生产部署从主机本地成员文件切换到统一的 PostgreSQL 权威存储。执行前需要已获批准的 Platform 候选版本、各实例私有成员卷的访问权限、私有备份目录，以及停止全部成员写入者的权限。[Platform 部署](../../apps/platform/README.zh.md)负责镜像晋级；[删除决策](../../.agents/notes/implemented/feature/2026-09-09-mobile-account-deletion.zh.md)负责账号和清理语义。这些命令不构成生产切换或删除普通用户账号的授权。

普通 Platform Deploy 在启动任何候选实例前检查所有前任实例，并拒绝 file 与 PostgreSQL 成员关系权威之间的切换。独立的 `membership_cutover` 模式在相同发布候选和生产授权检查下执行首次启用。操作方须安排维护窗口，提前准备专用测试账号登录，并阻止外部写入方及并发手动部署。维护窗口会中断 Platform 登录、配对、Relay 和云端成员关系访问。

后续普通部署前，将 Environment `production` 中的 `PLATFORM_MEMBERSHIP_BACKEND=postgres`、`PLATFORM_ACCOUNT_DELETION_RETRY_INTERVAL_MS` 和 `PLATFORM_ACCOUNT_DELETION_RECEIPT_LIFETIME_MS` 配置为与已启用运行配置一致。两个预算必须为正的安全整数。未设置 backend 变量时选择 `file`；设置变量不授权或执行迁移。

每次首次导入及重试都会重新核验两台已隔离主机的实时源；只保留快照不能证明当前源一致。维护 CLI 使用绑定事务的容器名、命令摘要和精确容器 id。客户端失败或中断会触发有界 kill、wait、退出检查和移除；未能证明的 daemon 状态仍保持未完成。维护预算的最后六十秒预留给清理。PostgreSQL 成员关系迁移和导入会在每条 SQL（包括提交）前应用剩余语句与锁等待期限；回滚和 daemon 清理不依赖已经耗尽的操作预算。

每个云助手动作采用现有超时（300 秒，暂存为 1800 秒）与事务剩余时间中的较小值，并把该动作的绝对截止时间传给主机。CLI 与 PostgreSQL 工作在该截止时间前六十秒结束；清理使用独立的五十五秒上限，保留五秒报告退出结果。更早的外部 SIGKILL 仍可能阻止确认清理：此时保留的 CLI 身份与 importing 阶段会阻止后续操作，直到同一事务证明该容器已经停止。

## 执行有界维护事务

1. 准备已合并的正常候选、编号计划和不可变镜像。通过 [Platform Deploy 输入](../../apps/platform/README.zh.md)提供已批准首份源摘要、相同的前驱镜像与版本，以及维护预算。选择 `membership_cutover=true`、`deploy=true` 和 `publish_release=false`；bootstrap 与普通 recovery 不兼容。控制器在停止写入方前拒绝超出凭据或签名 URL 剩余寿命的预算。
2. 控制器暂存校验后的字节，不启动服务或替换采集器；它绑定两个原容器、禁用自动重启并等待正常退出。两台隔离成功后才捕获。首份源必须匹配批准摘要，第二份卷必须仍为空。源变化、未知卷使用者、附件元数据、OSS 对象或生命周期变化会保留未完成事务，不导入或删除数据。
3. 通过现有 CLI 单次写入批准源。第二台主机的只读检查在候选启动前核对独立源标记和当前 text 字节。这次数据库写入与读取是迁移证据，不能代替专用账号的产品验收。
4. 两个 loopback 候选和两个服务实例都必须返回严格匹配 PostgreSQL 成员关系、账号删除、OSS 和预期实例 id 的就绪状态，公网就绪也必须观察到两台。控制器归档稳定记录，保留原卷、快照和已停止的前驱容器，不发布 Release。
5. 在记录的截止时间内以相同批准输入重跑，可恢复失败阶段。候选、源、主机代际、配置变化或截止时间过期都会拒绝自动继续。未完成的成员关系记录阻止普通部署与恢复。应检查记录及主机私有备份，绝不删除记录绕过停止。PostgreSQL 一旦可能启动，就应继续使用 PostgreSQL，或执行下文当前导出回滚，不得使用原快照。GUI 登录、删除和 GIF 录制在启用后进行，不占用维护窗口等待用户。

## 准备不可变的源证据

1. 清点所有提供服务的 Platform 实例，以及能够写入成员状态的候选和回滚容器。取得最终快照前停止全部写入者。将各实例的 `<storagePath>/production/project-membership.json` 复制到独立私有证据目录，保留原卷。文件缺失不能证明账号数据为空。
2. 对各文件运行候选版本打包的工具。`capture` 验证完整成员文档，在新建的 `0700` 目录中创建 `0600` 备份，回读验证字节，只输出 SHA-256，不覆盖已有备份。只有操作者已确认每个实例均无成员记录时，才可使用 `--empty` 代替 `--source`。

```sh
node apps/platform/dist/membership-cutover-cli.mjs capture --source /private/instance-1/project-membership.json --output /private/cutover/instance-1.json
node apps/platform/dist/membership-cutover-cli.mjs capture --source /private/instance-2/project-membership.json --output /private/cutover/instance-2.json
```

3. 比较完整文档与摘要。不同文档必须经过审阅后协调，保留每个有效项目、成员、邀请、所有者，以及唯一远程地址和名称绑定；不能任取一台主机或直接拼接记录。独立记录批准文档的完整摘要，不将它与后续 PostgreSQL 当前内容混为一谈。
4. 验证附件权威阶段为 `bridge` 或 `oss`；账号删除拒绝旧版传输阶段。使用部署指定的区域和 endpoint，以只读 OSS `GetBucketLifecycle`、`ListObjectsV2` 操作读取线上生命周期规则及恰好位于 `PLATFORM_OSS_OBJECT_PREFIX` 下的对象清单。将保留对象与元数据或按配对持久化的清理记录对应。预检不得执行强制设置生命周期的 CLI，也不得删除对象。配置了一天过期规则，不等于证明对象实际删除或存在最长完成时间。记录已验证的服务商生命周期时间语义，以及未匹配对象消失的证据。旧对象若已丢失账号归属，则归属或最晚删除时间在独立证明前仍属未知；该不确定性会阻止更强的账号删除隐私承诺，以及依赖该承诺的正式发布。

## 导入并启用

1. 保持所有文件写入者停止。在批准候选的运行环境中，使用正常 PostgreSQL/TLS 配置及选定身份命名空间执行下列命令。`--writers-fenced` 表示操作者已确认停止写入；工具无法远程证明所有进程都已停止。

```sh
node apps/platform/dist/membership-cutover-cli.mjs import --source /private/cutover/approved.json --sha256 FULL_APPROVED_SHA256 --writers-fenced
```

目标必须尚未初始化。文档与独立、不可变的源摘要标记在同一命名空间锁下提交。即使后续成员内容已变化，重复导入同一批准摘要仍为空操作，其他摘要会被拒绝。启动过程不会导入文件或覆盖 PostgreSQL。

2. 在每个服务实例设置 `PLATFORM_MEMBERSHIP_BACKEND=postgres`，并明确提供正安全整数 `PLATFORM_ACCOUNT_DELETION_RETRY_INTERVAL_MS` 与 `PLATFORM_ACCOUNT_DELETION_RECEIPT_LIFETIME_MS`。前者控制后台重试，后者约束已完成恢复凭据的查询期限，不是法定保留期限。保留源备份，只启动使用统一权威存储的候选。
3. 分别直连各实例并经过正常负载均衡器检查。单独验证不可变镜像候选；`/readyz` 必须返回每个预期 `instanceId`，以及 `membershipStorage: "postgres"`、`accountDeletion: true` 及选定附件存储。开放流量前验证跨两个实例的共享读写。Mobile 确认/取消、接任成员、中断删除、恢复及完成流程只能使用专门的测试账号、项目和附件，不能删除操作者的正常账号。

## 回滚且不恢复已删除的引用

导出前停止所有 PostgreSQL 成员写入者，包括后台删除 worker。存在未完成账号删除时，工具拒绝回滚导出；应先在统一权威存储下完成删除。PostgreSQL 写入前的旧文件不能用作回滚源。

```sh
node apps/platform/dist/membership-cutover-cli.mjs export --output /private/rollback/current.json --writers-fenced
```

验证导出摘要与完整文档，将完全相同的字节安装到每个已停止的文件实例，验证各副本，统一切换全部实例后再恢复流量。不能将同时运行的文件写入者当作安全的水平扩容；文件存储仍受单写入者限制。无法证明全部写入者已停止、源一致、导出当前、附件归属或生命周期证据时，应保留候选和备份，报告具体阻塞步骤。
