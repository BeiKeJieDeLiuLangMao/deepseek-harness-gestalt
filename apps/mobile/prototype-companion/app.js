// PROTOTYPE — three high-fidelity Desktop/Mobile interaction directions.

const variants = [
  { key: 'A', name: 'Continuity' },
  { key: 'B', name: 'Inbox' },
  { key: 'C', name: 'Timeline' },
];

const scenarios = [
  { key: 'pairing', label: '配对', step: '01' },
  { key: 'live', label: '进行中的 Session', step: '02' },
  { key: 'approval', label: '等待审批', step: '03' },
  { key: 'offline', label: '离线与恢复', step: '04' },
];

const state = {
  variant: getVariant(),
  viewport: 'together',
  scenario: 'live',
  pairingStep: 0,
  mobileScreen: 'session',
  approval: 'pending',
  offline: false,
  recovered: false,
  composer: '',
  sentPrompt: '',
  running: true,
  inspectorOpen: false,
};

function getVariant() {
  const candidate = new URLSearchParams(window.location.search).get('variant')?.toUpperCase();
  return variants.some((variant) => variant.key === candidate) ? candidate : 'A';
}

function icon(name, size = 18) {
  const paths = {
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    desktop: '<rect width="18" height="13" x="3" y="4" rx="2"/><path d="M8 21h8m-4-4v4"/>',
    mobile: '<rect width="12" height="20" x="6" y="2" rx="2"/><path d="M11 18h2"/>',
    together: '<rect width="14" height="10" x="2" y="4" rx="1.5"/><path d="M6 18h6m-3-4v4"/><rect width="7" height="12" x="15" y="9" rx="1.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.57 15 1.7 1.7 0 0 0 3 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.57 1.7 1.7 0 0 0 10 3V3h4v.08A1.7 1.7 0 0 0 15.06 4.6a1.7 1.7 0 0 0 1.88-.34L17 4.2 19.8 7l-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 21 10h.08v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    folder: '<path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2h7.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z"/>',
    message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>',
    paperclip: '<path d="m20.5 11.5-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7l-9.6 9.6a2 2 0 1 1-2.8-2.8l8.9-8.9"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zm4 4h3v3h-3zm-4 3h2m5-7v2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/>',
    code: '<path d="m8 9-4 3 4 3m8-6 4 3-4 3m-2-9-4 12"/>',
    spark: '<path d="m12 3-1.5 4.5L6 9l4.5 1.5L12 15l1.5-4.5L18 9l-4.5-1.5Z"/><path d="m5 16-.7 2.3L2 19l2.3.7L5 22l.7-2.3L8 19l-2.3-.7Z"/>',
    wifiOff: '<path d="m2 2 20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 3-2.2m3.7-1.7A10 10 0 0 1 19 13M2 8.8A15 15 0 0 1 5.3 7m3-1.2A15 15 0 0 1 22 8.8M12 20h.01"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7L20 14"/><path d="M20 7v4h-4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    arrowUp: '<path d="m18 15-6-6-6 6"/>',
    home: '<path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    inbox: '<path d="M4 4h16l2 11h-5l-2 3H9l-2-3H2Z"/><path d="M4 4v11"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ''}</svg>`;
}

function statusPill(kind, label) {
  return `<span class="status-pill ${kind}"><i></i>${label}</span>`;
}

function appMark(suffix = 'GESTALT') {
  return `<div class="brand"><span class="brand-mark">deepseek</span><span class="brand-suffix">${suffix}</span></div>`;
}

function mockQr() {
  const cells = [
    1,1,1,1,1,0,1,0,1,1,1,1,1, 1,0,0,0,1,0,0,1,1,0,0,0,1, 1,0,1,0,1,1,1,0,1,0,1,0,1,
    1,0,0,0,1,0,1,1,1,0,0,0,1, 1,1,1,1,1,0,1,0,1,1,1,1,1, 0,0,0,0,0,0,0,1,0,0,0,0,0,
    1,0,1,1,1,0,1,0,1,1,0,1,1, 0,1,0,1,0,1,1,1,0,0,1,0,0, 1,1,1,0,1,0,1,0,1,1,1,1,0,
    1,0,0,1,0,1,0,1,1,0,0,1,1, 1,1,1,1,1,0,1,1,0,1,0,0,1, 1,0,0,0,1,0,0,1,1,0,1,1,0,
    1,0,1,0,1,1,1,0,1,1,0,1,1,
  ];
  return `<div class="qr-grid">${cells.map((cell) => `<i class="${cell ? 'on' : ''}"></i>`).join('')}</div>`;
}

function desktopShell(content, rail = '') {
  return `<section class="desktop-frame device-frame">
    <div class="traffic-lights"><i></i><i></i><i></i></div>
    <div class="desktop-app">
      <aside class="desktop-sidebar">
        <div class="sidebar-drag"></div>
        <div class="sidebar-brand-row">${appMark()}<button class="icon-button">${icon('plus', 17)}</button></div>
        <button class="search-box">${icon('search', 15)}<span>搜索 Sessions</span><kbd>⌘ K</kbd></button>
        <div class="workspace-label"><span>WORKSPACES</span><button>${icon('plus', 13)}</button></div>
        <div class="workspace-row active"><span class="workspace-glyph">M</span><span>Mobile Companion</span>${icon('chevronRight', 13)}</div>
        <div class="session-row selected"><i class="session-dot running"></i><span>移动端互通方案</span></div>
        <div class="session-row"><i class="session-dot"></i><span>Desktop updater review</span></div>
        <div class="workspace-row"><span class="workspace-glyph lavender">D</span><span>deepseek-harness</span>${icon('chevronRight', 13)}</div>
        <div class="session-row"><i class="session-dot"></i><span>Plugin registry cleanup</span></div>
        <div class="sidebar-spacer"></div>
        <div class="identity-row"><span class="avatar">Y</span><div><strong>yishu.cy</strong><small>GitHub account</small></div><button>${icon('settings', 17)}</button></div>
      </aside>
      <main class="desktop-main">${content}</main>
      ${rail}
    </div>
  </section>`;
}

function sessionHeader(extra = '') {
  const connected = state.scenario !== 'offline' || state.recovered;
  return `<header class="session-header">
    <div><div class="crumb">Mobile Companion <span>/</span></div><h2>移动端互通方案</h2></div>
    <div class="header-actions">${statusPill(connected ? 'online' : 'offline', connected ? 'Remote Online' : 'Remote Offline')}${extra}<button class="icon-button">${icon('more')}</button></div>
  </header>`;
}

function transcript({ compact = false, timeline = false } = {}) {
  const approvalMessage = state.approval === 'approved' ? '已允许本次操作' : state.approval === 'denied' ? '已拒绝操作' : '等待你的审批';
  return `<div class="transcript ${compact ? 'compact' : ''} ${timeline ? 'timeline-transcript' : ''}">
    <div class="turn user-turn">
      <div class="turn-meta"><span class="source-badge mobile-source">${icon('mobile', 12)} iPhone 15 Pro</span><time>14:28</time></div>
      <div class="user-bubble">检查 Platform 多实例部署方案，并指出当前文档里还缺少的失败路径。</div>
    </div>
    <div class="turn assistant-turn">
      <div class="assistant-mark">${icon('spark', 15)}</div>
      <div class="assistant-content">
        <p>我会先核对 Platform 与 Mobile Companion 的上下文，再检查多实例连接、撤销传播和依赖失效路径。</p>
        <div class="tool-card"><div class="tool-title">${icon('search', 15)} Read <code>apps/platform/CONTEXT.md</code><span>完成</span></div><div class="tool-detail">读取 86 行 · 14:28:07</div></div>
        <div class="tool-card ${state.scenario === 'approval' && state.approval === 'pending' ? 'needs-approval' : ''}"><div class="tool-title">${icon('terminal', 15)} Bash <code>pnpm run verify-md-links</code><span>${state.scenario === 'approval' ? approvalMessage : '完成'}</span></div><div class="code-line"><b>$</b> pnpm run verify-md-links</div></div>
        ${state.scenario === 'approval' && state.approval === 'pending' ? `<div class="inline-approval"><div><strong>需要你的批准</strong><span>运行只读文档链接检查</span></div><button data-action="deny">拒绝</button><button class="primary" data-action="approve">允许本次</button></div>` : ''}
        ${state.scenario !== 'approval' || state.approval !== 'pending' ? `<p>目前还缺少两个用户可见的恢复路径：Redis 不确定时的主动断开提示，以及操作结果未知后的明确查询状态。建议把它们加入首期验收。</p>` : ''}
      </div>
    </div>
    ${state.sentPrompt ? `<div class="turn user-turn new-turn"><div class="turn-meta"><span class="source-badge mobile-source">${icon('mobile', 12)} iPhone 15 Pro</span><time>刚刚</time></div><div class="user-bubble">${escapeHtml(state.sentPrompt)}</div></div>` : ''}
  </div>`;
}

function composer(label = '向 DeepSeek Gestalt 发送消息') {
  const disabled = state.scenario === 'offline' && !state.recovered;
  return `<div class="composer-wrap ${disabled ? 'disabled' : ''}">
    ${disabled ? `<div class="offline-notice">${icon('wifiOff', 15)} Desktop 离线时不能提交操作。已确认的内容仍可查看。</div>` : ''}
    <div class="composer"><textarea data-role="composer" placeholder="${label}" ${disabled ? 'disabled' : ''}>${escapeHtml(state.composer)}</textarea><div class="composer-footer"><div><button>${icon('plus', 18)}</button><button>${icon('paperclip', 17)}</button><span>Standard · DeepSeek Chat</span></div><button class="send-button" data-action="send" ${disabled ? 'disabled' : ''}>${icon('arrowUp', 17)}</button></div></div>
  </div>`;
}

function continuityDesktop() {
  if (state.scenario === 'pairing') return desktopPairing('continuity');
  const rail = `<aside class="continuity-rail">
    <div class="rail-head"><div><span>REMOTE ACCESS</span><strong>Continuity</strong></div>${icon('mobile', 18)}</div>
    <div class="connection-orbit"><div class="orbit-line"></div><div class="orbit-node desktop-node">${icon('desktop', 15)}</div><div class="orbit-node mobile-node">${icon('mobile', 15)}</div></div>
    <div class="device-summary"><div class="device-icon">${icon('mobile')}</div><div><strong>iPhone 15 Pro</strong><span>${state.scenario === 'offline' && !state.recovered ? '最后连接于 14:31' : '正在查看此 Session'}</span></div></div>
    <div class="rail-section"><span class="rail-label">本次活动</span><div class="activity-item done">${icon('check', 13)}<div><strong>来自 Mobile 的提示</strong><span>14:28 · 已提交</span></div></div><div class="activity-item ${state.scenario === 'approval' ? 'active' : ''}">${icon('shield', 13)}<div><strong>工具审批</strong><span>${state.approval === 'pending' ? '等待处理' : '已处理'}</span></div></div></div>
    <button class="rail-link">管理移动访问 ${icon('chevronRight', 14)}</button>
  </aside>`;
  return desktopShell(`${sessionHeader()}<div class="conversation-canvas">${transcript()}${composer()}</div>`, rail);
}

function inboxDesktop() {
  if (state.scenario === 'pairing') return desktopPairing('inbox');
  const pending = state.scenario === 'approval' && state.approval === 'pending';
  const rail = `<aside class="inbox-rail">
    <div class="inbox-title"><div><span class="eyebrow">INTERACTION INBOX</span><h3>${pending ? '1 项需要你处理' : '没有待处理事项'}</h3></div><span class="count ${pending ? '' : 'zero'}">${pending ? 1 : 0}</span></div>
    ${pending ? `<div class="approval-card"><div class="approval-icon">${icon('shield', 19)}</div><div class="approval-copy"><span>来自 iPhone 15 Pro</span><strong>允许执行文档检查？</strong><p><code>pnpm run verify-md-links</code></p></div><div class="approval-actions"><button data-action="deny">拒绝</button><button class="primary" data-action="approve">允许本次</button></div><button class="always-action">始终允许此命令模式</button></div>` : `<div class="inbox-empty"><div>${icon('check', 24)}</div><strong>你已经处理完了</strong><span>新的审批和问题会显示在这里。</span></div>`}
    <div class="rail-section history"><span class="rail-label">今天</span><div class="history-row"><span class="history-icon">${icon('mobile', 14)}</span><div><strong>Mobile 提交了提示</strong><span>移动端互通方案 · 14:28</span></div></div><div class="history-row"><span class="history-icon">${icon('check', 14)}</span><div><strong>Session 已完成</strong><span>Desktop updater review · 13:52</span></div></div></div>
  </aside>`;
  return desktopShell(`${sessionHeader(`<button class="inbox-trigger ${pending ? 'has-count' : ''}">${icon('inbox', 17)}${pending ? '<b>1</b>' : ''}</button>`)}<div class="conversation-canvas wide">${transcript()}${composer()}</div>`, rail);
}

function timelineDesktop() {
  if (state.scenario === 'pairing') return desktopPairing('timeline');
  const main = `${sessionHeader()}<div class="timeline-layout"><section class="timeline-chat">${transcript({ timeline: true })}${composer()}</section><aside class="activity-timeline"><div class="timeline-title"><span class="eyebrow">LIVE ACTIVITY</span><strong>远程 Session 轨迹</strong></div><div class="timeline-event complete"><i></i><time>14:28:03</time><strong>Mobile 提交提示</strong><span>iPhone 15 Pro · E2EE</span></div><div class="timeline-event complete"><i></i><time>14:28:07</time><strong>读取 Platform Context</strong><span>Desktop 执行 · 86 行</span></div><div class="timeline-event ${state.scenario === 'approval' && state.approval === 'pending' ? 'current' : 'complete'}"><i></i><time>14:28:11</time><strong>${state.scenario === 'approval' && state.approval === 'pending' ? '等待你的批准' : '文档检查完成'}</strong><span>${state.scenario === 'approval' && state.approval === 'pending' ? '可在任一端处理' : '0 个失效链接'}</span>${state.scenario === 'approval' && state.approval === 'pending' ? `<div class="mini-actions"><button data-action="deny">拒绝</button><button data-action="approve">允许</button></div>` : ''}</div><div class="timeline-event future"><i></i><time>下一步</time><strong>形成检查结论</strong><span>等待前一步完成</span></div></aside></div>`;
  return desktopShell(main);
}

function desktopPairing(layout) {
  const completed = state.pairingStep >= 2;
  const content = `<div class="settings-page ${layout}">
    <header class="settings-header"><button class="back-link">${icon('chevronLeft', 16)} Settings</button><h2>Mobile Access</h2><p>在 DeepSeek Gestalt 窗口打开时，从手机访问你的 Sessions。</p></header>
    <section class="access-card">
      <div class="access-card-head"><div><strong>允许移动访问</strong><span>关闭窗口后，所有配对设备都会显示 Remote Offline。</span></div><label class="switch"><input type="checkbox" checked><span></span></label></div>
      <div class="pairing-area"><div class="pair-copy"><span class="eyebrow">PAIR A DEVICE</span><h3>${completed ? 'iPhone 15 Pro 已配对' : '用 Mobile Companion 扫描'}</h3><p>${completed ? '此设备现在可以在任意网络访问这台 Desktop。' : '二维码将在 01:42 后失效。完成扫描后，请在这里核对安全短语。'}</p>${completed ? `<div class="paired-success">${icon('check', 18)} 安全短语已确认 · amber-lake-47</div>` : `<div class="sas-preview"><span>确认安全短语</span><strong>${state.pairingStep === 1 ? 'amber-lake-47' : '扫描后显示'}</strong></div>`}<button class="primary-button" data-action="pair-next">${state.pairingStep === 0 ? '显示配对二维码' : state.pairingStep === 1 ? '确认并允许此设备' : '完成'}</button></div><div class="qr-wrap ${state.pairingStep === 0 ? 'muted' : ''}">${mockQr()}<span>${state.pairingStep === 0 ? '点击开始' : '仅可使用一次'}</span></div></div>
    </section>
    <section class="devices-card"><div class="section-title"><div><strong>已配对设备</strong><span>1 台设备</span></div><button>全部撤销</button></div><div class="device-table"><span class="device-avatar">${icon('mobile', 18)}</span><div><strong>iPhone 15 Pro</strong><span>iOS · ${completed ? '刚刚配对' : '最后连接于今天 13:52'}</span></div>${statusPill('online', completed ? 'Online' : 'Online')}<button>${icon('more', 18)}</button></div></section>
  </div>`;
  return desktopShell(content);
}

function phoneFrame(content, title = 'DeepSeek Gestalt') {
  return `<section class="phone-frame device-frame"><div class="phone-bezel"><div class="dynamic-island"></div><div class="phone-status"><span>9:41</span><div><span class="signal-bars">▮▮▮</span><span>◒</span><span class="battery">87</span></div></div><div class="phone-app">${content}</div><div class="home-indicator"></div></div><div class="phone-caption">${title}</div></section>`;
}

function mobileTopbar(title, options = {}) {
  return `<header class="mobile-topbar">${options.back ? `<button data-action="mobile-back">${icon('chevronLeft', 22)}</button>` : `<span class="mobile-logo">ds</span>`}<div><strong>${title}</strong>${options.subtitle ? `<span>${options.subtitle}</span>` : ''}</div><button>${options.actionIcon ? icon(options.actionIcon, 19) : `<span class="avatar small">Y</span>`}</button></header>`;
}

function mobileBottomNav(active) {
  return `<nav class="mobile-nav"><button class="${active === 'home' ? 'active' : ''}" data-screen="home">${icon('home', 20)}<span>主页</span></button><button class="${active === 'sessions' ? 'active' : ''}" data-screen="sessions">${icon('message', 20)}<span>Sessions</span></button><button class="${active === 'inbox' ? 'active' : ''}" data-screen="inbox">${icon('inbox', 20)}<span>待处理</span>${state.scenario === 'approval' && state.approval === 'pending' ? '<i>1</i>' : ''}</button><button>${icon('settings', 20)}<span>设置</span></button></nav>`;
}

function mobileSession(variant) {
  if (state.scenario === 'pairing') return mobilePairing(variant);
  if (state.mobileScreen === 'home') return mobileHome(variant);
  if (state.mobileScreen === 'inbox') return mobileInbox(variant);
  const connected = state.scenario !== 'offline' || state.recovered;
  const status = connected ? 'Remote Online · MacBook Pro' : 'Remote Offline · 已显示缓存';
  return phoneFrame(`<div class="mobile-session ${variant.toLowerCase()}">${mobileTopbar('移动端互通方案', { back: true, subtitle: status, actionIcon: 'more' })}<div class="mobile-connection-line ${connected ? 'online' : 'offline'}"><i></i><span>${connected ? '端到端加密连接' : 'Desktop 窗口已关闭'}</span></div><div class="mobile-transcript">${mobileTranscript(variant)}</div>${mobileComposer(connected)}</div>`);
}

function mobileTranscript(variant) {
  const pending = state.scenario === 'approval' && state.approval === 'pending';
  return `<div class="m-message m-user"><div class="m-meta"><span>你 · iPhone</span><time>14:28</time></div><div>检查 Platform 多实例部署方案，并指出当前文档里还缺少的失败路径。</div></div><div class="m-message m-assistant"><div class="m-assistant-mark">${icon('spark', 13)}</div><p>我会先核对 Platform 与 Mobile Companion 的上下文，再检查多实例连接、撤销传播和依赖失效路径。</p><div class="m-tool"><div>${icon('search', 13)}<strong>读取 Platform Context</strong><span>完成</span></div><small>86 行 · Desktop 执行</small></div><div class="m-tool ${pending ? 'pending' : ''}"><div>${icon('terminal', 13)}<strong>运行文档检查</strong><span>${pending ? '需要批准' : '完成'}</span></div><code>pnpm run verify-md-links</code></div>${pending ? mobileApprovalCard(variant) : `<p>目前还缺少 Redis 不确定时的主动断开提示，以及操作结果未知后的明确查询状态。</p>`}</div>${state.sentPrompt ? `<div class="m-message m-user new-turn"><div class="m-meta"><span>你 · iPhone</span><time>刚刚</time></div><div>${escapeHtml(state.sentPrompt)}</div></div>` : ''}`;
}

function mobileApprovalCard(variant) {
  return `<div class="m-approval ${variant.toLowerCase()}"><div class="m-approval-head"><span>${icon('shield', 18)}</span><div><strong>允许执行文档检查？</strong><small>由 MacBook Pro 执行</small></div></div><code>pnpm run verify-md-links</code><p>此命令只读取仓库中的 Markdown 文件。</p><div class="m-approval-actions"><button data-action="deny">拒绝</button><button class="primary" data-action="approve">允许本次</button></div><button class="persistent-choice">始终允许此命令模式</button></div>`;
}

function mobileComposer(connected) {
  return `<div class="mobile-composer-wrap">${!connected ? `<div class="m-offline-banner">${icon('wifiOff', 14)} Desktop 离线，不能提交操作 <button data-action="recover">模拟重连</button></div>` : ''}<div class="mobile-composer ${!connected ? 'disabled' : ''}"><textarea data-role="composer" placeholder="发送消息" ${!connected ? 'disabled' : ''}>${escapeHtml(state.composer)}</textarea><div><button>${icon('plus', 19)}</button><button data-action="send" class="m-send" ${!connected ? 'disabled' : ''}>${icon('arrowUp', 17)}</button></div></div></div>`;
}

function mobileHome(variant) {
  const pending = state.scenario === 'approval' && state.approval === 'pending';
  const inboxFirst = variant === 'B';
  return phoneFrame(`<div class="mobile-home ${variant.toLowerCase()}">${mobileTopbar('DeepSeek Gestalt', { subtitle: 'Mobile Companion' })}<div class="mobile-home-scroll"><section class="desktop-selector"><div class="selector-top"><span class="desktop-avatar">${icon('desktop', 18)}</span><div><strong>MacBook Pro</strong><span>${state.scenario === 'offline' && !state.recovered ? 'Remote Offline' : 'Remote Online · 当前 Desktop'}</span></div>${icon('chevronRight', 16)}</div><div class="continuity-track"><i></i><span></span><i></i></div></section>${inboxFirst ? mobileNeedsYou(pending) : ''}<section class="home-section"><div class="home-section-title"><strong>继续工作</strong><button data-screen="sessions">查看全部</button></div><button class="recent-session" data-screen="session"><span class="session-state"></span><div><strong>移动端互通方案</strong><p>目前还缺少 Redis 不确定时的主动断开提示…</p><small>Mobile Companion · 刚刚</small></div>${icon('chevronRight', 16)}</button><button class="recent-session"><span class="session-state quiet"></span><div><strong>Desktop updater review</strong><p>打包验证已经通过，未创建 Release。</p><small>Ungrouped · 36 分钟前</small></div>${icon('chevronRight', 16)}</button></section>${!inboxFirst ? mobileNeedsYou(pending) : ''}</div>${mobileBottomNav('home')}</div>`);
}

function mobileNeedsYou(pending) {
  return `<section class="home-section needs-section"><div class="home-section-title"><strong>需要你处理</strong><span>${pending ? '1' : '0'}</span></div>${pending ? `<button class="needs-card" data-screen="inbox"><span>${icon('shield', 18)}</span><div><strong>允许执行文档检查？</strong><p>移动端互通方案 · 刚刚</p></div>${icon('chevronRight', 16)}</button>` : `<div class="all-clear"><span>${icon('check', 16)}</span>没有待处理的审批或问题</div>`}</section>`;
}

function mobileInbox(variant) {
  const pending = state.scenario === 'approval' && state.approval === 'pending';
  return phoneFrame(`<div class="mobile-inbox-screen ${variant.toLowerCase()}">${mobileTopbar('待处理', { subtitle: pending ? '1 项需要你处理' : '所有事项已处理' })}<div class="mobile-inbox-scroll">${pending ? `<div class="inbox-context"><span>移动端互通方案</span><small>MacBook Pro · 刚刚</small></div>${mobileApprovalCard(variant)}` : `<div class="mobile-all-clear"><span>${icon('check', 28)}</span><strong>没有待处理事项</strong><p>新的审批和问题会显示在这里。</p></div>`}<div class="inbox-history-title">最近处理</div><div class="inbox-history-row"><span>${icon('check', 15)}</span><div><strong>已回答 Agent 的问题</strong><small>Platform 环境 · 今天 13:46</small></div></div></div>${mobileBottomNav('inbox')}</div>`);
}

function mobilePairing(variant) {
  const step = state.pairingStep;
  const body = step === 0 ? `<div class="pair-hero"><div class="scan-window">${icon('qr', 54)}<span>将二维码放入框内</span></div><h2>连接到你的 Desktop</h2><p>在 DeepSeek Gestalt 的 Mobile Access 设置中显示配对二维码。</p><button class="mobile-primary" data-action="pair-next">扫描演示二维码</button><span class="privacy-note">配对前，Desktop 与 Mobile 必须登录同一个 GitHub 账号。</span></div>` : step === 1 ? `<div class="pair-confirm"><span class="pair-device-icon">${icon('desktop', 27)}</span><span class="eyebrow">CONFIRM THIS DESKTOP</span><h2>MacBook Pro</h2><p>确认两台设备显示完全相同的安全短语。</p><div class="sas-words"><span>amber</span><span>lake</span><span>47</span></div><div class="security-note">${icon('shield', 17)} 平台无法读取你的 Session 内容</div><button class="mobile-primary" data-action="pair-next">短语一致，继续</button><button class="text-button" data-action="pair-reset">取消</button></div>` : `<div class="pair-complete"><span class="complete-orbit">${icon('check', 31)}</span><h2>已经连接</h2><p>只要 DeepSeek Gestalt 窗口保持打开，你就可以从任意网络继续工作。</p><div class="paired-desktop-card"><span>${icon('desktop', 21)}</span><div><strong>MacBook Pro</strong><small>Remote Online</small></div>${statusPill('online', 'Online')}</div><button class="mobile-primary" data-action="open-session">打开 Mobile Companion</button></div>`;
  return phoneFrame(`<div class="mobile-pairing ${variant.toLowerCase()}">${mobileTopbar('配对 Desktop', { back: step > 0, actionIcon: 'more' })}${body}</div>`, 'Pairing flow');
}

function renderDevice() {
  const desktop = state.variant === 'A' ? continuityDesktop() : state.variant === 'B' ? inboxDesktop() : timelineDesktop();
  const mobile = mobileSession(state.variant);
  if (state.viewport === 'desktop') return `<div class="single-device desktop-only">${desktop}</div>`;
  if (state.viewport === 'mobile') return `<div class="single-device mobile-only">${mobile}</div>`;
  return `<div class="device-stage together-stage"><div class="continuity-beam"><i></i><span>${state.scenario === 'offline' && !state.recovered ? 'REMOTE OFFLINE' : 'E2EE · LIVE'}</span><i></i></div>${desktop}${mobile}</div>`;
}

function render() {
  const variant = variants.find((item) => item.key === state.variant);
  document.body.dataset.variant = state.variant;
  document.querySelector('#app').innerHTML = `<div class="prototype-shell">
    <header class="prototype-header"><div class="prototype-title"><span>PROTOTYPE · THROWAWAY</span><strong>Mobile Companion</strong><p>${variant.key} — ${variant.name}</p></div><div class="header-controls"><div class="view-toggle" role="group" aria-label="设备视图"><button data-viewport="desktop" class="${state.viewport === 'desktop' ? 'active' : ''}">${icon('desktop', 16)}Desktop</button><button data-viewport="together" class="${state.viewport === 'together' ? 'active' : ''}">${icon('together', 16)}同步视图</button><button data-viewport="mobile" class="${state.viewport === 'mobile' ? 'active' : ''}">${icon('mobile', 16)}Mobile</button></div><button class="state-toggle ${state.inspectorOpen ? 'active' : ''}" data-action="toggle-inspector">${icon('code', 16)} Flow state</button></div></header>
    <nav class="scenario-nav">${scenarios.map((scenario) => `<button data-scenario="${scenario.key}" class="${state.scenario === scenario.key ? 'active' : ''}"><span>${scenario.step}</span><strong>${scenario.label}</strong></button>`).join('')}</nav>
    <main class="prototype-canvas">${renderDevice()}${state.inspectorOpen ? stateInspector() : ''}</main>
    ${prototypeSwitcher(variant)}
  </div>`;
  bindEvents();
}

function stateInspector() {
  const snapshot = {
    variant: state.variant,
    viewport: state.viewport,
    scenario: state.scenario,
    desktopAuthority: true,
    remoteOnline: state.scenario !== 'offline' || state.recovered,
    pairingStep: state.pairingStep,
    mobileScreen: state.mobileScreen,
    approval: state.approval,
    operationReceipt: state.scenario === 'offline' && !state.recovered ? 'not-submitted' : null,
    sentPrompt: state.sentPrompt || null,
  };
  return `<aside class="state-inspector"><div><span>FLOW STATE</span><button data-action="toggle-inspector">${icon('x', 16)}</button></div><pre>${escapeHtml(JSON.stringify(snapshot, null, 2))}</pre></aside>`;
}

function prototypeSwitcher(current) {
  return `<div class="prototype-switcher"><button data-action="previous-variant" aria-label="上一方案">${icon('chevronLeft', 19)}</button><div><span>DESIGN DIRECTION</span><strong>${current.key} — ${current.name}</strong></div><button data-action="next-variant" aria-label="下一方案">${icon('chevronRight', 19)}</button></div>`;
}

function bindEvents() {
  document.querySelectorAll('[data-viewport]').forEach((button) => button.addEventListener('click', () => { state.viewport = button.dataset.viewport; render(); }));
  document.querySelectorAll('[data-scenario]').forEach((button) => button.addEventListener('click', () => {
    state.scenario = button.dataset.scenario;
    state.approval = 'pending';
    state.recovered = false;
    state.pairingStep = 0;
    state.mobileScreen = state.scenario === 'approval' && state.variant === 'B' ? 'inbox' : 'session';
    render();
  }));
  document.querySelectorAll('[data-screen]').forEach((button) => button.addEventListener('click', () => { state.mobileScreen = button.dataset.screen; render(); }));
  document.querySelectorAll('[data-role="composer"]').forEach((textarea) => {
    textarea.addEventListener('input', () => { state.composer = textarea.value; document.querySelectorAll('[data-role="composer"]').forEach((peer) => { if (peer !== textarea) peer.value = textarea.value; }); });
  });
  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => handleAction(button.dataset.action)));
}

function handleAction(action) {
  if (action === 'approve') state.approval = 'approved';
  if (action === 'deny') state.approval = 'denied';
  if (action === 'send' && state.composer.trim()) { state.sentPrompt = state.composer.trim(); state.composer = ''; state.running = true; }
  if (action === 'pair-next') state.pairingStep = Math.min(2, state.pairingStep + 1);
  if (action === 'pair-reset') state.pairingStep = 0;
  if (action === 'open-session') { state.scenario = 'live'; state.mobileScreen = 'home'; }
  if (action === 'mobile-back') state.mobileScreen = state.scenario === 'approval' && state.variant === 'B' ? 'inbox' : 'home';
  if (action === 'recover') state.recovered = true;
  if (action === 'toggle-inspector') state.inspectorOpen = !state.inspectorOpen;
  if (action === 'previous-variant') changeVariant(-1);
  if (action === 'next-variant') changeVariant(1);
  render();
}

function changeVariant(offset) {
  const current = variants.findIndex((variant) => variant.key === state.variant);
  state.variant = variants[(current + offset + variants.length) % variants.length].key;
  const url = new URL(window.location.href);
  url.searchParams.set('variant', state.variant);
  window.history.replaceState({}, '', url);
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

window.addEventListener('keydown', (event) => {
  const tag = document.activeElement?.tagName;
  if (['INPUT', 'TEXTAREA'].includes(tag) || document.activeElement?.isContentEditable) return;
  if (event.key === 'ArrowLeft') { changeVariant(-1); render(); }
  if (event.key === 'ArrowRight') { changeVariant(1); render(); }
});

window.addEventListener('popstate', () => { state.variant = getVariant(); render(); });

render();
