# Categorized tags (global tag registry)

> Implemented in commit: [`883cb54`](https://github.com/jrthayer/ReviewRepo/commit/883cb54) — note the design evolved somewhat during implementation (see the conversation this plan came from): tags are recategorized by dragging onto a category line rather than via a picker at creation time, there's no delete-tag UI, tag/category edits are buffered locally and flushed together with the next review save via a Git Data API multi-file commit (rather than pushed individually), and automated commits use a fixed non-personal identity so they don't count on the token owner's contribution graph.

## Context

Reviews carry a flat `tags: []` array of plain strings, rendered as an unordered row of pills on both the card (`shared.js`) and the site's filter bar (`app.js`), and edited as removable chips in the admin form. This adds many-tags-per-review organized into sub-categories (e.g. Genre, Mood, Platform). Requirements:
- Categories are **dynamic** — managed/persisted the same way `customTabs`/`customBlocks` are (their own JSON file in the configured GitHub repo, CRUD'd from admin), not a hardcoded preset.
- A tag's category is **global, not per-review**: each distinct tag name is defined once with one category (a small taxonomy), so the same tag always shows the same category everywhere, and recategorizing it applies retroactively everywhere it's used — no need to fix it review-by-review.
- Grouping shows up on **both the card and the site's tag filter bar**.

## Data model

Two new persisted files (same lifecycle as `data/custom-blocks.json`/`data/custom-tabs.json`):
- `data/tag-categories.json`: `[{ id, name }]` — the list of category names. Add/delete only (no rename), matching the existing blocks/tabs pattern.
- `data/tags.json`: the master tag registry — `[{ id, name, category }]`, where `category` is a category **name** string (`''` = uncategorized) rather than an id — consistent with this app's existing loose-reference style (no cascading updates elsewhere either).

**Reviews are unaffected**: `tags: []` stays exactly as it is today — a flat array of plain tag-name strings. A tag's category is resolved by looking its name up in the registry at render/edit time, not stored on the review. No data migration and no backward-compat shimming for `reviews.json` — existing tags keep working immediately and simply show as uncategorized until (optionally) added to the registry with a category.

Deleting a category or a registry tag does not touch `reviews.json` — a review referencing a tag name no longer in the registry just renders it as uncategorized (or, for a deleted category, the tag keeps its stale category string until someone reassigns it via the manager). This matches the "no cascading cleanup" behavior already accepted elsewhere (e.g. deleting a saved block doesn't touch reviews that already inserted its text).

## `shared.js` (used by both site and admin)

- `groupTagNames(tagNames, tagRegistry)`: builds a `name → category` lookup from `tagRegistry` (case-insensitive), then groups `tagNames` into `[{ category, entries: [{ name, index }] }]` in order of first appearance, uncategorized (`''` / unknown name) collected into a trailing unlabeled group. `index` = original position in `tagNames`, used by admin's chip removal; unused by the card renderer.
- `renderTagList(tagNames, tagRegistry)` renders the grouped `.tag-group`/`.tag-badge` markup inside `.tag-list`; `renderCard()` calls it with `opts.tagRegistry` (default `[]`).

## `style.css`

`.tag-group` (inline flex cluster) and `.tag-group-label` (small uppercase muted label) near the existing `.tag-list`/`.tag-badge` rules.

## `app.js` (public site)

- `init()` also reads `tagRegistry`/`tagCategories` from `localStorage` (`gh_tags_cache`/`gh_tagcats_cache`), populated by admin.
- `allTagNamesSorted()`/`renderTagFilters()` group filter buttons by category, ordered by `tagCategories` list order, reusing `.tag-group`/`.tag-group-label`.
- Filtering stays value-based (unchanged `activeTag` string) — category grouping in the filter bar is a display aid only.

## `admin.html`

- **Persistence**: `tagCategories`/`tagRegistry` state, `fetchTagCategoriesFile`/`pushTagCategoriesFile`, `fetchTagsRegistryFile`/`pushTagsRegistryFile` (wrapping `ghGetJson`/`ghPutJson`), `cacheTagCategories`/`cacheTagRegistry`, `loadTagCategoriesList`/`loadTagRegistryList` wired into `loadReviewList()`.
- **Per-review tag input**: chips grouped via `groupTagNames`; autocomplete suggests from `tagRegistry` with a category hint; typing a brand-new name opens an inline "New tag ... — category:" row (`startCreateTag`/`confirmCreateTag`/`cancelCreateTag`) that registers the tag in `data/tags.json` and attaches it to the review in one step.
- **Manage Tags panel** (`toggleTagManager`/`renderTagManager`): a dropdown listing categories (add/delete) and every registry tag (reassign category via a live-saving `<select>`, delete, or add a new one) — the `start*`/`confirm*`/`cancel*` trio throughout, matching the established custom-blocks/tabs pattern.
- Export/import needed **no changes** — tags remain flat name strings in both the review object and the `Tags: a, b, c` export line; category is resolved from the registry at render time.

## CLAUDE.md

Documented `data/tag-categories.json` + `data/tags.json` as a global tag registry pattern, alongside the existing "Custom format blocks & saved tabs" section.
