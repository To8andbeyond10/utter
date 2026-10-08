// ClariFi billing: plan tiers backed by ExtensionPay (ExtensionPay.com).
// Pure logic + thin messaging wrappers. Loaded in background (owns the
// ExtPay instance), popup, options, and content scripts.
(function (root) {
  'use strict';

  var TIERS = ['free', 'plus', 'investigator', 'family'];

  // ExtensionPay plan -> ClariFi tier, keyed by unitAmountCents.
  // Plus $4.99/mo or $49/yr, Investigator $9.99/mo or $99/yr, Family $12.99/mo or $129/yr.
  var PLAN_TIERS = {
    499: 'plus', 4900: 'plus',
    999: 'investigator', 9900: 'investigator',
    1299: 'family', 12900: 'family'
  };

  function tierForUser(user) {
    if (!user || !user.paid) return 'free';
    var cents = user.plan && user.plan.unitAmountCents;
    return PLAN_TIERS[cents] || 'plus'; // paid on an unknown plan: grant Plus, never less
  }

  function tierRank(tier) {
    var i = TIERS.indexOf(tier);
    return i < 0 ? 0 : i;
  }

  // feature: 'levels' (Warn/Block per-site levels) | 'deepscan'
  // Higher tiers include everything below them.
  function canUse(tier, feature) {
    if (feature === 'levels') return tierRank(tier) >= tierRank('plus');
    if (feature === 'deepscan') return tierRank(tier) >= tierRank('investigator');
    return true;
  }

  function hasChromeRuntime() {
    return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
  }

  // Ask the background service worker (the ExtPay owner) for the current tier.
  // Never throws: offline or unknown means 'free'.
  async function getTier() {
    if (!hasChromeRuntime()) return 'free';
    try {
      var res = await chrome.runtime.sendMessage({ type: 'clarifi-tier' });
      if (res && TIERS.indexOf(res.tier) >= 0) return res.tier;
    } catch (e) { /* fall through to free */ }
    return 'free';
  }

  // Open the ExtensionPay payment / subscription-management page.
  function openUpgrade() {
    if (!hasChromeRuntime()) return;
    try {
      chrome.runtime.sendMessage({ type: 'clarifi-upgrade' }).catch(function () {});
    } catch (e) { /* noop */ }
  }

  var LABELS = { free: 'Free', plus: 'Plus', investigator: 'Investigator', family: 'Family' };
  function tierLabel(tier) { return LABELS[tier] || 'Free'; }

  root.ClariFiBilling = {
    TIERS: TIERS,
    tierForUser: tierForUser,
    tierRank: tierRank,
    canUse: canUse,
    getTier: getTier,
    openUpgrade: openUpgrade,
    tierLabel: tierLabel
  };
})(globalThis);
