// Clearband background: fills in default settings, shows the per-tab count
// on the toolbar icon, and ends timed pauses.
if (typeof importScripts === 'function' && !globalThis.ClearbandSettings) {
  importScripts('shared/settings.js');
}
const S = globalThis.ClearbandSettings;

chrome.runtime.onInstalled.addListener(async (details) => {
  const raw = await chrome.storage.sync.get(null);
  await chrome.storage.sync.set(S.normalize(raw));
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
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
