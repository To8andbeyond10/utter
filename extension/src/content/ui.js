// Clearband on-page UI. Everything renders inside shadow roots so site CSS
// can't break it and our CSS can't break the site. Post text is only ever
// inserted with textContent, never as HTML.
(function (root) {
  'use strict';

  const TOKENS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .t { --panel:#FFFFFF; --paper:#F3F6F5; --ink:#12202A; --slate:#56656F; --rule:#D6DEDB;
         --teal:#0B7F66; --teal-glass:#D3F1E7;
         --confirmed:#4A2FC9; --strong:#6B52DB; --likely:#9C88EC; --possible:#CFC5F7; --ai-soft:#EEEAFD;
         font-family: "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif;
         color: var(--ink); -webkit-font-smoothing: antialiased; }
    @media (prefers-color-scheme: dark) {
      .t { --panel:#15232A; --paper:#0E181D; --ink:#E4ECEA; --slate:#9AA9B0; --rule:#2B3D45;
           --teal:#3CC7A2; --teal-glass:rgba(60,199,162,.16); --ai-soft:rgba(143,123,242,.18); }
    }
    button { font: inherit; cursor: pointer; }
    button:focus-visible { outline: 3px solid var(--teal); outline-offset: 2px; }
  `;

  const LAYER_CSS = TOKENS + `
    .t { position: absolute; inset: 0; pointer-events: none; }
    .badge { position: absolute; pointer-events: auto; display: inline-flex; align-items: center; gap: 6px;
             border: 0; border-radius: 999px; padding: 5px 11px 5px 9px; font-size: 12.5px; font-weight: 650;
             line-height: 1.2; color: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.25); z-index: 3; white-space: nowrap; }
    .badge::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; opacity: .85; }
    .badge.confirmed { background: #4A2FC9; }
    .badge.strong { background: #6B52DB; }
    .badge.likely { background: #9C88EC; color: #1B1440; }
    .badge.possible { background: #CFC5F7; color: #1B1440; }
    .shield { position: absolute; inset: 0; pointer-events: auto; display: flex; align-items: center; justify-content: center;
              padding: 16px; text-align: center; z-index: 2;
              background: color-mix(in srgb, var(--panel) 74%, transparent);
              -webkit-backdrop-filter: blur(28px) saturate(.6); backdrop-filter: blur(28px) saturate(.6); }
    .shield[hidden], .note[hidden], .badge[hidden] { display: none; }
    .shield-inner { max-width: 280px; }
    .shield-title { margin: 0 0 4px; font-size: 15px; font-weight: 700; color: var(--ink); }
    .shield-sub { margin: 0 0 12px; font-size: 13px; color: var(--slate); }
    .reveal { border: 0; border-radius: 999px; padding: 8px 16px; font-size: 13.5px; font-weight: 650;
              background: var(--ink); color: var(--panel); }
    :host([data-mode="note"]) .t { position: relative; inset: auto; pointer-events: auto; }
    .note { display: flex; align-items: center; justify-content: space-between; gap: 12px; pointer-events: auto;
            margin: 6px 0; padding: 10px 14px; border: 1px dashed var(--rule); border-radius: 12px;
            background: var(--paper); font-size: 13.5px; color: var(--slate); }
    .note-text { display: inline-flex; align-items: center; gap: 8px; }
    .note-text::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--confirmed); flex: none; }
    .unhide { border: 0; background: none; color: var(--teal); font-weight: 650; font-size: 13px; padding: 4px; }
  `;

  const CARD_CSS = TOKENS + `
    .card { position: fixed; z-index: 2147483647; width: 320px; max-width: calc(100vw - 24px);
            background: var(--panel); color: var(--ink); border: 1.5px solid var(--ink); border-radius: 12px;
            padding: 14px 16px 16px; font-size: 13.5px; line-height: 1.45; box-shadow: 0 12px 32px rgba(18,32,42,.22); }
    .card[hidden] { display: none; }
    .top { display: flex; align-items: center; gap: 8px; margin: 0 0 2px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
    .title { margin: 0; font-size: 16px; font-weight: 700; }
    .sure { margin: 0 0 10px; color: var(--slate); font-size: 12.5px; }
    ul { margin: 0 0 10px; padding-left: 18px; }
    li { margin: 0 0 4px; }
    .acct { margin: 0 0 12px; padding: 7px 10px; border-radius: 8px; background: var(--ai-soft); font-size: 12.5px; }
    .acct[hidden] { display: none; }
    .acts { display: flex; flex-wrap: wrap; gap: 6px; }
    .acts button { border: 1.5px solid var(--rule); background: var(--paper); color: var(--ink);
                   border-radius: 999px; padding: 5px 11px; font-size: 12.5px; font-weight: 600; }
    .acts button[hidden] { display: none; }
    .acts button:disabled { opacity: .55; cursor: default; }
    .brand { margin: 12px 0 0; font-size: 11.5px; color: var(--slate); }
    .toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483647;
             background: var(--ink); color: var(--panel); padding: 10px 16px; border-radius: 999px;
             font-size: 13.5px; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,.25); }
    .toast[hidden] { display: none; }
  `;

  const RUNG_COLOR = { confirmed: '#4A2FC9', strong: '#6B52DB', likely: '#9C88EC', possible: '#CFC5F7' };
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

  const LAYER_TAG = 'clearband-layer';
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
    if (target.dataset.cbPos) return;
    if (getComputedStyle(target).position === 'static') {
      target.style.setProperty('position', 'relative');
      target.dataset.cbPos = 'set';
    } else {
      target.dataset.cbPos = 'kept';
    }
  }

  function pauseMedia(target) {
    target.querySelectorAll('video, audio').forEach((m) => {
      try { m.pause(); } catch (e) { /* ignore */ }
      if (!m.dataset.cbHooked) {
        m.dataset.cbHooked = '1';
        m.addEventListener('play', () => {
          const st = target.dataset.cbState;
          if (st === 'warned' || st === 'blocked-note' || st === 'blocked-remove') m.pause();
        });
      }
    });
  }

  /**
   * Draw Clearband on one post.
   * @param {Element} target  element the layer mounts on
   * @param {object} result   from ClearbandDetect.evaluate
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
    badge.textContent = badgeFor(result);
    const inset = site.badgeInset || { top: 8, right: 8 };
    badge.style.top = inset.top + 'px';
    badge.style.right = inset.right + 'px';
    badge.setAttribute('aria-label', 'Clearband: ' + titleFor(result) + '. Show why.');

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
      target.dataset.cbState = 'badged';
      ensurePositioned(target);
    } else if (action === 'warn') {
      target.dataset.cbState = 'warned';
      ensurePositioned(target);
      shield.hidden = false;
      s.querySelector('.shield-title').textContent = titleFor(result);
      s.querySelector('.shield-sub').textContent = SURE[rung];
      pauseMedia(target);
    } else if (action === 'block') {
      if (settings.blockStyle === 'remove') {
        target.dataset.cbState = 'blocked-remove';
      } else {
        target.dataset.cbState = 'blocked-note';
        host.setAttribute('data-mode', 'note');
        host.setAttribute('style', NOTE_STYLE);
        badge.hidden = true;
        note.hidden = false;
        s.querySelector('.note-text').textContent = 'Hidden by Clearband: ' + shortReason(result, site);
      }
      pauseMedia(target);
    }
  }

  function clear(target) {
    const host = target.querySelector(':scope > ' + LAYER_TAG);
    if (host) host.remove();
    delete target.dataset.cbState;
    if (target.dataset.cbPos === 'set') target.style.removeProperty('position');
    delete target.dataset.cbPos;
  }

  // ---------- Hover card (one per page) ----------

  const Card = (function () {
    let host, card, toastEl, toastTimer, showTimer, hideTimer, pinned = false, current = null;

    function build() {
      if (host && host.isConnected) return;
      host = document.createElement('clearband-card');
      host.setAttribute('style', 'position:fixed!important;inset:auto!important;width:0!important;height:0!important;z-index:2147483647!important;');
      const shadow = host.attachShadow({ mode: 'open' });
      const style = el('style'); style.textContent = CARD_CSS;
      const wrap = el('div', { class: 't' });
      card = el('div', { class: 'card', role: 'dialog', 'aria-label': 'Why Clearband flagged this post', hidden: '' });
      const top = el('div', { class: 'top' });
      top.append(el('span', { class: 'dot' }), el('p', { class: 'title' }));
      const acts = el('div', { class: 'acts' });
      acts.append(
        el('button', { type: 'button', 'data-act': 'hide' }),
        el('button', { type: 'button', 'data-act': 'allow' }),
        el('button', { type: 'button', 'data-act': 'report' }, 'Report a mistake'),
        el('button', { type: 'button', 'data-act': 'deep', disabled: '', title: 'Deep Scan arrives with the Investigator plan' }, 'Deep Scan (soon)')
      );
      card.append(top, el('p', { class: 'sure' }), el('ul'), el('p', { class: 'acct' }), acts, el('p', { class: 'brand' }, 'Clearband beta'));
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
      s.querySelector('.dot').style.background = RUNG_COLOR[result.rung];
      s.querySelector('.title').textContent = titleFor(result);
      s.querySelector('.sure').textContent = SURE[result.rung];
      const ul = s.querySelector('ul');
      ul.textContent = '';
      result.evidence.forEach((e) => ul.append(el('li', null, e.text)));
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
      if (!btn || !current || btn.disabled) return;
      e.preventDefault();
      const c = current;
      const act = btn.getAttribute('data-act');
      hide();
      if (act === 'hide') c.handlers.onAlwaysHide(c.result.author);
      if (act === 'allow') c.handlers.onAlwaysAllow(c.result.author);
      if (act === 'report') c.handlers.onReport(c.target, c.result);
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

  root.ClearbandUI = { decorate, clear, hideCard: Card.hide, toast: Card.toast, titleFor, LAYER_TAG };
})(globalThis);
