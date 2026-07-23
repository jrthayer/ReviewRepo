# Sub-tabs preceded by a shared intro block

## Context

Sub-tabs (`[tab=Name]...[/tab]`, parsed by `splitSubTabs` in `shared.js`, rendered recursively by `renderSubTabLevel` — see `docs/plans/nested-sub-tabs.md`) currently only ever show the pill row + whichever tab is active; any plain text before the first `[tab=]` at that level is silently discarded, both on render and when hand-typed. This adds a shared intro block that stays visible above the pills no matter which sub-tab is active.

It also changes the admin editor's "+ Sub-tab" flow to match: previously, clicking it moved *all* of the current textarea's text into becoming the new first sub-tab's own content. Now that existing text stays behind as the shared intro, and a fresh blank sub-tab appears after it.

## `shared.js` — parsing and rendering

`splitSubTabs(raw)` tracks the index of the first top-level `[tab=` match and attaches the leading text as a `.preamble` property on the returned array — additive, so every existing `.length`/`.map`/`.find`/`if (!parsed)` caller keeps working unchanged.

`renderSubTabLevel(content, path, depth)` renders `subTabs.preamble` (via `renderBBCode`, wrapped in `.sub-tabs-preamble` for spacing) before the pill row whenever it's non-empty.

## `admin/index.html` — editor

`subTabStack` entries gain a `preamble` field. `parseSubTabsForEditing` forwards `splitSubTabs`'s `.preamble` the same additive way; `serializeSubTabs(tabs, preamble)` prepends it; `buildSubTabStack`/`switchSubTabAtDepth`'s descend-loop populate it when building/entering a level.

`addSubTabAtDepth(depth)`: starting a fresh split no longer seeds the new tab from the existing textarea text — that text becomes the level's `preamble` instead, and the new tab starts blank.

`renderSubTabBar`: each depth's row is now wrapped (`.sub-tab-level`, indented via `.sub-tab-level-nested` for `depth > 0`) around a small preamble `<textarea>` (only once that level has sub-tabs) above the existing pill row, live-synced into `level.preamble` on input.

## CSS

`.sub-tabs-preamble` in `style.css` (site-facing spacing); `.sub-tab-preamble`/`.sub-tab-level-nested` in admin's inline styles (editor textarea + indent).

## Verification

Typed an intro, clicked "+ Sub-tab", confirmed it stays as the intro (not swallowed into Tab 1); confirmed the Site Card Preview and public site both show the intro above the pills regardless of active tab; confirmed it works nested one level deep too; confirmed round-tripping through the raw `[tab=]` markup on save/reload.
