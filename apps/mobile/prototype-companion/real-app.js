// PROTOTYPE — one live Desktop host plus a mobile navigation shell that reuses DSH component styles.

import '../../../packages/client/ui-theme/src/styles/design-platform.css'
import approvalCss from '../../../packages/client/ui-conversation/src/client/skeleton/ApprovalPanel.module.css'
import inputCss from '../../../packages/client/ui-conversation/src/client/skeleton/InputBar.module.css'
import buttonCss from '../../../packages/client/ui-primitives/src/Button.module.css'

const variants = [{ key: 'A', name: 'Settings only', slot: 'settings.section' }];

const scenarios = [
  { key: 'pairing', label: '配对' },
  { key: 'live', label: '进行中的 Session' },
  { key: 'approval', label: '等待审批' },
  { key: 'offline', label: '离线与恢复' },
];

const state = {
  variant: variantFromUrl(),
  scenario: 'live',
  pairingStep: 0,
  approval: 'pending',
  recovered: false,
  inspector: false,
  mobileRoute: 'list',
  mobileSession: 'companion',
};

function variantFromUrl() {
  const value = new URLSearchParams(location.search).get('variant')?.toUpperCase();
  return variants.some((variant) => variant.key === value) ? value : 'A';
}

function icon(name, size = 18) {
  const paths = {
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    monitor: '<rect width="18" height="13" x="3" y="4" rx="2"/><path d="M8 21h8m-4-4v4"/>',
    mobile: '<rect width="12" height="20" x="6" y="2" rx="2"/><path d="M11 18h2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    wifi: '<path d="m2 2 20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 3-2.2m3.7-1.7A10 10 0 0 1 19 13M2 8.8A15 15 0 0 1 5.3 7m3-1.2A15 15 0 0 1 22 8.8M12 20h.01"/>',
    qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zm4 4h3v3h-3zm-4 3h2m5-7v2"/>',
    code: '<path d="m8 9-4 3 4 3m8-6 4 3-4 3m-2-9-4 12"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7L20 14"/><path d="M20 7v4h-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    more: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
    chat: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    menu: '<path d="M5 8h14M5 16h10"/>',
    compose: '<path d="M13.5 5.5 18.5 10.5M4 20l3.2-.7L19 7.5a2.1 2.1 0 0 0-3-3L4.7 16.3 4 20Z"/>',
    laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
    folder: '<path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2h7.5A2.5 2.5 0 0 1 21 8.5v7A2.5 2.5 0 0 1 18.5 18h-13A2.5 2.5 0 0 1 3 15.5v-9Z"/>',
    down: '<path d="m8 10 4 4 4-4"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ''}</svg>`;
}

function dshFrame(kind) {
  return `<iframe class="dsh-iframe" data-dsh-frame="${kind}" title="真实 DSH ${kind === 'desktop' ? 'Desktop' : 'Mobile viewport'}" src="/dsh/?mobile-companion-prototype=${kind}"></iframe>`;
}

function existingApprovalPanel() {
  return `<section class="existing-approval-seat mobile" data-component-source="ApprovalPanel">
    <div class="${approvalCss.root}" data-approval-key="prototype-approval">
      <div class="${approvalCss.card}">
        <div class="${approvalCss.strip}"><span class="${approvalCss.dot}"></span>等待审批</div>
        <div class="${approvalCss.body}" data-approval-scroll="" tabindex="0" role="group" aria-label="审批详情">
          <div class="${approvalCss.headline}">需要运行文档检查以完成当前任务</div>
          <div class="${approvalCss.command}">pnpm run verify-md-links</div>
        </div>
        <div class="${approvalCss.actionRow}">
          <button class="${buttonCss.button} ${buttonCss.outline} ${buttonCss.md} ${approvalCss.reject}" data-action="deny">拒绝</button>
          <button class="${buttonCss.button} ${buttonCss.primary} ${buttonCss.md}" data-action="approve">允许一次</button>
        </div>
      </div>
    </div>
  </section>`;
}

function mobileApp() {
  const offline = state.scenario === 'offline' && !state.recovered;
  if (state.scenario === 'pairing') return mobilePairing();
  return `<div class="mobile-app">${state.mobileRoute === 'list' ? mobileSessionList(offline) : mobileConversation(offline)}</div>`;
}

function mobileSessionList(offline) {
  const pending = state.scenario === 'approval' && state.approval === 'pending';
  return `<div class="mobile-list-screen">
    <header class="mobile-remote-header"><button aria-label="打开菜单">${icon('menu', 20)}</button><div><strong>远程</strong><span><i class="${offline ? 'offline' : ''}"></i>${icon('laptop', 12)}${offline ? 'MacBook Pro 暂时离线' : 'MacBook Pro'}</span></div><button aria-label="更多操作">${icon('more', 20)}</button></header>
    <main class="mobile-project-list"><h2>项目</h2>
      <section class="mobile-project-group"><header><button class="project-name">${icon('folder', 18)}<strong>deepseek-harness</strong>${icon('down', 14)}</button><button data-action="mobile-new-workspace" aria-label="在 deepseek-harness 中新建 Session">${icon('compose', 18)}</button></header>
        <button class="mobile-project-session" data-action="open-session" data-session="companion"><span>移动端互通方案</span>${pending ? '<em>待处理</em>' : '<i class="running-dot"></i>'}</button>
        <button class="mobile-project-session" data-action="open-session" data-session="release"><span>Desktop 发布检查</span></button>
        <button class="mobile-project-session"><span>整理 Platform 多实例部署方案</span></button>
      </section>
      <section class="mobile-project-group"><header><button class="project-name">${icon('folder', 18)}<strong>未分组</strong>${icon('down', 14)}</button><button data-action="mobile-new" aria-label="新建未分组 Session">${icon('compose', 18)}</button></header>
        <button class="mobile-project-session" data-action="open-session" data-session="ungrouped"><span>整理下周的研究主题</span></button>
        <button class="mobile-project-session"><span>快速记录一个产品想法</span></button>
      </section>
      <section class="mobile-project-group"><header><button class="project-name">${icon('folder', 18)}<strong>everythiing-claude</strong>${icon('down', 14)}</button><button data-action="mobile-new-everything" aria-label="在 everythiing-claude 中新建 Session">${icon('compose', 18)}</button></header>
        <button class="mobile-project-session"><span>回顾千机移动端技术选型</span></button>
      </section>
    </main>
    <footer class="mobile-list-dock"><div class="mobile-chat-heading"><button>聊天${icon('down', 13)}</button><button data-action="mobile-new" aria-label="新建聊天">${icon('compose', 18)}</button></div><div class="mobile-dock-actions"><button class="mobile-search-pill">${icon('search', 18)}<span>搜索聊天记录</span></button><button class="mobile-round-action" data-action="mobile-new" aria-label="新建未分组 Session">${icon('compose', 20)}</button></div></footer>
  </div>`;
}

function mobileConversation(offline) {
  const session = state.mobileSession === 'ungrouped'
    ? { title: '整理下周的研究主题', context: '未分组' }
    : state.mobileSession === 'release'
      ? { title: 'Desktop 发布检查', context: 'deepseek-harness' }
      : state.mobileSession === 'new'
        ? { title: '新 Session', context: '未分组' }
        : state.mobileSession === 'new-workspace'
          ? { title: '新 Session', context: 'deepseek-harness' }
          : state.mobileSession === 'new-everything'
            ? { title: '新 Session', context: 'everythiing-claude' }
            : { title: '移动端互通方案', context: 'deepseek-harness' };
  const pending = state.scenario === 'approval' && state.approval === 'pending';
  return `<div class="mobile-conversation-screen">
    <header class="mobile-conversation-header"><button data-action="mobile-back" aria-label="返回 Sessions">${icon('left', 20)}</button><div><strong>${session.title}</strong><span>${session.context} · ${offline ? 'MacBook Pro 暂时离线' : 'MacBook Pro 已连接'}</span></div><button aria-label="更多操作">${icon('more', 20)}</button></header>
    ${offline ? `<div class="mobile-chat-offline">${icon('wifi', 16)}<span>连接已断开，重新连接后才能继续操作。</span><button data-action="recover">重试</button></div>` : ''}
    <main class="mobile-chat-scroll">
      <div class="mobile-user-message">把千机里的移动端能力迁移到 DeepSeek，并保持 Desktop 现有组件不变。</div>
      <div class="mobile-assistant-message"><span class="assistant-mark">DS</span><div><p>已经梳理完成。Mobile 会采用 Session 列表与全屏对话两级导航；运行和授权仍由 Desktop 负责。</p><div class="mobile-tool-row"><span>${icon('check', 15)}</span><div><strong>读取项目结构</strong><small>已完成 · 12 个文件</small></div></div><p>${pending ? '开始下一步前，需要你确认一次文档检查。' : '你可以继续在手机或 Desktop 上处理这个 Session。'}</p></div></div>
    </main>
    <div class="mobile-composer-seat">${pending ? existingApprovalPanel() : mobileComposer(offline)}</div>
  </div>`;
}

function mobileComposer(disabled) {
  return `<div class="mobile-input-source ${inputCss.root}"><div class="${inputCss.card}">
    <div class="${inputCss.scroll}" data-input-scroll><div class="${inputCss.grow}"><div class="${inputCss.backdrop}" aria-hidden></div><textarea class="${inputCss.input}" rows="2" ${disabled ? 'disabled' : ''} placeholder="${disabled ? '等待重新连接…' : '继续对话…'}"></textarea><div class="${inputCss.mirror}" aria-hidden>\n</div></div></div>
    <div class="${inputCss.row}"><div class="${inputCss.tools}"><button class="${inputCss.add}" aria-label="添加">${icon('plus', 15)}</button></div><div class="${inputCss.trailing}"><button class="${inputCss.primary}" data-action="mobile-send" aria-label="发送" disabled>${icon('right', 16)}</button></div></div>
  </div></div>`;
}

function mobilePairing() {
  const paired = state.pairingStep >= 2;
  return `<div class="mobile-scope-cover"><div class="mobile-pair-icon">${icon(paired ? 'check' : 'qr', 48)}</div><h2>${paired ? '已经连接' : state.pairingStep === 1 ? '确认安全短语' : '连接到你的 Desktop'}</h2><p>${paired ? '只要 DeepSeek Gestalt 窗口保持打开，就可以从任意网络继续工作。' : state.pairingStep === 1 ? '两台设备都应显示 amber-lake-47。' : '扫描 Desktop「设置 → 手机配对」中显示的一次性二维码。'}</p>${state.pairingStep === 1 ? '<div class="sas">amber · lake · 47</div>' : ''}<button class="primary" data-action="pair-next">${paired ? '打开 Sessions' : state.pairingStep === 0 ? '扫描演示二维码' : '短语一致，继续'}</button></div>`;
}

function render() {
  const variant = variants.find((item) => item.key === state.variant);
  document.querySelector('#app').innerHTML = `<div class="locked-prototype">
    <header class="lab-header"><div><span>SCOPE-LOCKED PROTOTYPE</span><strong>Mobile Companion</strong><p>${variant.key} — ${variant.name}</p></div><div><span class="real-badge"><i></i>LIVE DSH · 127.0.0.1:3080</span><button class="inspect-button ${state.inspector ? 'active' : ''}" data-action="inspect">${icon('code', 16)} Scope map</button></div></header>
    <nav class="scenario-tabs">${scenarios.map((scenario, index) => `<button class="${state.scenario === scenario.key ? 'active' : ''}" data-scenario="${scenario.key}"><small>0${index + 1}</small>${scenario.label}</button>`).join('')}</nav>
    <main class="real-stage"><section class="real-desktop"><div class="frame-label"><span>${icon('monitor', 15)} Desktop</span><strong>真实 DSH 页面 · 移动端能力仅在 Settings</strong></div><div class="desktop-window"><div class="lights"><i></i><i></i><i></i></div>${dshFrame('desktop')}</div></section><section class="real-mobile"><div class="frame-label"><span>${icon('mobile', 15)} Mobile</span><strong>新导航壳 · 复用 InputBar / ApprovalPanel</strong></div><div class="phone"><div class="island"></div>${mobileApp()}<div class="home-line"></div></div></section>${state.inspector ? scopeMap(variant) : ''}</main>
    <div class="variant-switcher"><div><span>PLACEMENT LOCKED</span><strong>Desktop — Settings only</strong><small>settings.section</small></div></div>
  </div>`;
  bind();
  bindDshFrames();
}

function bindDshFrames() {
  document.querySelectorAll('[data-dsh-frame]').forEach((frame) => {
    let preparedDocument;
    const prepare = () => {
      const document = frame.contentDocument;
      if (document === null) return;
      if (document === preparedDocument) return;
      preparedDocument = document;
      let pairingSettingsOpened = false;
      const suppressOnboarding = () => {
        const later = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === '稍后配置');
        const dialog = later?.closest('[role="dialog"]') ?? later?.parentElement?.parentElement?.parentElement;
        if (dialog !== null && dialog !== undefined) dialog.style.display = 'none';
        const root = document.querySelector('#root');
        if (root !== null) {
          root.removeAttribute('inert');
          root.removeAttribute('aria-hidden');
        }
        document.body.style.overflow = 'auto';
      };
      const syncPrototype = () => {
        suppressOnboarding();
        if (state.scenario !== 'pairing' || frame.dataset.dshFrame !== 'desktop') return;
        const dialog = [...document.querySelectorAll('[role="dialog"]')].find((candidate) => candidate.querySelector('nav') !== null);
        if (dialog !== undefined) {
          injectPairingSettings(document, dialog);
          return;
        }
        if (pairingSettingsOpened) return;
        const trigger = document.querySelector('button[aria-haspopup="dialog"]');
        if (trigger === null) return;
        pairingSettingsOpened = true;
        trigger.click();
      };
      syncPrototype();
      const observer = new MutationObserver(syncPrototype);
      observer.observe(document.body, { childList: true, subtree: true });
    };
    frame.addEventListener('load', prepare);
    if (frame.contentDocument?.readyState === 'complete') prepare();
  });
}

