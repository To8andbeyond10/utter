(function () {
  'use strict';
  const S = globalThis.ClariFiSettings;
  const $ = (id) => document.getElementById(id);
  let settings = S.normalize(null);
  let savedTimer = null;

  function flashSaved(text) {
    $('saved').textContent = text || 'Saved';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { $('saved').textContent = ''; }, 1800);
  }

  async function save(patch, text) {
    Object.assign(settings, patch);
    await S.save(patch);
    flashSaved(text);
  }

  function renderSites() {
    const wrap = $('sites');
    wrap.textContent = '';
    for (const site of S.SITES) {
      const row = document.createElement('div');
      row.className = 'site-row';
      const name = document.createElement('b');
      name.textContent = site.name;
      const seg = document.createElement('div');
      seg.className = 'seg';
      seg.setAttribute('role', 'radiogroup');
      seg.setAttribute('aria-label', 'Level on ' + site.name);
      for (const level of S.LEVELS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.textContent = level[0].toUpperCase() + level.slice(1);
        b.setAttribute('aria-checked', String(settings.levels[site.id] === level));
        b.addEventListener('click', () => {
          const levels = Object.assign({}, settings.levels, { [site.id]: level });
          save({ levels });
          renderSites();
        });
        seg.append(b);
      }
      row.append(name, seg);
      wrap.append(row);
    }
  }

  function renderRules() {
    for (const list of ['block', 'allow']) {
      const ul = $('rules-' + list);
      ul.textContent = '';
      const keys = settings.rules[list];
      if (!keys.length) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = 'No accounts yet';
        ul.append(li);
        continue;
      }
      for (const key of keys) {
        const i = key.indexOf(':');
        const siteId = key.slice(0, i);
        const handle = key.slice(i + 1);
        const li = document.createElement('li');
        const label = document.createElement('span');
        const who = document.createElement('span');
        who.textContent = siteId === 'facebook' ? handle : '@' + handle;
        const where = document.createElement('span');
        where.className = 'site';
        where.textContent = ' on ' + S.siteName(siteId);
        label.append(who, where);
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.textContent = 'Remove';
        rm.setAttribute('aria-label', 'Remove ' + who.textContent + ' from ' + (list === 'block' ? 'always hide' : 'always allow'));
        rm.addEventListener('click', () => {
          const rules = { block: settings.rules.block.slice(), allow: settings.rules.allow.slice() };
          rules[list] = rules[list].filter((k) => k !== key);
          save({ rules }, 'Removed');
          renderRules();
        });
        li.append(label, rm);
        ul.append(li);
      }
    }
  }

  async function renderReports() {
    const { mistakeReports = [] } = await chrome.storage.local.get('mistakeReports');
    $('report-count').textContent = mistakeReports.length === 0
      ? 'No reports yet. Use "Report a mistake" on any badge card when ClariFi gets one wrong.'
      : mistakeReports.length + (mistakeReports.length === 1 ? ' report' : ' reports') + ' saved on this computer. Download them to share with the ClariFi team.';
    $('download-reports').disabled = mistakeReports.length === 0;
    $('clear-reports').disabled = mistakeReports.length === 0;
    return mistakeReports;
  }

  function renderAll() {
    renderSites();
    $('blockIncludesLikely').checked = settings.blockIncludesLikely;
    document.querySelectorAll('input[name="blockStyle"]').forEach((r) => { r.checked = r.value === settings.blockStyle; });
    $('useKeywords').checked = settings.useKeywords;
    $('hoverScan').checked = settings.hoverScan;
    renderRules();
    renderReports();
  }

  $('blockIncludesLikely').addEventListener('change', (e) => save({ blockIncludesLikely: e.target.checked }));
  document.querySelectorAll('input[name="blockStyle"]').forEach((r) => r.addEventListener('change', () => save({ blockStyle: r.value })));
  $('useKeywords').addEventListener('change', (e) => save({ useKeywords: e.target.checked }));
  $('hoverScan').addEventListener('change', (e) => save({ hoverScan: e.target.checked }));

  $('download-reports').addEventListener('click', async () => {
    const reports = await renderReports();
    const blob = new Blob([JSON.stringify(reports, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'clarifi-mistake-reports.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  $('clear-reports').addEventListener('click', async () => {
    await chrome.storage.local.set({ mistakeReports: [] });
    renderReports();
    flashSaved('Reports cleared');
  });

  let resetArmed = false;
  $('reset').addEventListener('click', async (e) => {
    if (!resetArmed) {
      resetArmed = true;
      e.target.textContent = 'Click again to reset everything';
      setTimeout(() => { resetArmed = false; e.target.textContent = 'Reset all settings'; }, 4000);
      return;
    }
    resetArmed = false;
    e.target.textContent = 'Reset all settings';
    settings = S.normalize(null);
    await chrome.storage.sync.clear();
    await chrome.storage.sync.set(settings);
    renderAll();
    flashSaved('Settings reset');
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') S.load().then((s) => { settings = s; renderAll(); });
    if (area === 'local' && changes.mistakeReports) renderReports();
  });

  S.load().then((s) => { settings = s; renderAll(); });
  try { $('version').textContent = 'ClariFi v' + chrome.runtime.getManifest().version; } catch (e) { /* ignore */ }
})();
