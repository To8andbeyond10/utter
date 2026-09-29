// Clearband content script entry point. Finds posts, evaluates them,
// applies the user's level, and keeps up as feeds scroll and change.
// Makes no network requests: everything runs on this page.
(function () {
  'use strict';

  const S = globalThis.ClearbandSettings;
  const D = globalThis.ClearbandDetect;
  const UI = globalThis.ClearbandUI;
  const site = globalThis.ClearbandSites.siteForHost(location.hostname);
  if (!site || window.__clearbandRunning) return;
  window.__clearbandRunning = true;

  const SELECTOR = site.posts.join(',');
  const MAX_PER_SCAN = 400;

  let settings = S.normalize(null);
  let seen = new WeakMap();        // target -> content signature last evaluated
  const results = new WeakMap();   // target -> last result
  const revealed = new WeakSet();  // targets the user chose to show
  const dismissed = new Set();     // signatures reported as mistakes this session
  let lastCount = -1;
  let pauseTimer = null;

  function alive() {
    try { return Boolean(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }

  function currentLevel() {
    if (!settings.enabled || S.isPaused(settings)) return 'off';
    return settings.levels[site.id] || 'inform';
  }

  function mountFor(post) {
    return (site.mountOn && site.mountOn(post)) || post;
  }

  function signature(post) {
    const t = post.textContent || '';
    return t.length + ':' + t.slice(0, 160);
  }

  function topLevelPosts() {
    const out = [];
    const all = document.querySelectorAll(SELECTOR);
    for (let i = 0; i < all.length && out.length < MAX_PER_SCAN; i++) {
      const p = all[i];
      if (!p.parentElement || !p.parentElement.closest(SELECTOR)) out.push(p);
    }
    return out;
  }

  function clearTarget(target) {
    UI.clear(target);
    delete target.dataset.cbFlag;
  }

  function draw(target, result, action) {
    UI.decorate(target, result, action, site, settings, handlersFor(target));
    target.dataset.cbFlag = result.rung;
  }

  function processPost(post) {
    const target = mountFor(post);
    const sig = signature(post);
    if (seen.get(target) === sig) return;
    const changed = seen.has(target);
    seen.set(target, sig);
    if (changed) revealed.delete(target); // the element was reused for a different post

    const level = currentLevel();
    if (level === 'off' || dismissed.has(sig)) { clearTarget(target); return; }

    const result = D.evaluate(post, site, settings);
    results.set(target, result);
    const action = result.rung ? D.actionFor(result.rung, level, settings) : 'none';
    if (action === 'none') { clearTarget(target); return; }
    draw(target, result, revealed.has(target) ? 'badge' : action);
  }

  function reportCount() {
    const count = document.querySelectorAll('[data-cb-flag]').length;
    if (count === lastCount || !alive()) return;
    lastCount = count;
    chrome.runtime.sendMessage({ type: 'count', count }).catch(() => {});
  }

  function scan() {
    if (!alive()) { observer.disconnect(); return; }
    const posts = topLevelPosts();
    for (const post of posts) {
      try { processPost(post); } catch (e) { /* one odd post must never break the page */ }
    }
    reportCount();
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; scan(); }, 300);
  }

  function resetAll() {
    UI.hideCard();
    document.querySelectorAll('[data-cb-state], [data-cb-flag]').forEach(clearTarget);
    seen = new WeakMap();
    scan();
    armPauseTimer();
  }

  function armPauseTimer() {
    clearTimeout(pauseTimer);
    const wait = settings.pausedUntil - Date.now();
    if (wait > 0 && wait < 24 * 3600 * 1000) pauseTimer = setTimeout(resetAll, wait + 500);
  }

  // ---------- Card and layer actions ----------

  function handlersFor(target) {
    return {
      onReveal: () => showAnyway(target),
      onUnhide: () => showAnyway(target),
      onAlwaysHide: (author) => setRule(author, 'block'),
      onAlwaysAllow: (author) => setRule(author, 'allow'),
      onReport: (t, result) => reportMistake(t, result)
    };
  }

  function showAnyway(target) {
    revealed.add(target);
    const result = results.get(target);
    if (result) draw(target, result, 'badge');
  }

  async function setRule(author, list) {
    if (!author) return;
    const key = S.ruleKey(site.id, author);
    const rules = { block: settings.rules.block.filter((k) => k !== key), allow: settings.rules.allow.filter((k) => k !== key) };
    rules[list].push(key);
    await S.save({ rules });
    const name = site.id === 'facebook' ? author : '@' + author.replace(/^@/, '');
    UI.toast(list === 'block'
      ? 'Always hiding ' + name + ' on ' + site.name + '. Undo in Clearband settings.'
      : 'Always allowing ' + name + ' on ' + site.name + '. Undo in Clearband settings.');
  }

  async function reportMistake(target, result) {
    const post = target.matches(SELECTOR) ? target : (target.querySelector(SELECTOR) || target);
    dismissed.add(signature(post));
    clearTarget(target);
    reportCount();
    try {
      const { mistakeReports = [] } = await chrome.storage.local.get('mistakeReports');
      mistakeReports.push({
        site: site.id,
        page: location.origin + location.pathname,
        author: result.author,
        rung: result.rung,
        evidence: result.evidence.map((e) => e.text),
        reportedAt: new Date().toISOString()
      });
      await chrome.storage.local.set({ mistakeReports: mistakeReports.slice(-200) });
    } catch (e) { /* storage full or context gone */ }
    UI.toast('Thanks. Clearband will stop flagging this post, and your report is saved.');
  }

  // ---------- Wiring ----------

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type !== 'childList') continue;
      let onlyOurs = m.addedNodes.length > 0 || m.removedNodes.length > 0;
      for (const n of m.addedNodes) {
        if (!(n.nodeName && n.nodeName.toLowerCase().startsWith('clearband-'))) { onlyOurs = false; break; }
      }
      if (onlyOurs) {
        for (const n of m.removedNodes) {
          if (!(n.nodeName && n.nodeName.toLowerCase().startsWith('clearband-'))) { onlyOurs = false; break; }
        }
      }
      if (!onlyOurs) { schedule(); return; }
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !alive()) return;
    S.load().then((s) => { settings = s; resetAll(); });
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'status') {
      sendResponse({
        site: site.id,
        siteName: site.name,
        level: settings.levels[site.id],
        active: currentLevel() !== 'off',
        count: document.querySelectorAll('[data-cb-flag]').length
      });
    }
  });

  S.load().then((s) => {
    settings = s;
    scan();
    armPauseTimer();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
})();
