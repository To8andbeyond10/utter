// ClariFi shared settings. Loaded by content scripts, popup, options and background.
(function (root) {
  'use strict';

  const SITES = [
    { id: 'youtube', name: 'YouTube' },
    { id: 'tiktok', name: 'TikTok' },
    { id: 'instagram', name: 'Instagram' },
    { id: 'x', name: 'X' },
    { id: 'facebook', name: 'Facebook' },
    { id: 'threads', name: 'Threads' },
    { id: 'reddit', name: 'Reddit' }
  ];

  const LEVELS = ['off', 'inform', 'warn', 'block'];
  const PAUSE_FOREVER = 8.64e15; // max JS date: "until I turn it back on"

  const DEFAULTS = {
    enabled: true,
    pausedUntil: 0,
    levels: {
      youtube: 'inform', tiktok: 'inform', instagram: 'inform', x: 'inform',
      facebook: 'inform', threads: 'inform', reddit: 'inform'
    },
    blockIncludesLikely: false, // Block acts on Confirmed and Strong only, unless opted in
    blockStyle: 'note',         // 'note' = one-line note; 'remove' = hide completely
    useKeywords: true,          // hashtags and phrases (Possible / Likely rungs)
    hoverScan: true,            // mascot hover button on images & videos
    rules: { block: [], allow: [] } // entries look like "x:handle"
  };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function normalize(raw) {
    const s = clone(DEFAULTS);
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.enabled === 'boolean') s.enabled = raw.enabled;
    if (typeof raw.pausedUntil === 'number' && raw.pausedUntil >= 0) s.pausedUntil = raw.pausedUntil;
    if (raw.levels && typeof raw.levels === 'object') {
      for (const site of SITES) {
        if (LEVELS.includes(raw.levels[site.id])) s.levels[site.id] = raw.levels[site.id];
      }
    }
    if (typeof raw.blockIncludesLikely === 'boolean') s.blockIncludesLikely = raw.blockIncludesLikely;
    if (raw.blockStyle === 'note' || raw.blockStyle === 'remove') s.blockStyle = raw.blockStyle;
    if (typeof raw.useKeywords === 'boolean') s.useKeywords = raw.useKeywords;
    if (typeof raw.hoverScan === 'boolean') s.hoverScan = raw.hoverScan;
    if (raw.rules && typeof raw.rules === 'object') {
      const clean = (list) => Array.isArray(list)
        ? [...new Set(list.filter((k) => typeof k === 'string' && /^[a-z]+:.{1,100}$/.test(k)))]
        : [];
      s.rules.block = clean(raw.rules.block);
      s.rules.allow = clean(raw.rules.allow);
    }
    return s;
  }

  async function load() {
    const raw = await chrome.storage.sync.get(null);
    return normalize(raw);
  }

  async function save(patch) {
    await chrome.storage.sync.set(patch);
  }

  function isPaused(s, now) {
    return s.pausedUntil > (now || Date.now());
  }

  function ruleKey(siteId, handle) {
    return siteId + ':' + String(handle).trim().toLowerCase().replace(/^@/, '');
  }

  function siteName(id) {
    const site = SITES.find((x) => x.id === id);
    return site ? site.name : id;
  }

  root.ClariFiSettings = {
    SITES, LEVELS, DEFAULTS, PAUSE_FOREVER,
    normalize, load, save, isPaused, ruleKey, siteName
  };
})(globalThis);
