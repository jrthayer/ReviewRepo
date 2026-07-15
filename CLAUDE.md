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

### No native browser dialogs in the admin UI

`admin.html` uses no `prompt()`/`alert()`/`confirm()` anywhere — build inline UI instead:
- **Text input** (naming/entering something): swap the trigger button for an `<input>` with its own confirm/cancel controls, focused (and often pre-filled). See the tab-rename flow (`startRenameTab`), the "+ Save Block"/"+ Save Tab" naming flows (`startSaveCustomBlock`/`startSaveCustomTab`), and the toolbar's Link URL entry (`startInsertLink`/`confirmInsertLink`/`cancelInsertLink`, no longer `applyFormat('url')`).
- **Destructive confirmation**: replace the row/button with an inline "Delete X? ✓ ✕" state instead of `confirm()`. Dropdown rows: saved-block and saved-tab delete (`startDeleteCustomBlock`/`startDeleteCustomTab` and their `confirm*`/`cancel*` counterparts). Standalone button: the review Delete button (`startDeleteReview`/`confirmDeleteReview`/`cancelDeleteReview`) swaps for a `#delete-confirm` row in `#save-row`.
- **Errors**: go through `#error-banner` (`showError`/`setSt(id, msg, true)`), never `alert()`.

Keep new interactive admin features on this pattern — a `start*`/`confirm*`/`cancel*` trio swapping visibility between a trigger and an inline editor/confirm row is the established shape here.

### Data model & persistence

A review is a plain object: `{ id, title, recommended, summary, coverImage, hoursPlayed, datePosted, body, tabs: [{ id, name, content }], tags: [] }`. `body` (and each tab's `content`) is BBCode-ish markup (see below), not HTML.

Reviews are stored as a single JSON array at `data/reviews.json` inside a **GitHub repo the user configures in the admin UI** (Settings → owner/repo/branch/PAT, saved to `localStorage`). `admin.html` reads/writes that file directly through GitHub's REST Contents API, via the generic `ghGetJson(path)`/`ghPutJson(path, data, sha, msg)` helpers (which wrap `ghReq` and base64-encode/decode the content — `b64encode`/`b64decode`, UTF-8 safe). `fetchFile`/`pushFile` are thin wrappers of those two around `data/reviews.json`; `fetchBlocksFile`/`pushBlocksFile` are the same for `data/custom-blocks.json` (see below). Any new GitHub-persisted file should go through `ghGetJson`/`ghPutJson` rather than re-implementing the Contents API calls.

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

### Custom format blocks & saved tabs

Two parallel "save this for reuse" features in the admin editor, both following the same shape: `{ id, name, content }`, stored as their own JSON array in the configured GitHub repo (like `reviews.json`), and both use the shared `.dropdown-wrap`/`.dropdown-menu`/`.dropdown-item`/`.dropdown-remove`/`.dropdown-empty` CSS for their popup UI (each wrapper also carries its own extra class — `.blocks-dropdown-wrap`, `.tab-add-wrap` — purely so the outside-click-to-close handler in `init()` can target each independently).

- **Custom format blocks** — a "Blocks ▾" dropdown (`renderCustomBlocks`) of reusable saved *text snippets*, independent of any single review — e.g. a fully-written `[tab=Name]...[/tab]` section you want to reuse across reviews. "+ Save Block" saves the current textarea selection under a name (typed into an inline input, not `prompt()`); clicking a saved block inserts it at the cursor (`insertCustomBlock`). Stored at `data/custom-blocks.json`.
- **Saved tabs** — the review editor's "+" tab button (next to the built-in Steam Review tab and any tabs already on the review) is a dropdown, not an immediate action: its first entry is always "Blank tab" (the old default behavior, `addReviewTab()` with no args), followed by any saved tab templates (`renderTabAddDropdown`); picking one creates a new review tab pre-populated with that template's name/content (`addReviewTabFromTemplate`). "+ Save Tab" saves the *currently active tab* (name + content, via `syncActiveTabContent()` first) as a new template. Stored at `data/custom-tabs.json`.

Both features share the `fetchFile`/`pushFile`-style pattern: `fetchBlocksFile`/`pushBlocksFile` and `fetchTabsFile`/`pushTabsFile` are thin wrappers around `ghGetJson`/`ghPutJson` (see above). Both load alongside the review list on connect (`loadCustomBlocksList`/`loadCustomTabsList`, called from `loadReviewList`) — not `localStorage` — so they persist across machines/sessions. Saving/deleting either requires GitHub to be configured, same restriction as saving/deleting a review.

### Steam library import

Admin can pull the configured Steam account's owned-games list (Steam Web API key + SteamID/vanity URL in Settings) to autofill title/hours/cover art when starting a new review. Steam's API has no CORS support, so requests go through a public proxy (`corsproxy.io`, see `PROXY()` in `admin.html`) — this is a hard dependency on that third-party proxy staying up.