function injectPairingSettings(document, dialog) {
  const nav = dialog.querySelector('nav');
  const navList = nav?.lastElementChild;
  const sectionSlot = dialog.querySelector('[data-slot="settings.section"]');
  if (navList === null || navList === undefined || sectionSlot === null) return;
  if (navList.querySelector('[data-prototype-mobile-settings]') !== null) return;

  ensurePairingSettingsStyles(document);
  const cells = [...navList.querySelectorAll(':scope > button')];
  const template = cells.at(-1);
  if (template === undefined) return;
  const activeCell = cells.find((cell) => cell.getAttribute('aria-current') === 'true');
  const activeClass = activeCell === undefined
    ? undefined
    : [...activeCell.classList].find((name) => !template.classList.contains(name));

  const mobileCell = template.cloneNode(true);
  mobileCell.dataset.prototypeMobileSettings = '';
  mobileCell.removeAttribute('aria-current');
  mobileCell.innerHTML = `${icon('mobile', 16)}<span class="dsh-prototype-nav-label">手机配对</span>`;
  const activate = () => {
    for (const cell of [...navList.querySelectorAll(':scope > button')]) {
      cell.removeAttribute('aria-current');
      if (activeClass !== undefined) cell.classList.remove(activeClass);
    }
    mobileCell.setAttribute('aria-current', 'true');
    if (activeClass !== undefined) mobileCell.classList.add(activeClass);
    sectionSlot.innerHTML = pairingSettingsContent();
    sectionSlot.querySelectorAll('[data-prototype-pair-next]').forEach((button) => {
      button.addEventListener('click', () => act('pair-next'));
    });
  };
  mobileCell.addEventListener('click', activate);
  navList.append(mobileCell);
  activate();
}

