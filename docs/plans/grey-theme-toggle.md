# Grey theme toggle (site + admin)

## Context

Both `style.css` (site) and `admin/index.html`'s own inline `<style>` (admin UI) hardcode a single dark navy-tinted palette via CSS custom properties on `:root`. This adds a second, neutral-grey palette for each, switched via a `data-theme="grey"` attribute on `<html>`, with a header toggle button and a persisted choice so it stays picked on reload. The two pages keep their own separate palettes (they already have separate `:root` blocks with different values today) — this doesn't unify them, just gives each an alternate grey variant.

`--accent`/`--green`/`--red`/(admin's `--amber`)/`--text` are semantic (links, recommend/not-recommend badges, warnings, main text) rather than "the grey backdrop" being asked for, so they stay the same in both themes on both pages. Only the neutral surface levels (`--bg`/`--surface`/`--border`/`--muted`, plus admin's extra `--panel`/`--input-bg` levels) change.

Admin's `#site-preview` panel already hardcodes the site's real (non-grey) navy values directly rather than referencing admin's own `--bg`/`--surface` vars (see its own comment — it exists specifically so the preview isn't tinted by admin's darker chrome). Left alone: it'll keep always showing the site's default palette regardless of either page's grey toggle. Out of scope for this pass; can revisit if wanted later.

## `shared.js`

- `THEME_STORAGE_KEY = 'site_theme'` — one shared localStorage key, so the preference (once set on either page) is remembered site-wide.
- `applyStoredTheme()` — reads the key, sets `document.documentElement.dataset.theme = 'grey'` if saved. Called unconditionally at module load, same as `applyFavicon()` above it. This is enough on its own for admin.html, which loads `shared.js` as a blocking `<head>` script (runs before body paint). Not early enough for index.html (see below).
- `initThemeToggle(buttonId)` — wires a button's click to flip the attribute + persist/clear the key. Called once per page, each passing its own toggle button's id.

## `index.html`

`shared.js` loads too late here (a dynamically-injected script near the end of `<body>`) for `applyStoredTheme()` alone to avoid a flash of the wrong theme. The existing bootstrap `<script>` in `<head>` (the one that already computes `SITE_ROOT` before anything else loads) gets the same read-and-apply duplicated inline, for timing only — `shared.js`'s copy still runs too, redundantly but harmlessly, once it loads.

Header gets a toggle `<button id="theme-toggle">` next to `#admin-link`, both wrapped in a small flex group so `header`'s `justify-content: space-between` still only sees two top-level children (title / right-side group). `app.js`'s `init()` calls `initThemeToggle('theme-toggle')` (runs after `shared.js`, guaranteed by the `.async = false` load order already in place).

## `admin/index.html`

Same toggle button pattern in its own `<header>`, next to "← View site". Its `(function init() {...})()` IIFE calls `initThemeToggle('theme-toggle')` directly — no timing concerns, it's plain inline script running after the DOM it references.

## CSS

`style.css` (site) — new grey values, roughly mirroring the existing palette's relative brightness:
```
:root[data-theme="grey"] {
  --bg: #1a1a1a;
  --surface: #242424;
  --border: #3a3a3a;
  --muted: #9a9a9a;
}
```

`admin/index.html`'s inline `<style>` (admin) — same idea, covering its extra `--panel`/`--input-bg` levels too:
```
:root[data-theme="grey"] {
  --bg: #141414;
  --surface: #222222;
  --panel: #1c1c1c;
  --border: #3a3a3a;
  --input-bg: #101010;
  --muted: #9a9a9a;
}
```

Toggle button styled like the existing `#admin-link`/header `a` (muted color, no background) with a "◑" glyph and an `aria-label`/`title` of "Toggle grey theme".

## Verification

Toggle on each page independently; confirm the whole page (cards, panels, inputs) recolors via the CSS variables with no hardcoded-color spots left over; confirm the choice survives a reload (localStorage); confirm admin's Site Card Preview panel keeps showing the site's real navy palette regardless of either toggle's state (documented as intentional above, not a bug).
