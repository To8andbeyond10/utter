// ClariFi detection core. Gathers evidence for one post and ranks it on
// the evidence ladder: confirmed > strong > likely > possible.
// Beta scope: platform labels, flair, creator disclosures, hashtags,
// and the user's own account rules. Detector models come in v0.2.
(function (root) {
  'use strict';

  const RUNGS = ['possible', 'likely', 'strong', 'confirmed'];
  const rank = (r) => RUNGS.indexOf(r);

  const AI_TOOLS = [
    'ai', 'a\\.i\\.', 'artificial intelligence', 'midjourney', 'sora(?: ?2)?', 'veo(?: ?\\d)?',
    'dall[\\s\\-\u00b7]?e(?: ?\\d)?', 'stable ?diffusion', 'runway(?:ml)?', 'kling(?: ai)?', 'pika',
    'adobe firefly', 'firefly', 'flux', 'grok(?: imagine)?', 'leonardo(?: ai)?', 'ideogram', 'chatgpt',
    'gemini', 'imagen', 'hailuo', 'luma(?: dream machine)?', 'suno', 'udio', 'elevenlabs', 'heygen', 'synthesia'
  ].join('|');

  // "made with Midjourney", "generated using AI", "created by Sora"...
  const DISCLOSURE = new RegExp(
    '\\b(?:made|created|generated|produced|rendered|animated|designed|voiced|composed)\\s+' +
    '(?:entirely\\s+|fully\\s+|completely\\s+)?(?:with|using|by|in|via|on)\\s+(?:' + AI_TOOLS + ')(?![a-z])',
    'gi'
  );
  // Words right before a match that flip its meaning: "NOT made with AI".
  const NEGATION = /\b(?:not|never|no|without|isn'?t|wasn'?t|aren'?t|weren'?t|zero|nothing)\b[^.!?\n]{0,30}$/i;
  const AI_PHRASE = /\b(?:ai[\s-]generated|ai[\s-]made|ai[\s-]created|ai art(?:work)?|ai video|ai image)\b/i;

  const AI_TAGS = new Set([
    'ai', 'aiart', 'aiartwork', 'aiartcommunity', 'aigenerated', 'aigeneratedart', 'aigeneratedimage',
    'aivideo', 'aivideos', 'aiimage', 'aiimages', 'aiphoto', 'aiphotography', 'aiartist', 'aicreator',
    'aimodel', 'aiinfluencer', 'aigirl', 'aibaby', 'aianimals', 'aianimation', 'aifilm', 'aimusic',
    'midjourney', 'midjourneyart', 'midjourneyai', 'stablediffusion', 'dalle', 'dalle3', 'sora', 'soraai',
    'veo', 'veo3', 'kling', 'klingai', 'runwayml', 'pikaart', 'fluxai', 'generativeart', 'generativeai',
    'madewithai', 'aicontent', 'synthography'
  ]);

  function norm(s) {
    return String(s).toLowerCase().replace(/[\s\u00a0]+/g, ' ').replace(/[\s\u00b7\u2022|:.]+$/g, '').trim();
  }

  // Short standalone pieces of text (and aria-labels) inside a post.
  // Platform labels live in these, separate from the caption.
  function shortTexts(post, limit) {
    const out = [];
    const max = limit || 600;
    const walker = post.ownerDocument.createTreeWalker(post, NodeFilter.SHOW_TEXT);
    let n = 0;
    while (walker.nextNode() && n < max) {
      const t = walker.currentNode.nodeValue;
      if (!t) continue;
      const trimmed = t.trim();
      if (trimmed && trimmed.length <= 80) { out.push(trimmed); n++; }
    }
    const labelled = post.querySelectorAll('[aria-label], [title]');
    for (let i = 0; i < labelled.length && i < 200; i++) {
      const v = labelled[i].getAttribute('aria-label') || labelled[i].getAttribute('title');
      if (v && v.length <= 120) out.push(v.trim());
    }
    return out;
  }

  function matchLabel(texts, labels) {
    if (!labels || !labels.length) return null;
    const wanted = labels.map((l) => ({ label: l, n: norm(l) }));
    for (const t of texts) {
      const nt = norm(t);
      for (const w of wanted) {
        if (nt === w.n) return w.label;
        // Tolerate a short suffix like "AI info Learn more", never a long sentence.
        if (nt.startsWith(w.n + ' ') && nt.length <= w.n.length + 16) return w.label;
      }
    }
    return null;
  }

  function findDisclosure(text) {
    DISCLOSURE.lastIndex = 0;
    let m;
    while ((m = DISCLOSURE.exec(text))) {
      const before = text.slice(Math.max(0, m.index - 40), m.index);
      if (NEGATION.test(before)) continue;
      // Skip questions: "was this made with AI?"
      const rest = text.slice(m.index, m.index + 120);
      const end = rest.search(/[.!?\n]/);
      if (end !== -1 && rest[end] === '?') continue;
      return m[0];
    }
    return null;
  }

  function findTags(text) {
    const tags = new Set();
    const re = /#([\p{L}\p{N}_]{2,40})/gu;
    let m;
    while ((m = re.exec(text))) {
      const tag = m[1].toLowerCase();
      if (AI_TAGS.has(tag)) tags.add('#' + tag);
    }
    return [...tags];
  }

  // The post's text with a space between text nodes. textContent runs
  // neighbouring elements together, so "#aiart" + "2h" would read "#aiart2h".
  function fullText(post, limit) {
    const parts = [];
    let len = 0;
    const walker = post.ownerDocument.createTreeWalker(post, NodeFilter.SHOW_TEXT);
    while (walker.nextNode() && len < limit) {
      const t = walker.currentNode.nodeValue;
      if (t && t.trim()) { parts.push(t); len += t.length + 1; }
    }
    return parts.join(' ').slice(0, limit);
  }

  function add(evidence, rung, kind, text) {
    evidence.push({ rung, kind, text });
  }

  /**
   * @param {Element} post
   * @param {object} site   entry from ClariFiSites
   * @param {object} settings  normalized ClariFiSettings
   * @returns {{rung: string|null, evidence: Array, author: string|null, allowed: boolean}}
   */
  function evaluate(post, site, settings) {
    const evidence = [];
    let author = null;
    try { author = site.author(post); } catch (e) { author = null; }

    const key = author ? root.ClariFiSettings.ruleKey(site.id, author) : null;
    if (key && settings.rules.allow.includes(key)) {
      return { rung: null, evidence, author, allowed: true };
    }

    const texts = shortTexts(post);

    const label = matchLabel(texts, site.labels);
    if (label) add(evidence, 'confirmed', 'label', site.name + ' shows its "' + label + '" label');

    const flair = matchLabel(texts, site.disclosures);
    if (flair) add(evidence, 'strong', 'flair', 'Marked "' + flair + '" by the poster or community');

    if (key && settings.rules.block.includes(key)) {
      add(evidence, 'strong', 'rule', (author.startsWith('@') ? author : '@' + author) + ' is on your always-hide list');
    }

    const full = fullText(post, 5000);

    const said = findDisclosure(full);
    if (said) add(evidence, 'strong', 'disclosure', 'The post says "' + said.trim().slice(0, 48) + '"');

    if (settings.useKeywords) {
      const tags = findTags(full);
      if (tags.length) add(evidence, 'possible', 'tags', 'Uses AI hashtags: ' + tags.slice(0, 4).join(', '));
      const phrase = full.match(AI_PHRASE);
      let phraseCounted = false;
      if (phrase && !said) {
        const before = full.slice(Math.max(0, phrase.index - 40), phrase.index);
        if (!NEGATION.test(before)) {
          add(evidence, 'possible', 'phrase', 'Mentions "' + phrase[0] + '"');
          phraseCounted = true;
        }
      }
      // Several weak signals lining up make a Likely.
      const weak = tags.length + (phraseCounted ? 1 : 0);
      if (weak >= 3 && !evidence.some((e) => rank(e.rung) >= rank('likely'))) {
        add(evidence, 'likely', 'combined', 'Several weaker AI signals line up');
      }
    }

    let rung = null;
    for (const e of evidence) if (rung === null || rank(e.rung) > rank(rung)) rung = e.rung;
    evidence.sort((a, b) => rank(b.rung) - rank(a.rung));
    return { rung, evidence, author, allowed: false };
  }

  /** What the chosen level does with a post at this rung. */
  function actionFor(rung, level, settings) {
    if (!rung || level === 'off') return 'none';
    if (level === 'inform') return 'badge';
    const hard = rung === 'confirmed' || rung === 'strong';
    if (level === 'warn') return rung === 'possible' ? 'badge' : 'warn';
    if (level === 'block') {
      if (hard) return 'block';
      if (rung === 'likely') return settings.blockIncludesLikely ? 'block' : 'warn';
      return 'badge';
    }
    return 'badge';
  }

  root.ClariFiDetect = { RUNGS, rank, evaluate, actionFor, findDisclosure, findTags, matchLabel, norm };
})(globalThis);