function pairingSettingsContent() {
  const paired = state.pairingStep >= 2;
  const stepContent = paired
    ? `<div class="dsh-prototype-device"><span class="dsh-prototype-device-icon">${icon('mobile', 22)}</span><div><strong>iPhone 15 Pro</strong><small>已配对 · 刚刚在线</small></div><button>管理</button></div>`
    : state.pairingStep === 1
      ? `<div class="dsh-prototype-pair-grid"><div class="dsh-prototype-qr">${icon('qr', 76)}</div><div><span>确认安全短语</span><strong class="dsh-prototype-phrase">amber · lake · 47</strong><p>两台设备显示相同短语后再继续。</p><button data-prototype-pair-next>短语一致，完成配对</button></div></div>`
      : `<div class="dsh-prototype-pair-grid"><div class="dsh-prototype-qr muted">${icon('qr', 76)}</div><div><span>连接新手机</span><strong>使用 Mobile Companion 扫描二维码</strong><p>Desktop 与手机需要登录同一个 GitHub 账号。二维码将在 2 分钟后失效。</p><button data-prototype-pair-next>生成配对二维码</button></div></div>`;
  return `<section class="dsh-prototype-mobile-settings">
    <header><div><h2>手机配对</h2><p>允许手机查看和继续此 Desktop 上的 Sessions。</p></div><span>${paired ? '已连接' : '已启用'}</span></header>
    <div class="dsh-prototype-setting-row"><div><strong>允许手机访问</strong><small>关闭 DeepSeek Gestalt 窗口后，手机将暂时无法继续操作。</small></div><button class="dsh-prototype-switch" aria-pressed="true"><i></i></button></div>
    <div class="dsh-prototype-pair-card"><div class="dsh-prototype-card-title"><strong>${paired ? '已配对设备' : '配对设备'}</strong><span>${paired ? '1 台' : '端到端加密'}</span></div>${stepContent}</div>
  </section>`;
}

