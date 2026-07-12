(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const text = (selector, value) => $$(selector).forEach((node) => { node.textContent = value; });
  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch]);
  function deviceMessage() {
    const ua = navigator.userAgent || '';
    if (/iphone|ipad|ipod/i.test(ua)) return 'APK 仅能安装在 Android 设备上，请使用 Android 手机访问。';
    if (/windows|macintosh|linux|cros/i.test(ua) && !/android/i.test(ua)) return '可先下载 APK，再传输到 Android 手机安装。';
    return 'Android 可能提示“未知来源”，确认来自本站后请允许浏览器安装应用。';
  }
  function showNotice(message) { const notice = $('#downloadNotice'); notice.textContent = message; notice.classList.add('show'); window.setTimeout(() => notice.classList.remove('show'), 4300); }
  function render(config) {
    document.title = config.websiteTitle || `${config.appName} - 官方下载`;
    text('[data-app-name]', config.appName); text('[data-slogan]', config.slogan); text('[data-description]', config.description); text('[data-version]', config.latestVersion); text('[data-apk-size]', config.apkSize); text('[data-release-date]', config.releaseDate); text('[data-copyright]', config.copyright);
    $('meta[name="description"]').content = config.description; $('meta[property="og:title"]').content = config.websiteTitle; $('meta[property="og:description"]').content = config.description;
    const contact = $('#contactLink'); if (contact) { contact.href = `mailto:${config.contact}`; contact.textContent = config.contact; } const qqGroup = $('#qqGroup'); if (qqGroup) qqGroup.textContent = config.qqGroup;
    $('#featureGrid').innerHTML = (config.features || []).map((item) => `<article class="feature-card reveal"><div class="feature-icon">${escapeHtml(item.icon || '✓')}</div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></article>`).join('');
    const screenshotGrid = $('#screenshotGrid'); if (screenshotGrid) screenshotGrid.innerHTML = (config.screenshots || []).map((item) => `<article class="screenshot-card reveal"><div class="screenshot-placeholder ${escapeHtml(item.className || '')}"></div><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></div></article>`).join('');
    $('#updateLog').innerHTML = (config.updateLog || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    $('#historyList').innerHTML = (config.historicalVersions || []).map((item) => `<article class="history-entry"><b>v${escapeHtml(item.version)}</b><span>${escapeHtml(item.releaseDate)} · ${escapeHtml(item.apkSize)}</span><ul>${(item.updateLog || []).map((log) => `<li>${escapeHtml(log)}</li>`).join('')}</ul></article>`).join('') || '<p>暂无历史版本记录。</p>';
  }
  async function load() { try { const response = await fetch('/api/app-info'); const data = await response.json(); if (!response.ok || !data.success) throw new Error(); render(data); } catch { showNotice('版本信息暂时无法加载，请稍后刷新页面。'); } }
  $('.menu-button').addEventListener('click', (event) => { const links = $('.nav-links'); const open = links.classList.toggle('open'); event.currentTarget.setAttribute('aria-expanded', String(open)); });
  $$('.nav-links a').forEach((link) => link.addEventListener('click', () => $('.nav-links').classList.remove('open')));
  $('#deviceHint').textContent = deviceMessage();
  $('#downloadButton').addEventListener('click', () => showNotice(deviceMessage()));
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(() => {}));
  load();
})();
