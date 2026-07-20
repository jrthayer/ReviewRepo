# Multi-select include/exclude tag filtering

## Context

The public site's tag filter bar (`#tag-filters` in `index.html`, rendered by `renderTagFilters()` in `app.js`) currently supports only a single active tag at a time (`activeTag`, a plain string-or-null), toggled by clicking a pill button. This adds the ability to filter by multiple tags at once, and to *exclude* reviews carrying a tag rather than only include them — matching the tag-filter behavior Steam itself uses, which this site already mirrors closely elsewhere (BBCode markup, Steam review copy, Steam library import).

Confirmed behavior:
- **Include logic is AND**: a review must have *every* tag marked "include" to show.
- **Exclude logic**: a review is hidden if it has *any* tag marked "exclude" (exclude always wins over include).
- **Interaction**: clicking a tag pill cycles neutral → include → exclude → neutral. No extra per-tag controls.

## Data model change (`app.js`)

Replace `let activeTag = null;` with a single state map:
```js
let tagFilterState = new Map(); // tag name -> 'include' | 'exclude'
```
Absence from the map means neutral. This keeps "clear all filters" trivial (`tagFilterState.clear()`).

## `renderTagFilters()` (app.js)

- Replace the `activeTag === name` active-class check with a lookup: `tagFilterState.get(name)` → `'include'` or `'exclude'` maps to CSS classes `included`/`excluded` on the button (no class = neutral).
- Replace the first "All" button with a "Clear" button that calls `tagFilterState.clear()` and re-renders. It's a plain action button now, not a toggle — no active-state highlighting needed.
- Click handler per tag button cycles state:
  ```js
  const cur = tagFilterState.get(name);
  const next = cur === undefined ? 'include' : cur === 'include' ? 'exclude' : undefined;
  if (next === undefined) tagFilterState.delete(name); else tagFilterState.set(name, next);
  render();
  ```

## `render()` filtering logic (app.js)

Replace:
```js
const visible = activeTag ? reviews.filter(r => (r.tags || []).includes(activeTag)) : reviews;
```
with an AND-include / OR-exclude pass:
```js
const included = [...tagFilterState].filter(([, s]) => s === 'include').map(([t]) => t);
const excluded = [...tagFilterState].filter(([, s]) => s === 'exclude').map(([t]) => t);
const visible = reviews.filter(r => {
  const tags = r.tags || [];
  if (excluded.some(t => tags.includes(t))) return false;
  return included.every(t => tags.includes(t));
});
```
Keeps the existing exact-string tag matching convention (no case-insensitivity change — tag matching elsewhere in this file is already exact-match; only category lookups are case-insensitive).

## `style.css`

Reuse the existing `--green`/`--red` variables (already used for `.badge.yes`/`.badge.no`) for a familiar include/exclude color pairing, distinct from `--accent` (used elsewhere for unrelated "active" states like the expanded card border):
```css
.tag-filter.included { background: var(--green); border-color: var(--green); color: #0f2a1e; }
.tag-filter.excluded { background: var(--red); border-color: var(--red); color: #fff; text-decoration: line-through; }
```
Remove the now-dead `.tag-filter.active` rule (nothing will set that class anymore).

## Verification

- Start the local server (`serve.ps1`) and load `index.html`.
- Click a tag once (turns green/"included"), click again (turns red/strikethrough "excluded"), click again (back to neutral).
- Select two tags as "include" and confirm only reviews with both show.
- Mark one tag "exclude" and confirm any review with that tag disappears, even if it matches included tags.
- Click "Clear" and confirm the full unfiltered list returns and all pills reset to neutral.