function ensurePairingSettingsStyles(document) {
  if (document.querySelector('[data-prototype-mobile-settings-style]') !== null) return;
  const style = document.createElement('style');
  style.dataset.prototypeMobileSettingsStyle = '';
  style.textContent = `
    .dsh-prototype-nav-label { margin-left: 10px; }
    .dsh-prototype-mobile-settings { padding: 14px 8px 42px; color: var(--dsw-alias-label-primary); }
    .dsh-prototype-mobile-settings > header { padding: 2px 0 22px; border-bottom: 1px solid var(--dsw-alias-border-l3); display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
    .dsh-prototype-mobile-settings h2 { margin: 0 0 6px; font-size: 20px; line-height: 28px; }
    .dsh-prototype-mobile-settings p { margin: 0; color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 20px; }
    .dsh-prototype-mobile-settings > header > span { padding: 5px 10px; border-radius: 999px; background: var(--dsw-static-green-100); color: var(--dsw-static-green-900); font-size: 12px; font-weight: 600; }
    .dsh-prototype-setting-row { min-height: 82px; padding: 18px 0; border-bottom: 1px solid var(--dsw-alias-border-l3); display: flex; align-items: center; justify-content: space-between; gap: 24px; }
    .dsh-prototype-setting-row > div { display: flex; flex-direction: column; gap: 5px; }
    .dsh-prototype-setting-row strong { font-size: 14px; }
    .dsh-prototype-setting-row small { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
    .dsh-prototype-switch { width: 42px; height: 24px; padding: 2px; border: 0; border-radius: 999px; background: var(--dsw-alias-state-business-primary); display: flex; justify-content: flex-end; cursor: pointer; }
    .dsh-prototype-switch i { width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.22); }
    .dsh-prototype-pair-card { margin-top: 24px; padding: 18px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 18px; background: var(--dsw-specific-input-major); box-shadow: var(--dsw-shadow-lv1); }
    .dsh-prototype-card-title { padding-bottom: 15px; border-bottom: 1px solid var(--dsw-alias-border-l3); display: flex; justify-content: space-between; }
    .dsh-prototype-card-title strong { font-size: 15px; }
    .dsh-prototype-card-title span { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
    .dsh-prototype-pair-grid { min-height: 190px; padding-top: 18px; display: grid; grid-template-columns: 150px 1fr; gap: 28px; align-items: center; }
    .dsh-prototype-qr { width: 150px; height: 150px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 14px; background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-state-business-primary); display: grid; place-items: center; }
    .dsh-prototype-qr.muted { color: var(--dsw-alias-label-caption); }
    .dsh-prototype-pair-grid > div:last-child { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
    .dsh-prototype-pair-grid span { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
    .dsh-prototype-pair-grid strong { font-size: 16px; line-height: 24px; }
    .dsh-prototype-pair-grid button, .dsh-prototype-device button { height: 34px; margin-top: 8px; padding: 0 14px; border: 0; border-radius: 17px; background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); font-size: 13px; cursor: pointer; }
    .dsh-prototype-phrase { font-family: var(--ds-font-family-code); letter-spacing: .04em; }
    .dsh-prototype-device { min-height: 76px; padding-top: 16px; display: grid; grid-template-columns: 42px 1fr auto; align-items: center; gap: 12px; }
    .dsh-prototype-device-icon { width: 42px; height: 42px; border-radius: 12px; background: var(--dsw-static-deepseek-50); color: var(--dsw-alias-state-business-primary); display: grid; place-items: center; }
    .dsh-prototype-device > div { display: flex; flex-direction: column; gap: 4px; }
    .dsh-prototype-device > div strong { font-size: 14px; }
    .dsh-prototype-device > div small { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
  `;
  document.head.append(style);
}

