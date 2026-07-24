# Mobile support pass

## Context

The site has zero `@media` rules today — everything was built desktop-first. This is the first pass at mobile fixes, found by testing at a 390px viewport width. All of it lands behind a single `@media (max-width: 640px)` breakpoint in `style.css` (no existing breakpoint convention to match, so 640px is a fresh pick — phones land under it, the 860px desktop layout is untouched above it).

## Issue 1: review-tab pill labels wrap inside the pill

`.review-tab` (the "book-index tabs" hanging off a card's top-right edge, `style.css`) has no `white-space: nowrap`. At 390px, a multi-word tab name like "The Good, The Bad, & The Okay" wraps across 2-3 lines *inside* its own pill, ballooning the whole `.review-tabs` row to ~105px tall and reading as broken rather than as tabs.

Fix: tab identification moves off the pill entirely on mobile.

- `renderCard()` (`shared.js`) wraps each tab button's label in `<span class="review-tab-label">`, and adds `<h3 class="mobile-tab-heading">${activeTab.name}</h3>` as the first child of `.expanded-body` — both unconditional in the HTML, gated by CSS. Since `renderCard()` is shared between the live site and admin's Site Card Preview, both get this for free.
- `style.css`: `.mobile-tab-heading { display: none; }` by default; inside the mobile breakpoint it becomes a visible bold heading (matching `.bb-h1`'s look).
- Inside the breakpoint, `.review-tab-label { display: none; }` empties the pills out entirely (design call: no truncation/ellipsis attempt, just blank) — they stay clickable, same background/border/active-state box, just no text, since the heading now carries the name. Sized up to a `min-width: 3.5rem; min-height: 2rem` touch target (was shrinking to just its padding/border once the label emptied out).
- Emptied pills still need *some* way to tell them apart before tapping one, so `.review-tabs { counter-reset: review-tab; }` / `.review-tab { counter-increment: review-tab; }` / `.review-tab::before { content: counter(review-tab); }` numbers them 1, 2, 3… — pure CSS, no HTML/JS change needed for this part.

## Issue 2: `#sort-controls` wraps unevenly

`#recommend-filter-row` and `#sort-controls` (`index.html`/`style.css`) are plain `flex-wrap: wrap` rows with no mobile handling. At 390px this wraps unpredictably — e.g. "Year" strands alone on its own line with a lot of dead space, and `#sort-controls`' `border-right` divider (meant to separate it from Recommended/Tags/Clear on one shared line) ends up looking like a stray line off whatever happened to wrap last. The row also has no horizontal padding of its own (unlike `#title-search-bar`/`#app`), so it sits flush against the screen edges.

Fix: a deliberate two-column CSS grid instead of flex-wrap, so pairing is guaranteed regardless of each control's natural content width (flex-wrap can't guarantee that — it packs by leftover space, which is exactly what produced the uneven wrap).

- `#recommend-filter-row` becomes `display: grid; grid-template-columns: 1fr 1fr;` with `padding: 0 1rem` for edge spacing. `#sort-controls` spans both columns (`grid-column: 1 / -1`) as its own block; `#recommend-filter-btn`/`#tag-filters-toggle` (Recommended/Tags) auto-place into the next row's two columns; `#clear-all-btn` gets `grid-column: 1 / -1` to sit alone on its own full-width row after them.
- `#sort-controls` is itself a nested two-column grid: its `.tag-group-label` ("Sort By") spans both columns as its own row, then Playtime/Price auto-place as a pair, then `#date-filter-group`/`#date-range-year` (Release Date+swap / Year) as the next pair. The old `border-right` divider becomes a `border-bottom` (same job, stacked orientation).
- `#date-range-year` (a `<select>`) gets `text-align: center` — selects default to left-aligned text, unlike the centered `<button>` pills beside it.

## Issue 3: cover image cramped beside title/summary

`.card-main` lays `.card-cover` (fixed 120×80) beside `.card-info` and `.card-chevron` in a row — too cramped at mobile widths.

Fix: `.card-main` becomes `display: grid; grid-template-columns: 1fr auto;`. `.card-cover` spans both columns (`grid-column: 1 / -1`) as its own full-width row, sized `width: 100%; height: 180px` (a deliberate full-width banner, not just "moved above" at its original small size). `.card-info`/`.card-chevron` auto-place into the next row's two columns, same relative layout as desktop.

## Verification

Checked via a resized Chrome tab at 390×844 (window resize + `getBoundingClientRect()`/computed-style checks in the page, screenshots where the tool cooperated):
- `.review-tabs` row height: 105px (wrapped text) → 15px (emptied) → pills sized to 3.5rem×2rem with visible 1/2/3/4 numbering.
- `#sort-controls`/`#recommend-filter-row`: confirmed Playtime+Price, Release Date+Year, and Recommended+Tags each share a row via `getBoundingClientRect()` y-coordinates; Clear spans full width alone; row is inset 1rem from both edges.
- `.card-cover`: confirmed it renders above `.card-info` (lower y) at full row width (370px in a 444px-wide test viewport) and 180px tall.

## Commits

- `a0bc8b6` — Add first mobile support pass: card tabs, sort row, cover image.
