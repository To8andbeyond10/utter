// ClariFi on-page UI. Everything renders inside shadow roots so site CSS
// can't break it and our CSS can't break the site. Post text is only ever
// inserted with textContent, never as HTML.
(function (root) {
  'use strict';

  const TOKENS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .t { --panel:#FFFFFF; --paper:#F4F6F8; --ink:#141B22; --slate:#5B6B76; --rule:#E1E7EA;
         --brand:#4A2FC9; --brand-ink:#FFFFFF; --brand-soft:#EEEAFD;
         --c-confirmed:#6D28D9; --c-strong:#8B5CF6; --c-likely:#C77E1F; --c-possible:#9AA0A8;
         --shadow-card:0 1px 2px rgba(16,24,40,.06),0 16px 40px -12px rgba(16,24,40,.22);
         font-family: "Inter","Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;
         color: var(--ink); -webkit-font-smoothing: antialiased; }
    @media (prefers-color-scheme: dark) {
      .t { --panel:#151A20; --paper:#0B0E12; --ink:#E9EDEF; --slate:#98A4AE; --rule:#222B33;
           --brand:#8F7BF2; --brand-ink:#141126; --brand-soft:rgba(143,123,242,.16);
           --c-confirmed:#7C3AED; --c-strong:#A78BFA; --c-likely:#E8A33D; --c-possible:#8B9096;
           --shadow-card:0 1px 2px rgba(0,0,0,.35),0 16px 40px -12px rgba(0,0,0,.6); }
    }
    button { font: inherit; cursor: pointer; }
    button:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
    @keyframes cb-in { from { opacity: 0; transform: translateY(4px) scale(.98); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  `;

  const LAYER_CSS = TOKENS + `
    .t { position: absolute; inset: 0; pointer-events: none; }
    .badge { position: absolute; pointer-events: auto; display: inline-flex; align-items: center; gap: 6px;
             border: 1px solid rgba(255,255,255,.14); border-radius: 999px; padding: 4px 11px 4px 9px;
             font-size: 11.5px; font-weight: 600; letter-spacing: .015em; line-height: 1.2; color: #fff;
             background: rgba(16,20,26,.78);
             -webkit-backdrop-filter: blur(10px) saturate(1.25); backdrop-filter: blur(10px) saturate(1.25);
             box-shadow: 0 2px 10px rgba(0,0,0,.3); z-index: 3; white-space: nowrap;
             animation: cb-in .16s ease-out; transition: transform .14s ease-out; }
    .badge:hover { transform: translateY(-1px); }
    .badge .bdot { width: 7px; height: 7px; border-radius: 50%; background: var(--rc); flex: none; box-shadow: 0 0 4px var(--rc); }
    .badge.confirmed { --rc: var(--c-confirmed); }
    .badge.strong { --rc: var(--c-strong); }
    .badge.likely { --rc: var(--c-likely); }
    .badge.possible { --rc: var(--c-possible); }
    .shield { position: absolute; inset: 0; pointer-events: auto; display: flex; align-items: center; justify-content: center;
              padding: 18px; text-align: center; z-index: 2;
              background: color-mix(in srgb, var(--panel) 72%, transparent);
              -webkit-backdrop-filter: blur(30px) saturate(.55); backdrop-filter: blur(30px) saturate(.55); }
    .shield[hidden], .note[hidden], .badge[hidden] { display: none; }
    .shield-inner { max-width: 300px; animation: cb-in .18s ease-out; }
    .shield-title { margin: 0 0 5px; font-size: 16px; font-weight: 750; letter-spacing: -0.015em; color: var(--ink); }
    .shield-sub { margin: 0 0 14px; font-size: 13px; color: var(--slate); }
    .reveal { border: 0; border-radius: 999px; padding: 9px 20px; font-size: 13.5px; font-weight: 700;
              background: var(--brand); color: var(--brand-ink); box-shadow: 0 4px 16px rgba(74,47,201,.35);
              transition: transform .14s ease-out, box-shadow .14s ease-out; }
    .reveal:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(74,47,201,.42); }
    :host([data-mode="note"]) .t { position: relative; inset: auto; pointer-events: auto; }
    .note { display: flex; align-items: center; justify-content: space-between; gap: 12px; pointer-events: auto;
            margin: 6px 0; padding: 10px 14px; border: 1px dashed var(--rule); border-radius: 12px;
            background: var(--paper); font-size: 13px; color: var(--slate); animation: cb-in .16s ease-out; }
    .note-text { display: inline-flex; align-items: center; gap: 8px; }
    .note-text::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--brand); flex: none; }
    .unhide { border: 0; background: none; color: var(--brand); font-weight: 700; font-size: 13px; padding: 4px; }
  `;

  const CARD_CSS = TOKENS + `
    .card { position: fixed; z-index: 2147483647; width: 332px; max-width: calc(100vw - 24px);
            background: var(--panel); color: var(--ink);
            border: 1px solid color-mix(in srgb, var(--ink) 12%, transparent); border-radius: 16px;
            padding: 18px 20px 16px; font-size: 13.5px; line-height: 1.55;
            box-shadow: var(--shadow-card); animation: cb-in .16s ease-out; }
    .card[hidden] { display: none; }
    .top { display: flex; align-items: center; gap: 9px; margin: 0 0 8px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; flex: none;
           background: var(--rc); box-shadow: 0 0 9px var(--rc); }
    .title { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.015em; }
    .meter { display: flex; gap: 4px; margin: 0 0 6px; }
    .meter i { height: 3px; flex: 1; border-radius: 99px;
               background: color-mix(in srgb, var(--ink) 10%, transparent); }
    .meter i.on { background: var(--rc); box-shadow: 0 0 8px var(--rc); }
    .sure { margin: 0 0 10px; color: var(--slate); font-size: 12.5px; }
    ul.ev { margin: 0 0 12px; padding: 0; list-style: none; }
    ul.ev li { display: flex; gap: 9px; align-items: flex-start; margin: 0 0 7px; font-size: 13px; }
    ul.ev li::before { content: ""; width: 6px; height: 6px; border-radius: 50%;
                       background: var(--erc, var(--slate)); flex: none; margin-top: 7px; }
    .acct { margin: 0 0 12px; padding: 8px 11px; border-radius: 10px;
            background: var(--brand-soft); font-size: 12.5px; }
    .acct[hidden] { display: none; }
    .acts { display: flex; flex-wrap: wrap; gap: 6px; }
    .acts button { border: 1px solid var(--rule); background: var(--paper); color: var(--ink);
                   border-radius: 999px; padding: 6px 12px; font-size: 12.5px; font-weight: 600;
                   transition: border-color .14s ease-out, transform .14s ease-out; }
    .acts button:hover { border-color: var(--ink); }
    .acts button:active { transform: scale(.97); }
    .acts button[hidden] { display: none; }
    .upsell { display: flex; align-items: center; gap: 9px; width: 100%; margin-top: 10px;
              padding: 10px 13px; border: 0; border-radius: 12px; text-align: left;
              background: var(--brand-soft); color: var(--ink);
              font-size: 13px; font-weight: 600; transition: transform .14s ease-out; }
    .upsell:hover { transform: translateY(-1px); }
    .upsell .tag { margin-left: auto; font-size: 10.5px; font-weight: 800; letter-spacing: .07em;
                   text-transform: uppercase; color: var(--brand); }
    .brand { margin: 12px 0 0; font-size: 11px; letter-spacing: .05em; color: var(--slate); }
    .toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483647;
             background: rgba(16,20,26,.92); color: #fff; padding: 10px 18px; border-radius: 999px;
             font-size: 13.5px; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,.3);
             -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
             border: 1px solid rgba(255,255,255,.12); animation: cb-in .16s ease-out; }
    .toast[hidden] { display: none; }
  `;

  const RUNG_ORDER = ['possible', 'likely', 'strong', 'confirmed'];
  const SURE = {
    confirmed: 'Confirmed: the platform says so',
    strong: 'Strong evidence',
    likely: 'Likely, not confirmed',
    possible: 'Possible: weak signals only'
  };

  function titleFor(result) {
    const top = result.evidence[0];
    if (!top) return '';
    switch (top.kind) {
      case 'label': return 'Labeled AI';
      case 'flair': return 'Marked AI';
      case 'rule': return 'On your always-hide list';
      case 'disclosure': return "Says it's AI";
      case 'combined': return 'Likely AI';
      default: return 'Possibly AI';
    }
  }

  function badgeFor(result) {
    const t = titleFor(result);
    return t === 'On your always-hide list' ? 'On your list' : t;
  }

  function shortReason(result, site) {
    const top = result.evidence[0];
    if (!top) return '';
    if (top.kind === 'label') return 'labeled AI by ' + site.name;
    if (top.kind === 'flair') return 'marked as AI';
    if (top.kind === 'rule') return 'account on your always-hide list';
    if (top.kind === 'disclosure') return 'the post says it\u2019s AI';
    if (top.kind === 'combined') return 'likely AI';
    return 'possibly AI';
  }

  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (text != null) node.textContent = text;
    return node;
  }

  // ---------- Per-post layer ----------

  const LAYER_TAG = 'clarifi-layer';
  const OVERLAY_STYLE = 'position:absolute!important;inset:0!important;z-index:2147483000!important;pointer-events:none!important;display:block!important;margin:0!important;padding:0!important;border:0!important;background:none!important;';
  const NOTE_STYLE = 'position:relative!important;display:block!important;pointer-events:auto!important;margin:0!important;padding:0!important;border:0!important;background:none!important;';

  function getLayer(target) {
    let host = target.querySelector(':scope > ' + LAYER_TAG);
    if (host) return host;
    host = document.createElement(LAYER_TAG);
    const shadow = host.attachShadow({ mode: 'open' });
    const style = el('style'); style.textContent = LAYER_CSS;
    const wrap = el('div', { class: 't' });
    const badge = el('button', { class: 'badge', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
    const shield = el('div', { class: 'shield', hidden: '' });
    const inner = el('div', { class: 'shield-inner' });
    inner.append(el('p', { class: 'shield-title' }), el('p', { class: 'shield-sub' }), el('button', { class: 'reveal', type: 'button' }, 'Show post'));
    shield.append(inner);
    const note = el('div', { class: 'note', hidden: '' });
    note.append(el('span', { class: 'note-text' }), el('button', { class: 'unhide', type: 'button' }, 'Show anyway'));
    wrap.append(badge, shield, note);
    shadow.append(style, wrap);
    target.prepend(host);
    return host;
  }

  function ensurePositioned(target) {
    if (target.dataset.cfPos) return;
    if (getComputedStyle(target).position === 'static') {
      target.style.setProperty('position', 'relative');
      target.dataset.cfPos = 'set';
    } else {
      target.dataset.cfPos = 'kept';
    }
  }

  function pauseMedia(target) {
    target.querySelectorAll('video, audio').forEach((m) => {
      try { m.pause(); } catch (e) { /* ignore */ }
      if (!m.dataset.cfHooked) {
        m.dataset.cfHooked = '1';
        m.addEventListener('play', () => {
          const st = target.dataset.cfState;
          if (st === 'warned' || st === 'blocked-note' || st === 'blocked-remove') m.pause();
        });
      }
    });
  }

  /**
   * Draw ClariFi on one post.
   * @param {Element} target  element the layer mounts on
   * @param {object} result   from ClariFiDetect.evaluate
   * @param {string} action   'badge' | 'warn' | 'block'
   */
  function decorate(target, result, action, site, settings, handlers) {
    const host = getLayer(target);
    const s = host.shadowRoot;
    const badge = s.querySelector('.badge');
    const shield = s.querySelector('.shield');
    const note = s.querySelector('.note');
    const rung = result.rung;

    badge.className = 'badge ' + rung;
    badge.textContent = '';
    badge.append(el('span', { class: 'bdot', 'aria-hidden': 'true' }), document.createTextNode(badgeFor(result)));
    const inset = site.badgeInset || { top: 8, right: 8 };
    badge.style.top = inset.top + 'px';
    badge.style.right = inset.right + 'px';
    badge.setAttribute('aria-label', 'ClariFi: ' + titleFor(result) + '. Show why.');

    badge.onmouseenter = () => Card.hoverIn(badge, result, site, target, handlers);
    badge.onmouseleave = () => Card.hoverOut();
    badge.onclick = (e) => { e.preventDefault(); e.stopPropagation(); Card.toggle(badge, result, site, target, handlers); };

    s.querySelector('.reveal').onclick = (e) => { e.preventDefault(); e.stopPropagation(); handlers.onReveal(target); };
    s.querySelector('.unhide').onclick = (e) => { e.preventDefault(); e.stopPropagation(); handlers.onUnhide(target); };

    shield.hidden = true;
    note.hidden = true;
    badge.hidden = false;
    host.removeAttribute('data-mode');
    host.setAttribute('style', OVERLAY_STYLE);

    if (action === 'badge') {
      target.dataset.cfState = 'badged';
      ensurePositioned(target);
    } else if (action === 'warn') {
      target.dataset.cfState = 'warned';
      ensurePositioned(target);
      shield.hidden = false;
      s.querySelector('.shield-title').textContent = titleFor(result);
      s.querySelector('.shield-sub').textContent = SURE[rung];
      pauseMedia(target);
    } else if (action === 'block') {
      if (settings.blockStyle === 'remove') {
        target.dataset.cfState = 'blocked-remove';
      } else {
        target.dataset.cfState = 'blocked-note';
        host.setAttribute('data-mode', 'note');
        host.setAttribute('style', NOTE_STYLE);
        badge.hidden = true;
        note.hidden = false;
        s.querySelector('.note-text').textContent = 'Hidden by ClariFi: ' + shortReason(result, site);
      }
      pauseMedia(target);
    }
  }

  function clear(target) {
    const host = target.querySelector(':scope > ' + LAYER_TAG);
    if (host) host.remove();
    delete target.dataset.cfState;
    if (target.dataset.cfPos === 'set') target.style.removeProperty('position');
    delete target.dataset.cfPos;
  }

  // ---------- Hover card (one per page) ----------

  const Card = (function () {
    let host, card, meter, toastEl, toastTimer, showTimer, hideTimer, pinned = false, current = null;

    function build() {
      if (host && host.isConnected) return;
      host = document.createElement('clarifi-card');
      host.setAttribute('style', 'position:fixed!important;inset:auto!important;width:0!important;height:0!important;z-index:2147483647!important;');
      const shadow = host.attachShadow({ mode: 'open' });
      const style = el('style'); style.textContent = CARD_CSS;
      const wrap = el('div', { class: 't' });
      card = el('div', { class: 'card', role: 'dialog', 'aria-label': 'Why ClariFi flagged this post', hidden: '' });
      const top = el('div', { class: 'top' });
      top.append(el('span', { class: 'dot' }), el('p', { class: 'title' }));
      meter = el('div', { class: 'meter', 'aria-hidden': 'true' });
      for (let i = 0; i < 4; i++) meter.append(el('i'));
      const acts = el('div', { class: 'acts' });
      acts.append(
        el('button', { type: 'button', 'data-act': 'hide' }),
        el('button', { type: 'button', 'data-act': 'allow' }),
        el('button', { type: 'button', 'data-act': 'report' }, 'Report a mistake')
      );
      const upsell = el('button', { type: 'button', class: 'upsell', 'data-act': 'deep' });
      upsell.append(
        el('span', null, 'Deep Scan'),
        el('span', { class: 'tag' }, 'Investigator')
      );
      card.append(top, meter, el('p', { class: 'sure' }), el('ul', { class: 'ev' }), el('p', { class: 'acct' }), acts, upsell, el('p', { class: 'brand' }, 'ClariFi'));
      toastEl = el('div', { class: 'toast', role: 'status', hidden: '' });
      wrap.append(card, toastEl);
      shadow.append(style, wrap);
      document.documentElement.append(host);

      card.addEventListener('mouseenter', () => clearTimeout(hideTimer));
      card.addEventListener('mouseleave', () => { if (!pinned) scheduleHide(); });
      card.addEventListener('click', onAction);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); }, true);
      window.addEventListener('scroll', () => { if (!card.hidden) hide(); }, { passive: true, capture: true });
      document.addEventListener('click', (e) => {
        if (!card.hidden && !e.composedPath().includes(host) && !(current && e.composedPath().includes(current.badge))) hide();
      }, true);
    }

    function fill(result, site) {
      const s = card;
      card.style.setProperty('--rc', 'var(--c-' + result.rung + ')');
      const filled = RUNG_ORDER.indexOf(result.rung) + 1;
      Array.prototype.forEach.call(meter.children, (seg, i) => seg.classList.toggle('on', i < filled));
      s.querySelector('.title').textContent = titleFor(result);
      s.querySelector('.sure').textContent = SURE[result.rung];
      const ul = s.querySelector('ul.ev');
      ul.textContent = '';
      result.evidence.forEach((e) => {
        const li = el('li');
        li.style.setProperty('--erc', 'var(--c-' + e.rung + ')');
        li.textContent = e.text;
        ul.append(li);
      });
      const acct = s.querySelector('.acct');
      const hideBtn = s.querySelector('[data-act="hide"]');
      const allowBtn = s.querySelector('[data-act="allow"]');
      if (result.author) {
        const name = site.id === 'facebook' ? result.author : '@' + result.author.replace(/^@/, '');
        acct.hidden = false;
        acct.textContent = 'Posted by ' + name + ' on ' + site.name;
        hideBtn.hidden = false; allowBtn.hidden = false;
        hideBtn.textContent = 'Always hide ' + name;
        allowBtn.textContent = 'Always allow ' + name;
        const onList = result.evidence.some((e) => e.kind === 'rule');
        hideBtn.hidden = onList;
      } else {
        acct.hidden = true; hideBtn.hidden = true; allowBtn.hidden = true;
      }
    }

    function place(badge) {
      const r = badge.getBoundingClientRect();
      card.hidden = false;
      const w = card.offsetWidth, h = card.offsetHeight;
      let left = Math.min(Math.max(12, r.right - w), window.innerWidth - w - 12);
      let topPos = r.bottom + 8;
      if (topPos + h > window.innerHeight - 12 && r.top - h - 8 > 12) topPos = r.top - h - 8;
      card.style.left = left + 'px';
      card.style.top = Math.max(12, topPos) + 'px';
    }

    function show(badge, result, site, target, handlers) {
      build();
      if (current && current.badge !== badge) current.badge.setAttribute('aria-expanded', 'false');
      current = { badge, result, site, target, handlers };
      fill(result, site);
      place(badge);
      badge.setAttribute('aria-expanded', 'true');
    }

    function hide() {
      clearTimeout(showTimer); clearTimeout(hideTimer);
      pinned = false;
      if (card) card.hidden = true;
      if (current) current.badge.setAttribute('aria-expanded', 'false');
      current = null;
    }

    function scheduleHide() {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { if (!pinned) hide(); }, 260);
    }

    function hoverIn(badge, result, site, target, handlers) {
      clearTimeout(hideTimer);
      if (pinned) return;
      clearTimeout(showTimer);
      showTimer = setTimeout(() => show(badge, result, site, target, handlers), 140);
    }

    function hoverOut() {
      clearTimeout(showTimer);
      if (!pinned) scheduleHide();
    }

    function toggle(badge, result, site, target, handlers) {
      if (current && current.badge === badge && !card.hidden && pinned) { hide(); return; }
      show(badge, result, site, target, handlers);
      pinned = true;
    }

    function onAction(e) {
      const btn = e.target.closest('button[data-act]');
      if (!btn || !current) return;
      e.preventDefault();
      const c = current;
      const act = btn.getAttribute('data-act');
      if (act === 'deep') {
        deepScanOrUpsell();
        return;
      }
      hide();
      if (act === 'hide') c.handlers.onAlwaysHide(c.result.author);
      if (act === 'allow') c.handlers.onAlwaysAllow(c.result.author);
      if (act === 'report') c.handlers.onReport(c.target, c.result);
    }

    function deepScanOrUpsell() {
      const B = root.ClariFiBilling;
      const hasRuntime = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
      if (!B || !hasRuntime) { toast('Deep Scan arrives with the Investigator plan'); return; }
      chrome.runtime.sendMessage({ type: 'clarifi-tier' }).then((res) => {
        const t = (res && res.tier) || 'free';
        if (B.canUse(t, 'deepscan')) {
          toast('Deep Scan is coming soon — investigators get it first');
        } else {
          toast('Deep Scan is part of the Investigator plan');
          try { chrome.runtime.sendMessage({ type: 'clarifi-upgrade' }).catch(function () {}); } catch (e) {}
        }
      }).catch(() => toast('Deep Scan arrives with the Investigator plan'));
    }

    function toast(msg) {
      build();
      toastEl.textContent = msg;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200);
    }

    return { hoverIn, hoverOut, toggle, hide, toast };
  })();

  // ---------- Mascot hover-scan ----------

  const HOVER_TAG = 'clarifi-hover';
  const HOVER_CSS = TOKENS + `
    .t { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
    .hs { position: absolute; pointer-events: auto; width: 34px; height: 34px; padding: 0;
          border-radius: 50%; border: 1px solid rgba(255,255,255,.25); background: rgba(10,8,24,.85);
          cursor: pointer; opacity: 0; transform: scale(.85);
          box-shadow: 0 0 14px rgba(143,123,242,.55), 0 4px 14px rgba(0,0,0,.4);
          transition: opacity .14s ease-out, transform .14s ease-out;
          -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
    .hs.show { opacity: 1; transform: none; }
    .hs img { width: 100%; height: 100%; border-radius: 50%; display: block; }
    .hs:focus-visible { outline: 2px solid #8F7BF2; outline-offset: 2px; }
  `;

  /**
   * Gather checkable context around a media element. Pure helper:
   * reads the element and its ancestors only, never writes.
   * @param {Element} media  an <img> or <video>
   * @returns {string} up to 500 chars of alt text, captions and nearby copy
   */
  function gatherMediaContext(media) {
    const parts = [];
    const push = (v) => {
      if (typeof v === 'string') {
        const t = v.replace(/\s+/g, ' ').trim();
        if (t) parts.push(t);
      }
    };
    push(media.getAttribute('alt'));
    push(media.getAttribute('title'));
    push(media.getAttribute('aria-label'));
    const fig = media.closest('figure');
    if (fig) {
      const cap = fig.querySelector('figcaption');
      if (cap) push(cap.textContent);
    }
    const doc = media.ownerDocument;
    let node = media.parentElement, depth = 0;
    while (node && depth < 6 && node !== doc.body && node !== doc.documentElement) {
      const cls = (node.getAttribute && node.getAttribute('class')) || '';
      if (/^(ARTICLE|FIGURE|BLOCKQUOTE)$/.test(node.tagName) ||
          /(^|\s)(post|tweet|article|feed|card|message|content)(\s|$)/i.test(cls)) {
        push(node.textContent);
        break;
      }
      node = node.parentElement; depth++;
    }
    return parts.join('\n').slice(0, 500);
  }

  const HoverScan = (function () {
    let deps = null;
    let host = null, btn = null, currentMedia = null;
    let lastMove = 0;

    function iconUrl() {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
          return chrome.runtime.getURL('icons/icon32.png');
        }
      } catch (e) { /* ignore */ }
      return 'icons/icon32.png';
    }

    function ensureButton() {
      if (host && host.isConnected) return btn;
      host = document.createElement(HOVER_TAG);
      const shadow = host.attachShadow({ mode: 'open' });
      const style = el('style'); style.textContent = HOVER_CSS;
      const wrap = el('div', { class: 't' });
      btn = el('button', { class: 'hs', type: 'button', 'aria-label': 'ClariFi: check this media' });
      const img = el('img', { alt: '' });
      img.src = iconUrl();
      btn.append(img);
      btn.addEventListener('click', onClick);
      wrap.append(btn);
      shadow.append(style, wrap);
      document.documentElement.append(host);
      return btn;
    }

    function ours(node) {
      return !!host && (node === host || host.contains(node));
    }

    function eligible(media) {
      if (!media || media.closest('clarifi-layer, clarifi-card, clarifi-hover')) return false;
      if (media.closest('[data-cf-flag]')) return false; // already badged: redundant
      let r;
      try { r = media.getBoundingClientRect(); } catch (e) { return false; }
      return r.width >= 48 && r.height >= 48;
    }

    function showFor(media) {
      const b = ensureButton();
      const r = media.getBoundingClientRect();
      b.style.left = Math.max(8, Math.min(r.right - 40, window.innerWidth - 42)) + 'px';
      b.style.top = Math.max(8, r.top + 6) + 'px';
      currentMedia = media;
      requestAnimationFrame(() => b.classList.add('show'));
    }

    function hide() {
      currentMedia = null;
      if (btn) btn.classList.remove('show');
    }

    function onMouseOver(e) {
      if (ours(e.target)) return;
      const now = Date.now();
      if (now - lastMove < 80) return; // throttle
      lastMove = now;
      if (!deps || !deps.getSettings().hoverScan || !deps.isActive()) { hide(); return; }
      const t = e.target;
      const media = t && t.closest ? t.closest('img,video') : null;
      if (media && eligible(media)) {
        if (media !== currentMedia) showFor(media);
      } else {
        hide();
      }
    }

    function onMouseOut(e) {
      if (ours(e.relatedTarget)) return; // moving onto our button: keep it
      if (currentMedia && (!e.relatedTarget || !currentMedia.contains(e.relatedTarget))) hide();
    }

    function onScroll() { hide(); }

    function onClick(e) {
      e.preventDefault();
      e.stopPropagation(); // never trigger the page's own media click
      const media = currentMedia;
      hide();
      if (!media || !media.isConnected || !deps) return;
      let result = null;
      try {
        const ctx = document.createElement('div');
        ctx.textContent = gatherMediaContext(media);
        result = deps.evaluate(ctx, deps.site, deps.getSettings());
      } catch (err) { return; }
      if (result && result.rung) {
        Card.toggle(btn, result, deps.site, media, {
          onReveal: () => Card.hide(),
          onUnhide: () => Card.hide(),
          onAlwaysHide: () => Card.toast('Use a badge card to manage account rules.'),
          onAlwaysAllow: () => Card.toast('Use a badge card to manage account rules.'),
          onReport: (t, r) => deps.onReport(media, r)
        });
      } else {
        Card.toast('ClariFi found no AI signals around this media.');
      }
    }

    function init(d) {
      if (deps) return; // idempotent
      deps = d;
      document.addEventListener('mouseover', onMouseOver, { passive: true });
      document.addEventListener('mouseout', onMouseOut, { passive: true });
      window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    }

    return { init, hide };
  })();

  function initHoverScan(deps) { HoverScan.init(deps); }
  function hideHoverScan() { HoverScan.hide(); }

  root.ClariFiUI = { decorate, clear, hideCard: Card.hide, toast: Card.toast, titleFor, LAYER_TAG, initHoverScan, hideHoverScan, gatherMediaContext };
})(globalThis);