function scopeMap(variant) {
  return `<aside class="scope-map"><header><span>SCOPE MAP</span><button data-action="inspect">${icon('x', 15)}</button></header><div class="scope-safe"><strong>直接复用</strong><p>Desktop AppFrame · Sidebar · Workspace browser · Conversation · Chat nodes · Tool renderers · InputBar · ApprovalPanel · Theme</p></div><div class="scope-new"><strong>本原型新增</strong><p>Desktop: settings.section only · Mobile Session list/navigation shell · Remote state projection</p></div><pre>${JSON.stringify({ variant: variant.key, scenario: state.scenario, mobileRoute: state.mobileRoute, mobileSession: state.mobileSession, approval: state.approval, pairingStep: state.pairingStep, remoteOnline: state.scenario !== 'offline' || state.recovered }, null, 2)}</pre></aside>`;
}

function bind() {
  document.querySelectorAll('[data-scenario]').forEach((button) => button.addEventListener('click', () => {
    state.scenario = button.dataset.scenario;
    state.pairingStep = 0;
    state.approval = 'pending';
    state.recovered = false;
    state.mobileRoute = 'list';
    render();
  }));
  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => act(button.dataset.action, button.dataset.session)));
}

function act(action, session) {
  if (action === 'approve') state.approval = 'approved';
  if (action === 'deny') state.approval = 'denied';
  if (action === 'pair-next') {
    if (state.pairingStep >= 2) state.scenario = 'live';
    else state.pairingStep += 1;
  }
  if (action === 'close-pairing') state.scenario = 'live';
  if (action === 'recover') state.recovered = true;
  if (action === 'open-session') {
    state.mobileSession = session ?? 'companion';
    state.mobileRoute = 'session';
  }
  if (action === 'mobile-new') {
    state.mobileSession = 'new';
    state.mobileRoute = 'session';
  }
  if (action === 'mobile-new-workspace') {
    state.mobileSession = 'new-workspace';
    state.mobileRoute = 'session';
  }
  if (action === 'mobile-new-everything') {
    state.mobileSession = 'new-everything';
    state.mobileRoute = 'session';
  }
  if (action === 'mobile-back') state.mobileRoute = 'list';
  if (action === 'inspect') state.inspector = !state.inspector;
  render();
}

addEventListener('popstate', () => { state.variant = variantFromUrl(); render(); });

render();
