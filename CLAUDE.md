# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, no-build, no-dependency site for publishing personal game reviews, plus a single-file admin tool for authoring them. There is no `package.json`, no bundler, and no test suite — it's six flat files (`index.html`, `app.js`, `admin.html`, `shared.js`, `style.css`, `serve.ps1`) served as-is.

## Running it locally

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1        # serves the repo root at http://localhost:8080 (default port 8080)
powershell -ExecutionPolicy Bypass -File .\serve.ps1 -Port 3000
```

`serve.ps1` is a minimal `System.Net.HttpListener`-based static file server (no Node/npm involved). There is no build, lint, or test command — edit the HTML/JS/CSS files directly and reload the browser.

## Architecture

Two front ends share one data model:

- **`index.html` + `app.js`** — the public site. Renders review cards, tag filtering, expandable card detail with nested review tabs/sub-tabs.
- **`admin.html`** — a single file with all its CSS and JS inline (no separate admin.js). Used to author/edit/delete reviews and push them to GitHub, plus preview exactly how a review will look both as a site card and as a Steam review.
- **`shared.js`** — constants and helpers used identically by both of the above (`escHtml`, `formatDate`, `steamAppId`, `splitSubTabs`, `renderBBCode`, `renderCard`, `STEAM_ICON`, `SITE_LINK_TEXT`). **Anything both files need must live here, not be duplicated in each** — this file used to not exist and the same logic/text drifted out of sync between the two UIs. `admin.html` loads it via a normal blocking `<script src="shared.js">` in `<head>`; `index.html` loads it dynamically alongside `app.js` (see below) with `.async = false` on both loader tags, in that order, so `shared.js` is guaranteed to finish before `app.js` runs even though both are non-parser-inserted (and thus otherwise unordered) script tags.

### Data model & persistence

A review is a plain object: `{ id, title, recommended, summary, coverImage, hoursPlayed, datePosted, body, tabs: [{ id, name, content }], tags: [] }`. `body` (and each tab's `content`) is BBCode-ish markup (see below), not HTML.

Reviews are stored as a single JSON array at `data/reviews.json` inside a **GitHub repo the user configures in the admin UI** (Settings → owner/repo/branch/PAT, saved to `localStorage`). `admin.html` reads/writes that file directly through GitHub's REST Contents API (`fetchFile`/`pushFile` in the inline script), base64-encoding/decoding the content (`b64encode`/`b64decode`, UTF-8 safe).

**Important:** the public site (`app.js`) never calls the GitHub API itself. `init()` only reads the `gh_reviews_cache` `localStorage` key, which `admin.html` populates whenever it successfully loads or saves reviews (`cacheReviews()`). So the live site only shows fresh data in whatever browser the admin tool was last used in — there's no server-side or build-time fetch of `data/reviews.json`.

### BBCode-style markup (`renderBBCode` in `shared.js`)

Review body text uses a Steam-review-compatible tag syntax: `[b] [i] [u] [strike] [h1] [h2] [h3] [quote] [code] [spoiler] [list]/[olist] with [*] items [table]/[tr]/[th]/[td] [url=...] [hr] [noparse]`. This is deliberate — the same markup a user types in the admin editor is what gets copied verbatim into an actual Steam review (`copyForSteam()`), and is also rendered to HTML for the site card and admin previews. Don't "upgrade" this to Markdown or HTML without accounting for both uses.

A separate, non-BBCode `[tab=Name]...[/tab]` syntax (`splitSubTabs()`) lets a single review tab's body be split into nested sub-tabs on the site (`.sub-tabs`/`.sub-tab`), independent of the top-level review tabs described below.

### Review tabs vs. sub-tabs

Two distinct, similarly-named tab systems:
- **Review tabs** (`.review-tabs`/`.review-tab`, `extraTabs` in admin) — top-level, hang off the top-right corner of a card (see `style.css`'s "book-index tabs" comment), one of which is always the built-in "Steam Review" tab (`id: 'steam'`) backed by `body`; the rest come from the review's `tabs` array and are reorderable by drag-and-drop in the admin UI (`reorderReviewTabs`).
- **Sub-tabs** (`.sub-tabs`/`.sub-tab`) — parsed out of a single tab's content via the `[tab=Name]` markup above, rendered as a small pill row above that tab's body.

### Admin preview mirrors the live site

`admin.html`'s "Site Card Preview" panel (`renderSitePreview`) and the live site's card list (`render` in `app.js`) both build their card HTML from the single shared `renderCard(r, opts)` in `shared.js` — they no longer hand-duplicate the markup. Only the event-wiring on top differs (`app.js` wires up a list of cards sharing one global expand/tab state; `admin.html` wires up a single card that re-renders from the live form on every keystroke), so that part stays local to each file. `renderCard`'s `permalinkHref`/`disablePermalinkNav` options exist because the permalink genuinely needs different behavior per caller: the site uses a same-page relative `?review=` link, the admin preview uses an absolute `siteReviewUrl()` with navigation suppressed (it's a preview, not a real page). `#site-preview` reuses `style.css`'s actual `.card` rules unmodified by re-scoping the same CSS custom property names (`--bg`, `--surface`, `--accent`, etc.), since the admin UI's own dark theme uses different values for those variables.

### Permalinks between the site and Steam

`?review=<id>` on `index.html` auto-expands and scrolls to that card on load (see `init()` in `app.js`). `admin.html`'s `siteReviewUrl(id)` builds that URL, and it's appended (using the shared `SITE_LINK_TEXT` copy) both to the site card itself (`.card-permalink`) and to the Steam-review text/preview — so a posted Steam review links back to the fuller write-up on the site, and the site card links to itself for sharing.

### Steam library import

Admin can pull the configured Steam account's owned-games list (Steam Web API key + SteamID/vanity URL in Settings) to autofill title/hours/cover art when starting a new review. Steam's API has no CORS support, so requests go through a public proxy (`corsproxy.io`, see `PROXY()` in `admin.html`) — this is a hard dependency on that third-party proxy staying up.
