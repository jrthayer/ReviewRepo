# Recursive nested sub-tabs

## Context

Sub-tabs (`[tab=Name]...[/tab]` markup, parsed by `splitSubTabs` in `shared.js`) already let a single review tab's body split into a pill row of sub-tabs. This adds a sub-tab that itself contains sub-tabs, to arbitrary depth. Two design decisions, made explicitly rather than assumed:

- **Syntax**: reuse `[tab=Name]` recursively at every depth, no new tag. `splitSubTabs`'s current regex is non-greedy and not nesting-aware, so it currently mis-parses a `[tab=]` nested inside another `[tab=]` — it becomes a depth-aware scanner that only splits *immediate* children, leaving any deeper `[tab=]` markup untouched inside each child's `content` for a recursive call to find later.
- **Depth**: fully recursive, no hardcoded limit — this falls out for free once parsing/rendering/state are written recursively; capping would need *more* special-casing, not less.
- **Admin authoring**: the existing structured "sub-tab bar" UI (pill row with add/rename/delete/drag-reorder, currently a flat `activeSubTabs` array) works recursively at every depth too, rather than degrading to hand-typed markup below the first level, matching the polish of the rest of the admin editor.

## `shared.js` — parsing and rendering (the core; everything else follows this)

**`splitSubTabs(raw)`** (`shared.js:123`): replace the single non-greedy regex with a depth-aware scan that finds `[tab=Name]` opens and only closes on the `[/tab]` that brings nesting depth back to the level it opened at (skipping over nested `[tab=`/`[/tab]` pairs when counting). Return shape unchanged — `[{name, content}]` for the *immediate* children only; any deeper `[tab=]` markup stays untouched inside `content` for a later recursive call. This one change makes every existing consumer (`admin/index.html`'s `parseSubTabsForEditing`, `diffTabContent`) nesting-safe automatically, since they already just call `splitSubTabs` and recurse/iterate on the result.

**`renderCard(r, opts)`** (`shared.js:262`): replace the scalar `activeSubIndex` option with `activeSubPath = []` (array of indices, one per depth). Replace the current one-level `subTabs ? <pill row> + renderBBCode(activeSub.content) : renderBBCode(activeTab.content)` block (`shared.js:302-307`) with a recursive `renderSubTabLevel(content, path, depth = 0)` helper: splits `content`, renders a `.sub-tabs` row (`.sub-tabs-nested` when `depth > 0`) with `data-sub-level`/`data-sub-tab` on each button, then recurses into the active child's content at `depth + 1` — bottoming out at `renderBBCode(content)` once a leaf has no further `[tab=]` blocks.

## `app.js` — site state and click handling

- `expandedSubTab = 0` (`app.js:42`) → `expandedSubPath = []`; all reset points (card expand/collapse, `.review-tab` switch) set it to `[]` instead of `0`.
- `.sub-tab` click handler (`app.js:740-749`): reads both `data-sub-level` and `data-sub-tab`, truncates `expandedSubPath` to the clicked depth and sets that slot — so switching a shallower level resets any deeper selection back to default, same as switching a `.review-tab` already resets sub-tab state today.

## `admin/index.html` — recursive sub-tab bar editor

Replace the flat `activeSubTabs`/`activeSubTabId` pair with a stack, one entry per depth: `subTabStack = [{ tabs: [...], activeId }, ...]`, where index 0 is today's `activeSubTabs`/`activeSubTabId`. The textarea (`f-review-text`) always shows the **leaf** — the deepest active node with no children yet.

Generalize the existing flat functions to be depth-parameterized, reusing `parseSubTabsForEditing`/`serializeSubTabs`/`splitSubTabs` unchanged per level:
- `switchReviewTab`/`confirmDeleteReviewTab` build the initial stack and descend into any pre-existing nested children until reaching a leaf.
- `switchSubTab(id)` → `switchSubTabAtDepth(depth, id)`: cascades a sync up from the current deepest level to `depth`, truncates the stack, sets the new active id, then descends again into the new branch's children.
- `addSubTab()` → `addSubTabAtDepth(depth)`: same seed-from-existing-text logic as today, but appending a new level to the stack when called past the end (`depth === subTabStack.length`) — this is how a level nests one deeper.
- `startDeleteSubTab`/`confirmDeleteSubTab`/`cancelDeleteSubTab`/`reorderSubTabs`/`startRenameSubTab`: same depth parameter threaded through, operating on `subTabStack[depth]`.
- `syncActiveTabContent`: cascades bottom-up through the whole stack (leaf → parent's `content` via `serializeSubTabs` → ... → the review tab's raw content), instead of one flat step.
- `renderSubTabBar()`: renders one bar per stack entry (reusing the existing `.form-subtab`/`.sub-tab-bar` markup and wiring, looped), plus the existing empty-state `+ Sub-tab` button after the last level when the current leaf has no children yet, now calling `addSubTabAtDepth(subTabStack.length)`.
- `syncSitePreviewToActiveSubTab` → builds a `sitePreviewSubPath` array (one index per stack level) instead of the scalar `sitePreviewSubTab`; the Site Card Preview's own click wiring resolves `data-sub-level`/`data-sub-tab` back to a stack depth the same way.
- `diffTabContent` (`admin/index.html:2986`): the per-child comparison recurses instead of pushing the label directly when a matched-name child differs, so a change buried several levels deep reports a chain like `Tab: Pros & Cons — Combat — Weapons`.

## CSS

- `style.css`'s `.sub-tabs`/`.sub-tab` (`style.css:530-554`): add a `.sub-tabs-nested` modifier (smaller font/padding, slight indent, reduced margin) so stacked levels read as a hierarchy.
- `admin/index.html`'s inline `.sub-tab-bar` styling: same idea, a nested-level modifier with a matching indent for the editor's stacked bars.

## Verification

With `serve.ps1` running and `fetch` mocked before any save (a real GitHub PAT is configured in the test browser):
1. In the editor, split a tab into sub-tabs, nest a second level under one, and a third under that — confirm each level's pill bar renders stacked/indented, rename/delete/reorder work per level, switching a shallower pill resets deeper selection, and the textarea always shows the right leaf.
2. Confirm the Site Card Preview matches the editor at every depth.
3. Confirm the unsaved-changes indicator reports a nested diff label when only a deep leaf changes.
4. Load the public site directly and confirm nested pill rows render/behave the same way there, including permalink expand/scroll.
