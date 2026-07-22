# Date filter/sort control

## Context

The site's filter/sort row (`#recommend-filter-row`) currently has Playtime?/Price? sort toggles, a Recommended? filter, and the Tags panel toggle. This adds a fourth control, **Date**, that's really two features sharing one entry point:
- A sort toggle (Descend → Ascend → Neutral), matching Playtime?/Price?'s existing three-state cycle and mutual exclusivity (only one custom sort applies at a time).
- A settings cog on the same control that opens a small panel: which date field to use (Reviewed vs Released — reused by both the sort and the range filter below), and an optional date range that hides reviews outside it. Default: Released, no range.

The settings panel reuses the existing `#tag-filters` show/hide mechanics (a collapsible block below the filter row, toggled by a button that swaps icon on open) and must be mutually exclusive with it — opening one closes the other, per the user's explicit ask.

## `index.html`

Add next to the existing `#recommend-filter-btn`, before `#tags-toggle-controls`:
```html
<div id="date-filter-group">
  <button type="button" class="tag-filter" id="date-sort-btn">Date?</button>
  <button type="button" id="date-settings-toggle" aria-label="Date filter settings" title="Date filter settings">&#9881;</button>
</div>
```
`#date-sort-btn` reuses `.tag-filter`/`.sort-active` exactly like `#playtime-sort-btn`/`#price-sort-btn`. The cog is a separate `<button>` (can't nest inside `#date-sort-btn`) styled to visually join it into one pill, same two-button-compound idea already used by `.tag-filter-pinned`/`.tag-filter-pinned-remove`.

Add a new collapsible panel after `#tag-filters` (its sibling, not nested — only one of the two is ever visible), starting collapsed and with Released pre-selected:
```html
<div id="date-settings" class="collapsed">
  <div id="date-field-toggle">
    <span class="tag-group-label">Compare</span>
    <button type="button" class="tag-filter" id="date-field-reviewed">Reviewed</button>
    <button type="button" class="tag-filter sort-active" id="date-field-released">Released</button>
  </div>
  <div id="date-range-controls">
    <span class="tag-group-label">Range</span>
    <input type="date" id="date-range-from" aria-label="From date">
    <span>to</span>
    <input type="date" id="date-range-to" aria-label="To date">
  </div>
</div>
```
No separate "Clear range" control — clearing a populated native `<input type="date">` (the browser's built-in × ) is enough, matching how nothing else in this row has a dedicated per-control clear button either.

## `style.css`

- `#date-filter-group`: flex row, `align-items: stretch`; `#date-sort-btn` gets its trailing corners squared off, `#date-settings-toggle` gets its leading corners squared off plus a subtle inner divider, so the pair reads as one pill — same visual idea as `.tag-filter-pinned` + `.tag-filter-pinned-remove`, new rules since the internals differ (plain button vs `.tag-filter` base + icon button).
- `#date-settings-toggle` hover/`.open` states mirror `#tag-filters-toggle`'s existing rules (color/border-color transitions, icon swap handled in JS).
- `#date-settings` / `#date-settings.collapsed`: copy `#tag-filters`/`#tag-filters.collapsed`'s box (max-width/margin/padding/flex column/gap/background/border) so the two panels occupy the same slot and look like siblings.
- `#date-field-toggle`, `#date-range-controls`: flex rows with `gap`, matching `#tag-filters-active`'s row spacing; `input[type="date"]` styled like `#tag-search` (background `var(--border)`, rounded, padding) so it doesn't look like a bare browser control.

## `app.js`

**State** (next to `playtimeSort`/`priceSort`):
```js
let dateSort;                 // undefined | 'asc' | 'desc' — same cycleSortState as playtime/price
let dateField = 'released';   // 'reviewed' | 'released' — which date both the sort and the range use
let dateRangeFrom, dateRangeTo; // yyyy-mm-dd strings or undefined — undefined on both = "no range" (default)
```

**Wiring in `init()`:**
- `#date-sort-btn` click: `dateSort = cycleSortState(dateSort)`, reset `playtimeSort`/`priceSort` to `undefined`, call `updateSortToggleButtons()` + `render()`. Extend the existing `#playtime-sort-btn`/`#price-sort-btn` handlers to also reset `dateSort = undefined`, keeping all three mutually exclusive (matching the existing comment on `playtimeSort`'s declaration).
- `updateSortToggleButtons()`: add a third `setLabel('date-sort-btn', dateSort, 'Date')` call — the helper is already generic.
- `#date-field-reviewed`/`#date-field-released` click: set `dateField`, toggle `.sort-active` on the two buttons (reusing that class the same way Playtime/Price already do — a mode, not an include/exclude choice, per the existing CSS comment), `render()`.
- `#date-range-from`/`#date-range-to` `input` (change-as-you-type, matching `#title-search`'s handler) → set `dateRangeFrom`/`dateRangeTo` to `e.target.value || undefined`, `render()`.
- `#date-settings-toggle` click: mirror `#tag-filters-toggle`'s handler — if opening, first force-close `#tag-filters` (collapsed + icon updated); toggle `#date-settings`'s collapsed class; update its own icon via a new `updateDateSettingsToggleIcon()` (cog ⚙ closed / × open, same pattern as `updateTagFiltersToggleIcon()`).
- Extend the existing `#tag-filters-toggle` handler symmetrically: if it's about to open, first force-close `#date-settings` (collapsed + icon updated).

**Filtering/sorting in `render()`:**
- After the existing title/recommended/tag filters, add a range filter: if `dateRangeFrom || dateRangeTo`, compute `d = dateField === 'released' ? r.releaseDate : r.datePosted` per review and drop it if `!d`, or `d < dateRangeFrom`, or `d > dateRangeTo` (plain string comparison — dates are already stored as `yyyy-mm-dd`, which sorts/compares correctly as strings).
- Extend the `if (playtimeSort) {...} else if (priceSort) {...}` chain with `else if (dateSort) {...}`: compare the same `dateField`-selected date per review, missing dates always sort last regardless of direction (mirrors `reviewPrice`'s existing "no price sorts last" rule in the `priceSort` branch just above it).

## Verification

With the local server already running (`localhost:8080`), use the Chrome tools to:
1. Load the homepage, confirm the Date button reads "Date?" and the settings panel is collapsed with Released pre-selected.
2. Click the Date label repeatedly: label cycles Date↓ → Date↑ → Date?, and the card order changes each time (by `releaseDate`, the default field); confirm clicking Playtime? or Price? afterward resets Date back to neutral, and vice versa.
3. Click the cog: panel opens, icon becomes ×; open Tags panel — Date settings should auto-close (and its icon revert), then reopen Date settings and confirm Tags auto-closes.
4. Click Reviewed: sort re-evaluates against `datePosted` instead; set a From/To range narrower than the full data set and confirm only in-range reviews show (and reviews missing the active date field drop out while a range is active); clear the range and confirm all reviews return.
