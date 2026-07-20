# Game-title search bar + tag-filters collapse toggle

## Context

The public site (`index.html`/`app.js`) just got a tag-name search box (filters which tag pills show) plus multi-select include/exclude tag filtering. This adds a second, separate search bar *above* the tag filter section that filters the review list itself by game title, with a hamburger button at the end of that same bar to collapse/expand the whole tag filter section (freeing up vertical space once you've set your tag filters and don't need to keep adjusting them).

## Data model (`app.js`)

Two new state variables, alongside the existing `tagFilterState`/`tagSearchQuery`:
```js
let titleSearchQuery = '';   // filters the review list itself, unlike tagSearchQuery
let tagFiltersOpen = true;   // whether #tag-filters is expanded; defaults open
```

## `index.html`

New static bar between `<header>` and `<div id="tag-filters">` (static, not JS-generated — unlike the tag-search box, this one never needs a "created once" guard since nothing ever rebuilds `index.html`'s own markup):
```html
<div id="title-search-bar">
  <input type="text" id="title-search" placeholder="Search by game name..." autocomplete="off">
  <button id="tag-filters-toggle" aria-label="Toggle tag filters" title="Show/hide tag filters">&#9776;</button>
</div>
```

## `app.js`

- `init()` wires up both controls once, same place it currently wires up permalink logic:
  - `#title-search` `input` event: sets `titleSearchQuery` and calls `render()` (reuses the full re-render — title search affects the review list the same way tag filters already do).
  - `#tag-filters-toggle` `click` event: flips `tagFiltersOpen` and toggles a `collapsed` class on `#tag-filters` directly (no need to go through `render()`/`renderTagFilters()` — collapsing is a pure visibility change, and doesn't touch `tagFilterState` or `tagSearchQuery`, so filters already applied stay applied while the panel is hidden).
- `render()`'s `visible` filter gains a title check ahead of the existing include/exclude logic:
  ```js
  const titleQuery = titleSearchQuery.trim().toLowerCase();
  const visible = reviews.filter(r => {
    if (titleQuery && !r.title.toLowerCase().includes(titleQuery)) return false;
    const tags = r.tags || [];
    if (excluded.some(t => tags.includes(t))) return false;
    return included.every(t => tags.includes(t));
  });
  ```
- The "No reviews match" empty-state message already added for tag filtering covers this combined case fine as-is (generic wording).

## `style.css`

- `#title-search-bar`: flex row (input grows via `flex:1`, hamburger button fixed size), visually matching `#tag-filters-top`/`#tag-search`'s existing style (reuse the same background/border/radius values rather than introducing new ones).
- `#tag-filters.collapsed`: `display: none`.

## Verification

- Load `index.html`, type a partial game title into the new top search box, confirm the review list narrows to matching titles only.
- With a tag filter active (e.g. one tag set to "include"), confirm title search combines correctly (AND) — only reviews matching both show.
- Click the hamburger: tag filter section (search box, categories, Clear) hides entirely; click again to bring it back, confirming any tag selections made before collapsing are still applied to the review list and still visually reflected (green/red) once reopened.
