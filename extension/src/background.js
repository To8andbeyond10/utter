// ClariFi background: fills in default settings, shows the per-tab count
// on the toolbar icon, ends timed pauses, and owns the ExtensionPay
// (ExtensionPay.com) instance for plan checks.
if (typeof importScripts === 'function') {
  if (!globalThis.ClariFiSettings) importScripts('shared/settings.js');
  if (!globalThis.ClariFiBilling) importScripts('shared/billing.js');
  if (typeof ExtPay === 'undefined') {
    try { importScripts('vendor/ExtPay.js'); } catch (e) { /* billing degrades to free */ }
  }
}
const S = globalThis.ClariFiSettings;
const B = globalThis.ClariFiBilling;

let extpay = null;
if (typeof ExtPay === 'function') {
  extpay = ExtPay('clarifi');
  extpay.startBackground();
}

async function currentTier() {
  try {
    // Re-declare inside callbacks: the top-level instance can be gone
    // when the service worker wakes (see ExtPay docs).
    const ep = (typeof ExtPay === 'function') ? ExtPay('clarifi') : extpay;
    if (!ep) return 'free';
    const user = await ep.getUser();
    return B.tierForUser(user);
  } catch (e) {
    return 'free';
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const raw = await chrome.storage.sync.get(null);
  await chrome.storage.sync.set(S.normalize(raw));
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
  if (details.reason === 'update') {
    // Paid gating arrived in v0.2.0: free users keep Inform; Warn/Block need Plus.
    try {
      const tier = await currentTier();
      if (tier === 'free') {
        const s = await S.load();
        let changed = false;
        for (const k of Object.keys(s.levels)) {
          if (s.levels[k] === 'warn' || s.levels[k] === 'block') { s.levels[k] = 'inform'; changed = true; }
        }
        if (changed) await S.save({ levels: s.levels });
      }
    } catch (e) { /* best effort */ }
  }
  await schedulePauseAlarm();
});

chrome.runtime.onStartup.addListener(schedulePauseAlarm);

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'count' || !sender.tab || sender.tab.id == null) return;
  const n = Math.max(0, msg.count | 0);
  const tabId = sender.tab.id;
  chrome.action.setBadgeText({ tabId, text: n === 0 ? '' : n > 99 ? '99+' : String(n) });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#4A2FC9' });
});

// Billing messages from popup, options, and content scripts.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;
  if (msg.type === 'clarifi-tier') {
    currentTier().then((tier) => sendResponse({ tier })).catch(() => sendResponse({ tier: 'free' }));
    return true;
  }
  if (msg.type === 'clarifi-upgrade') {
    try {
      const ep = (typeof ExtPay === 'function') ? ExtPay('clarifi') : extpay;
      if (ep) ep.openPaymentPage();
    } catch (e) { /* noop */ }
    return false;
  }
});

async function schedulePauseAlarm() {
  const s = await S.load();
  await chrome.alarms.clear('unpause');
  if (s.pausedUntil > Date.now() && s.pausedUntil < S.PAUSE_FOREVER) {
    chrome.alarms.create('unpause', { when: s.pausedUntil });
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'unpause') return;
  const s = await S.load();
  if (s.pausedUntil && s.pausedUntil <= Date.now() + 1000) await chrome.storage.sync.set({ pausedUntil: 0 });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.pausedUntil) schedulePauseAlarm();
});
