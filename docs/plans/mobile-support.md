# Mobile support pass

## Context

The site has zero `@media` rules today — everything was built desktop-first. This is the first pass at mobile fixes, starting with two concrete breakages found by testing at a 390px viewport width. Both fixes land behind a single `@media (max-width: 640px)` breakpoint in `style.css` (no existing breakpoint convention to match, so 640px is a fresh pick — phones land under it, the 860px desktop layout is untouched above it).

## Issue 1: review-tab pill labels wrap inside the pill

`.review-tab` (the "book-index tabs" hanging off a card's top-right edge, `style.css`) has no `white-space: nowrap`. At 390px, a multi-word tab name like "The Good, The Bad, & The Okay" wraps across 2-3 lines *inside* its own pill, ballooning the whole `.review-tabs` row to ~105px tall and reading as broken rather than as tabs.

Fix: tab identification moves off the pill entirely on mobile.

- `renderCard()` (`shared.js`) wraps each tab button's label in `<span class="review-tab-label">`, and adds `<h3 class="mobile-tab-heading">${activeTab.name}</h3>` as the first child of `.expanded-body` — both unconditional in the HTML, gated by CSS.
- `style.css`: `.mobile-tab-heading { display: none; }` by default; inside the mobile breakpoint it becomes a visible bold heading (matching `.bb-h1`'s look) and `.review-tab-label { display: none; }` empties out the pills — they stay clickable (same background/border/active-state box) but carry no text on mobile, since the heading now does that job.

Since `renderCard()` is shared between the live site and admin's Site Card Preview, both get this for free.

## Issue 2: `#sort-controls` wraps unevenly

`#recommend-filter-row` and `#sort-controls` (`index.html`/`style.css`) are plain `flex-wrap: wrap` rows with no mobile handling. At 390px this wraps unpredictably — e.g. "Year" strands alone on its own line with a lot of dead space, and `#sort-controls`' `border-right` divider (meant to separate it from Recommended/Tags/Clear on one shared line) ends up looking like a stray line off whatever happened to wrap last.

Fix: replace the wrap with an intentional vertical stack on mobile — `#recommend-filter-row` and `#sort-controls` both become `flex-direction: column; align-items: stretch;`, so every control (Sort By label, Playtime, Price, the Release Date/↔ group, Year, Recommended, Tags, Clear) is its own predictable full-width row instead of packing unevenly. The `border-right` divider becomes a `border-bottom` under `#sort-controls` (still separating the sort group from Recommended/Tags/Clear, just for a vertical stack instead of a horizontal one), and `#clear-all-btn`'s `margin-left: auto` (a horizontal-row trick) is reset since it's no longer meaningful in column layout.

## Verification

Checked via a resized Chrome tab at 390×844: confirmed the `.review-tabs` row was 105px tall pre-fix (wrapped label text) and confirmed `#sort-controls` stranding "Year" alone. Re-check both screenshots after implementing to confirm the heading appears, pills are empty-but-clickable, and the sort row reads as clean full-width rows.
