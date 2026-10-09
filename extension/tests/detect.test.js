// Run: npm install jsdom && node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const path = require('node:path');
const fs = require('node:fs');

const dom = new JSDOM('<!doctype html><body></body>');
global.window = dom.window;
global.document = dom.window.document;
global.NodeFilter = dom.window.NodeFilter;
for (const f of ['src/shared/settings.js', 'src/content/sites.js', 'src/content/detect.js', 'src/content/ui.js']) {
  new Function(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'))();
}
const S = globalThis.ClariFiSettings;
const D = globalThis.ClariFiDetect;
const UI = globalThis.ClariFiUI;
const site = (id) => globalThis.ClariFiSites.SITES.find((s) => s.id === id);

function post(html, selector) {
  document.body.innerHTML = html;
  return document.querySelector(selector);
}
function run(siteId, html, selector, settingsPatch) {
  const settings = S.normalize(Object.assign({}, settingsPatch));
  return D.evaluate(post(html, selector), site(siteId), settings);
}

test('Instagram "AI info" label is Confirmed', () => {
  const r = run('instagram', '<article><header><a href="/petvids/">petvids</a></header><span>AI info</span><span>Cute video</span></article>', 'article');
  assert.equal(r.rung, 'confirmed');
  assert.equal(r.author, 'petvids');
  assert.match(r.evidence[0].text, /Instagram shows its "AI info" label/);
});

test('A caption that merely mentions "AI info" is not a label', () => {
  const r = run('instagram', '<article><span>Some AI info for you today about how models work and why it matters</span></article>', 'article', { useKeywords: false });
  assert.equal(r.rung, null);
});

test('YouTube synthetic content label is Confirmed', () => {
  const r = run('youtube', '<ytd-watch-metadata><a href="/@newsnow">News</a><div>How this content was made</div><div>Altered or synthetic content</div></ytd-watch-metadata>', 'ytd-watch-metadata');
  assert.equal(r.rung, 'confirmed');
  assert.equal(r.author, 'newsnow');
});

test('TikTok creator AI label is Confirmed', () => {
  const r = run('tiktok', '<article data-e2e="recommend-list-item-container"><span>Creator labeled as AI-generated</span></article>', 'article');
  assert.equal(r.rung, 'confirmed');
});

test('X post disclosing Midjourney is Strong', () => {
  const r = run('x', '<article data-testid="tweet"><div data-testid="User-Name"><a href="/artguy">Art Guy</a></div><div>New piece, made with Midjourney v7. Prompt in replies.</div></article>', 'article');
  assert.equal(r.rung, 'strong');
  assert.equal(r.author, 'artguy');
  assert.match(r.evidence[0].text, /made with Midjourney/);
});

test('Negated disclosure is ignored', () => {
  const r = run('x', '<article data-testid="tweet"><div>This is NOT made with AI, I painted it by hand.</div></article>', 'article', { useKeywords: false });
  assert.equal(r.rung, null);
});

test('A question about AI is ignored', () => {
  const r = run('x', '<article data-testid="tweet"><div>Was this made with AI? Looks off to me</div></article>', 'article', { useKeywords: false });
  assert.equal(r.rung, null);
});

test('Three AI hashtags together are Likely', () => {
  const r = run('instagram', '<article><span>Sunset dreams #aiart #midjourney #aigenerated</span></article>', 'article');
  assert.equal(r.rung, 'likely');
});

test('One AI hashtag alone is Possible', () => {
  const r = run('instagram', '<article><span>Sunset dreams #aiart #sunset</span></article>', 'article');
  assert.equal(r.rung, 'possible');
});

test('Hashtags are ignored when keywords are off', () => {
  const r = run('instagram', '<article><span>#aiart #midjourney #aigenerated</span></article>', 'article', { useKeywords: false });
  assert.equal(r.rung, null);
});

test('Reddit "AI Art" flair is Strong; a bare "AI" topic flair is not', () => {
  const a = run('reddit', '<article><shreddit-post author="painter"><span>AI Art</span><h1>Castle</h1></shreddit-post></article>', 'shreddit-post', { useKeywords: false });
  assert.equal(a.rung, 'strong');
  assert.equal(a.author, 'painter');
  const b = run('reddit', '<article><shreddit-post author="reporter"><span>AI</span><h1>New chip announced</h1></shreddit-post></article>', 'shreddit-post', { useKeywords: false });
  assert.equal(b.rung, null);
});

test('Always-hide account is Strong; always-allow skips everything', () => {
  const html = '<article data-testid="tweet"><div data-testid="User-Name"><a href="/slopfarm">Slop</a></div><div>Look at this</div></article>';
  const hidden = run('x', html, 'article', { rules: { block: ['x:slopfarm'], allow: [] } });
  assert.equal(hidden.rung, 'strong');
  const allowed = run('x', '<article data-testid="tweet"><div data-testid="User-Name"><a href="/artguy">A</a></div><span>Made with AI</span></article>', 'article', { rules: { block: [], allow: ['x:artguy'] } });
  assert.equal(allowed.rung, null);
  assert.equal(allowed.allowed, true);
});

test('Levels map to the right action', () => {
  const s = S.normalize(null);
  assert.equal(D.actionFor('possible', 'inform', s), 'badge');
  assert.equal(D.actionFor('likely', 'warn', s), 'warn');
  assert.equal(D.actionFor('possible', 'warn', s), 'badge');
  assert.equal(D.actionFor('confirmed', 'block', s), 'block');
  assert.equal(D.actionFor('likely', 'block', s), 'warn');
  assert.equal(D.actionFor('likely', 'block', S.normalize({ blockIncludesLikely: true })), 'block');
  assert.equal(D.actionFor('confirmed', 'off', s), 'none');
});

test('Settings reject junk values', () => {
  const s = S.normalize({ levels: { youtube: 'nuke' }, blockStyle: 'explode', rules: { block: ['x:ok', 42, 'bad'] } });
  assert.equal(s.levels.youtube, 'inform');
  assert.equal(s.blockStyle, 'note');
  assert.deepEqual(s.rules.block, ['x:ok']);
});

test('hoverScan defaults on and normalizes booleans', () => {
  assert.equal(S.normalize(null).hoverScan, true);
  assert.equal(S.normalize({ hoverScan: false }).hoverScan, false);
  assert.equal(S.normalize({ hoverScan: 'yes' }).hoverScan, true); // junk ignored
});

test('gatherMediaContext collects alt, title, caption and nearby text', () => {
  document.body.innerHTML = '<article class="post"><figure><img alt="tiger cub" title="AI video"><figcaption>Made with Luma #aiart</figcaption></figure></article>';
  const ctx = UI.gatherMediaContext(document.querySelector('img'));
  assert.match(ctx, /tiger cub/);
  assert.match(ctx, /AI video/);
  assert.match(ctx, /Made with Luma #aiart/);
  assert.ok(ctx.length <= 500);
});

test('gatherMediaContext climbs to the nearest post container', () => {
  document.body.innerHTML = '<article class="tweet"><div><span><img alt="pic"></span></div><p>Check this out, made with Midjourney v7</p></article>';
  const ctx = UI.gatherMediaContext(document.querySelector('img'));
  assert.match(ctx, /^pic$/m);
  assert.match(ctx, /made with Midjourney v7/);
});

test('gatherMediaContext returns empty string for bare media', () => {
  document.body.innerHTML = '<div><img src="x.png"><video src="y.mp4"></video></div>';
  assert.equal(UI.gatherMediaContext(document.querySelector('img')), '');
  assert.equal(UI.gatherMediaContext(document.querySelector('video')), '');
});

test('hover-scan context with a disclosure evaluates Strong', () => {
  document.body.innerHTML = '<article><img alt="art"><p>New piece, made with Midjourney v7</p></article>';
  const ctx = UI.gatherMediaContext(document.querySelector('img'));
  const post = document.createElement('div');
  post.textContent = ctx;
  const r = D.evaluate(post, site('x'), S.normalize(null));
  assert.equal(r.rung, 'strong');
});

test('siteForHost matches Google TLDs', () => {
  assert.equal(globalThis.ClariFiSites.siteForHost('www.google.com').id, 'google');
  assert.equal(globalThis.ClariFiSites.siteForHost('www.google.co.uk').id, 'google');
  assert.equal(globalThis.ClariFiSites.siteForHost('www.google.ca').id, 'google');
  assert.equal(globalThis.ClariFiSites.siteForHost('www.bing.com'), null);
});

test('Google adapter exposes image-result containers for future use', () => {
  const g = site('google');
  assert.ok(Array.isArray(g.media) && g.media.length > 0);
  assert.ok(g.posts.includes('div.g'));
});

test('Google web result with AI disclosure is Strong', () => {
  const r = run('google', '<div class="g"><h3>Stunning prints</h3> <div>Made with Midjourney, gallery quality AI art prints</div></div>', 'div.g');
  assert.equal(r.rung, 'strong');
  assert.equal(r.author, null);
});

test('Plain Google web result is not flagged', () => {
  const r = run('google', '<div class="g"><h3>National park guide</h3><div>Trail maps, opening hours and visitor information for the park.</div></div>', 'div.g');
  assert.equal(r.rung, null);
});

test('Google defaults to inform level', () => {
  assert.equal(S.normalize(null).levels.google, 'inform');
});

test('A hashtag right before another element still counts', () => {
  // React-built pages put no whitespace between elements, so textContent
  // would read "#aivideo" and the next line as one word.
  const r = run('youtube', '<ytd-rich-item-renderer><h3>Sky jellyfish #aivideo</h3><a href="/@SkyDrift">SkyDrift</a><div>61K views</div></ytd-rich-item-renderer>', 'ytd-rich-item-renderer');
  assert.equal(r.rung, 'possible');
  assert.match(r.evidence[0].text, /#aivideo/);
});
