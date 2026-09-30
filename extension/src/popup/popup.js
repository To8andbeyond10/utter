(function () {
  'use strict';
  const S = globalThis.ClariFiSettings;
  const $ = (id) => document.getElementById(id);
  let settings = S.normalize(null);
  let tab = null;
  let status = null;

  function levelNote(level) {
    if (level === 'off') return 'ClariFi is off on this site.';
    if (level === 'inform') return 'AI posts get a badge. Hover or tap it to see the evidence.';
    if (level === 'warn') return 'AI posts are blurred until you choose to view them.';
    return settings.blockIncludesLikely
      ? 'Confirmed, strong and likely AI posts are hidden.'
      : 'Confirmed and strong AI posts are hidden. Likely ones are blurred.';
  }

  function render() {
    $('enabled').checked = settings.enabled;
    document.body.classList.toggle('is-off', !settings.enabled);
    const paused = S.isPaused(settings);

    if (status) {
      $('site-panel').hidden = false;
      $('no-site').hidden = true;
      $('site-name').textContent = 'On ' + status.siteName;
      const level = settings.levels[status.site];
      document.querySelectorAll('#levels button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.level === level)));
      $('level-note').textContent = levelNote(level);
      const count = $('count');
      count.textContent = '';
      if (!settings.enabled) count.textContent = 'ClariFi is turned off.';
      else if (paused) count.textContent = 'Paused, so nothing is flagged right now.';
      else if (level === 'off') count.textContent = '';
      else if (status.count === 0) count.textContent = 'No AI posts flagged on this page yet.';
      else {
        const b = document.createElement('b');
        b.textContent = String(status.count);
        count.append(b, status.count === 1 ? ' AI post flagged on this page' : ' AI posts flagged on this page');
      }
    } else {
      $('site-panel').hidden = true;
      $('no-site').hidden = false;
    }

    $('pause-buttons').hidden = paused;
    $('resume').hidden = !paused;
    if (paused) {
      $('pause-state').textContent = settings.pausedUntil >= S.PAUSE_FOREVER
        ? 'Paused until you resume.'
        : 'Paused until ' + new Date(settings.pausedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '.';
    } else {
      $('pause-state').textContent = 'Take a break from filtering:';
    }
  }

  async function refreshStatus() {
    if (!tab) return;
    try { status = await chrome.tabs.sendMessage(tab.id, { type: 'status' }); } catch (e) { status = null; }
    render();
  }

  async function init() {
    settings = await S.load();
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try { $('version').textContent = 'v' + chrome.runtime.getManifest().version; } catch (e) { /* ignore */ }
    await refreshStatus();
  }

  $('levels').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-level]');
    if (!b || !status) return;
    settings.levels[status.site] = b.dataset.level;
    render();
    await S.save({ levels: settings.levels });
    setTimeout(refreshStatus, 700);
  });

  $('enabled').addEventListener('change', async (e) => {
    settings.enabled = e.target.checked;
    render();
    await S.save({ enabled: settings.enabled });
    setTimeout(refreshStatus, 700);
  });

  $('pause-buttons').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-pause]');
    if (!b) return;
    settings.pausedUntil = b.dataset.pause === 'forever' ? S.PAUSE_FOREVER : Date.now() + Number(b.dataset.pause) * 60000;
    render();
    await S.save({ pausedUntil: settings.pausedUntil });
    setTimeout(refreshStatus, 700);
  });

  $('resume').addEventListener('click', async () => {
    settings.pausedUntil = 0;
    render();
    await S.save({ pausedUntil: 0 });
    setTimeout(refreshStatus, 700);
  });

  $('open-options').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close();
  });

  init();
})();
