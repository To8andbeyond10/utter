# ClariFi beta 0.1: browser extension

ClariFi flags AI-made posts on YouTube, TikTok, Instagram, X, Facebook, Threads and Reddit, and shows the evidence behind every flag. Pick a level per site: **Inform** adds a badge, **Warn** blurs the post until you choose to view it, **Block** hides it.

## Install on Windows

**Chrome or Edge**
1. Unzip `clarifi-extension.zip` somewhere permanent, like `Documents\ClariFi`. Chrome loads it from that folder, so don't delete it.
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick the unzipped `clarifi-extension` folder (the one containing `manifest.json`).
5. Pin ClariFi from the puzzle-piece menu so its icon stays in the toolbar.
6. Reload any social media tabs that were already open.

**Firefox** (for testing; removed when Firefox restarts until the add-on is signed)
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and pick `manifest.json`.

## Using it
- **Badge:** hover (or click) to see why a post was flagged, how sure ClariFi is, and who posted it.
- **Card actions:** Always hide or always allow an account, or Report a mistake.
- **Toolbar icon:** shows how many posts are flagged on the page. The popup changes the level for the current site and pauses ClariFi for 15 minutes, 1 hour, or until you resume.
- **Settings:** per-site levels, whether Block also hides Likely posts, note vs. full removal, hashtag signals, your account lists, and mistake reports.

## What this beta checks

| Evidence | Examples | Rung |
| --- | --- | --- |
| Platform AI labels | Instagram/Facebook/Threads "AI info", YouTube "Altered or synthetic content", TikTok "Creator labeled as AI-generated" | Confirmed |
| Creator disclosure | "made with Midjourney", "generated using Sora" (ignores "NOT made with AI" and questions) | Strong |
| Reddit flair | "AI Art", "AI Generated" | Strong |
| Your always-hide list | Accounts you chose | Strong |
| AI hashtags and phrases | #aiart, #midjourney, "AI-generated" | Possible; 3+ together = Likely |

Coming next: detector models for unlabeled posts, Content Credentials, Deep Scan reports.

## Testing checklist
Open each site, scroll for a minute, and note anything wrong in a mistake report:
- [ ] YouTube: home feed, a watch page with an "Altered or synthetic content" label, Shorts
- [ ] TikTok: For You feed and a search for "#aiart"
- [ ] Instagram: home feed and a post with the "AI info" label
- [ ] X: home timeline and a search for "made with midjourney"
- [ ] Facebook: news feed
- [ ] Threads: home feed
- [ ] Reddit: r/aiArt (flair) and r/all
- [ ] Switch Inform, Warn and Block on one site; check "Show post" and "Show anyway"
- [ ] Pause for 15 minutes, then Resume

## When a site breaks
Platforms change their page code often. Everything site-specific lives in `src/content/sites.js`: where posts are (`posts`), the label wording (`labels`), and how to read the account name (`author`). Most fixes are a one-line edit there, then click the reload icon on `chrome://extensions`.

## Privacy
Checks run on your computer. This beta makes no network requests at all. Settings sync through your browser account; mistake reports stay on this computer until you download them.

## For developers
```
npm install jsdom
node --test tests/detect.test.js
```
14 tests cover labels, disclosures, negation, questions, hashtags, flair, account lists, level actions and settings validation.

```
manifest.json          Chrome/Edge/Firefox (Manifest V3)
src/shared/            settings + shared page styles
src/content/sites.js   per-site rules
src/content/detect.js  evidence ladder
src/content/ui.js      badges, card, blur, hidden note (shadow DOM)
src/content/main.js    finds posts, applies levels
src/popup/ src/options/ src/background.js
```
