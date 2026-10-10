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

// The user's tier, or null when ExtensionPay can't answer (offline, or the
// library failed to load). Null is never treated as an ended plan.
async function fetchTier() {
  try {
    // Re-declare inside callbacks: the top-level instance can be gone
    // when the service worker wakes (see ExtPay docs).
    const ep = (typeof ExtPay === 'function') ? ExtPay('clarifi') : extpay;
    if (!ep) return null;
    const user = await ep.getUser();
    return B.tierForUser(user);
  } catch (e) {
    return null;
  }
}

// Warn and Block need Plus. Once ExtensionPay says the plan has ended
// (canceled, or a renewal payment failed), put those sites back on Inform.
async function enforcePlan(tier) {
  if (tier === undefined) tier = await fetchTier();
  if (tier !== 'free') return;
  const levels = S.freeLevels((await S.load()).levels);
  if (levels) await S.save({ levels });
}

const PLAN_CHECK_MINUTES = 360;

chrome.runtime.onInstalled.addListener(async (details) => {
  const raw = await chrome.storage.sync.get(null);
  await chrome.storage.sync.set(S.normalize(raw));
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
  if (details.reason === 'update') await enforcePlan();
  chrome.alarms.create('plan-check', { periodInMinutes: PLAN_CHECK_MINUTES });
  await schedulePauseAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create('plan-check', { periodInMinutes: PLAN_CHECK_MINUTES });
  await enforcePlan();
  await schedulePauseAlarm();
});

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
    fetchTier()
      .then(async (tier) => { await enforcePlan(tier); sendResponse({ tier: tier || 'free' }); })
      .catch(() => sendResponse({ tier: 'free' }));
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
  if (alarm.name === 'plan-check') return enforcePlan();
  if (alarm.name !== 'unpause') return;
  const s = await S.load();
  if (s.pausedUntil && s.pausedUntil <= Date.now() + 1000) await chrome.storage.sync.set({ pausedUntil: 0 });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.pausedUntil) schedulePauseAlarm();
});
