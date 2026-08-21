# language: zh-CN
@local-companion @companion
功能: Desktop 权威的 Session 与提示
  作为已配对且 Remote Online 的 Mobile
  我希望新建 Session 并发送提示后只展示 Desktop 确认或投影的内容
  以便列表与对话不出现手机本地臆造的行

  背景:
    假如 Desktop 与 Mobile 已配对且 Remote Online
    而且 Desktop 通过 Host Session 确认 create-session、open-session、submit-prompt、cancel-prompt、query-operation-status

  @live
  场景: 新建 Ungrouped Session 仅在 Desktop 确认后出现
    当 Mobile 点击新建 Ungrouped Session
    那么 在 Desktop 确认 create-session 之前列表不增加行
    而且 确认后列表出现标题为 Ungrouped Session 的行
    而且 该行带有空的对话 blocks，作曲器可见

  @live
  场景: 在已有 Workspace 中新建 Session
    假如 浏览列表可以填写 Workspace 名称
    当 Mobile 输入 Docs 并点击在新 Workspace 新建 Session
    那么 create-session 携带非空 workspace
    而且 Desktop 确认后该行出现在 Docs 分组下
    而且 之后可以点击在 Docs 新建 Session

  @live
  场景: 发送文字提示并收到 Desktop 投影
    假如 已打开一个 Desktop 确认的 Ungrouped Session
    当 Mobile 提交提示 "hello from Android via real Platform relay"
    那么 对话出现用户原文
    而且 对话随后出现 Host Session 的助手原文
    而且 该投影来自 Relay 转发的 Encrypted Companion transcript-page
    # 注意: 配对通道仍是开发无密钥 cipher；投影内容来自 Paired Desktop Host Session

  @live
  场景: 流式输出期间取消提示
    假如 Desktop 正在该 Session 上 streaming
    当 Mobile 点击取消
    那么 Mobile 发送 cancel-prompt
    而且 Desktop 确认后投影 cancelled 并停止流式
    而且 取消按钮仅在 streaming 为真时可见

  @live
  场景: 搜索聊天记录走 Desktop Host
    假如 Desktop Host 已有标题或摘要含 "hello" 的 Session
    当 Mobile 在搜索框输入 hello
    那么 Mobile 发送 search-sessions
    而且 列表只展示 Desktop 确认的 session-search 命中
    而且 命中行展示 Host snippet 或摘要
    而且 打开命中后对话来自 open-session 的 Host history

  @live
  场景: 离线时拒绝发送提示
    假如 Desktop Remote Offline
    当 Mobile 打开已缓存的 Session
    那么 作曲器显示 Remote Offline 拒绝发送
    而且 不发送 mutation
    而且 列表与对话不增加未确认行
