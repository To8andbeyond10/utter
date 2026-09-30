// ClariFi site rules. Platforms change their pages often, so everything
// site-specific lives here: where posts are, what their AI labels say,
// and how to read the account name. Fix a broken site by editing this file.
(function (root) {
  'use strict';

  function handleFromHref(el, pattern) {
    if (!el) return null;
    const href = el.getAttribute('href') || '';
    const m = href.match(pattern);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // Labels the platforms themselves attach to AI content.
  // Matched against short, standalone pieces of text inside a post,
  // never against the caption, so a caption can't fake a label.
  const META_LABELS = ['AI info', 'Made with AI', 'Imagined with AI'];

  const SITES = [
    {
      id: 'youtube',
      name: 'YouTube',
      hosts: /(^|\.)youtube\.com$/,
      posts: [
        'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer',
        'ytd-grid-video-renderer', 'ytd-reel-item-renderer', 'ytd-reel-video-renderer',
        'yt-lockup-view-model', 'ytm-shorts-lockup-view-model', 'ytd-watch-metadata',
        'ytm-video-with-context-renderer', 'ytm-reel-item-renderer'
      ],
      labels: ['Altered or synthetic content', 'Synthetic content'],
      disclosures: [],
      author(post) {
        return handleFromHref(post.querySelector('a[href^="/@"]'), /^\/@([^/?#]+)/);
      },
      badgeInset: { top: 8, right: 8 }
    },
    {
      id: 'tiktok',
      name: 'TikTok',
      hosts: /(^|\.)tiktok\.com$/,
      posts: [
        '[data-e2e="recommend-list-item-container"]', 'article[data-e2e]',
        '[data-e2e="user-post-item"]', '[class*="DivItemContainerV2"]', '[class*="DivItemContainerForSearch"]'
      ],
      labels: ['Creator labeled as AI-generated', 'Contains AI-generated media', 'AI-generated content', 'AI-generated'],
      disclosures: [],
      author(post) {
        const el = post.querySelector('[data-e2e="video-author-uniqueid"], [data-e2e="browse-username"]');
        if (el && el.textContent.trim()) return el.textContent.trim().replace(/^@/, '');
        return handleFromHref(post.querySelector('a[href^="/@"]'), /^\/@([^/?#]+)/);
      },
      badgeInset: { top: 10, right: 10 }
    },
    {
      id: 'instagram',
      name: 'Instagram',
      hosts: /(^|\.)instagram\.com$/,
      posts: ['article'],
      labels: META_LABELS,
      disclosures: [],
      author(post) {
        const a = post.querySelector('header a[href^="/"]');
        return handleFromHref(a, /^\/([A-Za-z0-9._]+)\/?$/);
      },
      badgeInset: { top: 12, right: 52 }
    },
    {
      id: 'x',
      name: 'X',
      hosts: /(^|\.)(x|twitter)\.com$/,
      posts: ['article[data-testid="tweet"]'],
      labels: ['Made with AI'],
      disclosures: [],
      author(post) {
        const a = post.querySelector('[data-testid="User-Name"] a[href^="/"]');
        return handleFromHref(a, /^\/([A-Za-z0-9_]{1,15})\/?$/);
      },
      badgeInset: { top: 10, right: 52 }
    },
    {
      id: 'facebook',
      name: 'Facebook',
      hosts: /(^|\.)facebook\.com$/,
      posts: ['div[aria-posinset]', 'div[role="article"]:not([aria-label^="Comment"]):not([aria-label^="Reply"])'],
      labels: META_LABELS,
      disclosures: [],
      author(post) {
        const a = post.querySelector('h2 a[href*="facebook.com/"], h3 a[href*="facebook.com/"], h4 a[href*="facebook.com/"]');
        if (!a) return null;
        const name = a.textContent.trim();
        return name ? name.slice(0, 60) : null;
      },
      badgeInset: { top: 12, right: 56 }
    },
    {
      id: 'threads',
      name: 'Threads',
      hosts: /(^|\.)threads\.(net|com)$/,
      posts: ['div[data-pressable-container="true"]'],
      labels: META_LABELS,
      disclosures: [],
      author(post) {
        return handleFromHref(post.querySelector('a[href^="/@"]'), /^\/@([^/?#]+)/);
      },
      badgeInset: { top: 10, right: 44 }
    },
    {
      id: 'reddit',
      name: 'Reddit',
      hosts: /(^|\.)reddit\.com$/,
      posts: ['shreddit-post'],
      labels: [],
      // Post flair set by the poster or the community's moderators.
      // A bare "AI" flair is left out on purpose: news subreddits use it for posts ABOUT AI.
      disclosures: ['AI Generated', 'AI-Generated', 'AI Art', 'AI Artwork', 'AI Image', 'AI Video', 'Made with AI'],
      // Reddit posts render inside their own shadow DOM, so draw on the wrapper.
      mountOn(post) {
        return post.closest('article') || post.parentElement;
      },
      author(post) {
        const a = post.getAttribute('author');
        return a && a !== '[deleted]' ? a : null;
      },
      badgeInset: { top: 10, right: 12 }
    }
  ];

  function siteForHost(hostname) {
    return SITES.find((s) => s.hosts.test(hostname)) || null;
  }

  root.ClariFiSites = { SITES, siteForHost };
})(globalThis);
