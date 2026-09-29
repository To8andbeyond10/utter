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
for (const f of ['src/shared/settings.js', 'src/content/sites.js', 'src/content/detect.js']) {
  new Function(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'))();
}
const S = globalThis.ClearbandSettings;
const D = globalThis.ClearbandDetect;
const site = (id) => globalThis.ClearbandSites.SITES.find((s) => s.id === id);

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
