let reviews = [];
let tagRegistry = [];
let tagCategories = [];
let expandedId = null;
// Tag name -> 'include' | 'exclude'; absent means neutral. A review must
// have every 'include' tag (AND) and none of the 'exclude' tags, matching
// Steam's own tag-filter behavior.
let tagFilterState = new Map();
// Tag names shown in the persistent "Filter tags:" row (renderActiveTagFilters)
// under the search box — a tag joins this the first time it's clicked
// anywhere (category row or that row itself) and stays until its × is
// clicked, surviving a cycle back to neutral (tagFilterState has no entry
// for it) so you don't have to search for it again to reapply it.
let tagFilterPinned = new Set();
// Narrows which tag pills renderTagFilterGroups() shows; doesn't affect
// which reviews are visible (that's tagFilterState above).
let tagSearchQuery = '';
// Filters the review list itself (unlike tagSearchQuery, which only narrows
// which tag pills show).
let titleSearchQuery = '';
// Same tri-state cycle as tagFilterState, for the single Recommended toggle
// below the tag filter section: undefined (neutral) -> 'include' (must be
// recommended) -> 'exclude' (must be not recommended) -> neutral.
let recommendedFilter;
// Sort direction for the Playtime?/Price? toggles below Recommended? —
// undefined (neutral, list keeps its natural/save order), 'asc', or 'desc'.
// Mutually exclusive with each other (see wireSortButton): turning one on
// resets the other to neutral, so at most one custom sort applies at a time.
let playtimeSort;
let priceSort;
let expandedBodyTab = 'steam';
let expandedSubTab = 0;
let showAllTags = false;

// Advances a tri-state filter value (undefined -> 'include' -> 'exclude' ->
// undefined), shared by tag pills and the Recommended toggle.
function cycleTriState(cur) {
  return cur === undefined ? 'include' : cur === 'include' ? 'exclude' : undefined;
}

// Same tri-state shape as cycleTriState, just with sort-direction labels
// instead of include/exclude — kept separate so a sort field's value reads
// as 'asc'/'desc' rather than the semantically-mismatched 'include'/'exclude'.
// Starts at 'desc' (most playtime/priciest first) rather than 'asc', since
// that's the more useful default first click for both Playtime and Price.
function cycleSortState(cur) {
  return cur === undefined ? 'desc' : cur === 'desc' ? 'asc' : undefined;
}

// A review's retail price, parsed from its own Monetization tag (e.g. "$20
// Retail") rather than a dedicated field — there isn't one. Returns null
// (not 0) when no such tag is present, e.g. a purely "episodic" review with
// no retail tag at all, so sortByPrice can tell "no price" apart from "free."
function reviewPrice(r) {
  for (const t of r.tags || []) {
    const m = /^\$(\d+(?:\.\d+)?)\s*retail$/i.exec(t.trim());
    if (m) return Number(m[1]);
  }
  return null;
}

// Refreshes both sort buttons' text/active styling from the current
// playtimeSort/priceSort — called after either one is clicked (rather than
// each handler only touching its own button) so the mutual-exclusivity
// reset is always reflected on screen, not just in state.
function updateSortToggleButtons() {
  const setLabel = (id, state, label) => {
    const btn = document.getElementById(id);
    btn.textContent = state === 'asc' ? `${label} ↑` : state === 'desc' ? `${label} ↓` : `${label}?`;
    btn.classList.toggle('sort-active', !!state);
  };
  setLabel('playtime-sort-btn', playtimeSort, 'Playtime');
  setLabel('price-sort-btn', priceSort, 'Price');
}

// Shared by every clickable tag pill (category rows and the pinned "Filter
// tags:" row alike) — cycles its filter state and, distinctly from that
// state, pins it to the active row so it's still there (in its neutral
// style) even once cycled back off, rather than requiring a re-search to
// bring it back. Only removeTagFilterPin (the pill's ×) actually unpins it.
function cycleTagFilter(name) {
  const next = cycleTriState(tagFilterState.get(name));
  if (next === undefined) tagFilterState.delete(name); else tagFilterState.set(name, next);
  tagFilterPinned.add(name);
  render();
}

function removeTagFilterPin(name) {
  tagFilterState.delete(name);
  tagFilterPinned.delete(name);
  render();
}

// Hamburger when the tag filter panel is collapsed, × when it's open —
// called after anything that changes #tag-filters' collapsed state (the
// toggle itself, and the panel's own Close button).
function updateTagFiltersToggleIcon() {
  const collapsed = document.getElementById('tag-filters').classList.contains('collapsed');
  const btn = document.getElementById('tag-filters-toggle');
  btn.innerHTML = collapsed ? '&#9776;' : '&times;';
  btn.classList.toggle('open', !collapsed);
}

async function init() {
  const cachedReviews = localStorage.getItem('gh_reviews_cache');
  if (cachedReviews !== null) {
    reviews = JSON.parse(cachedReviews);
    tagRegistry = JSON.parse(localStorage.getItem('gh_tags_cache') || '[]');
    tagCategories = JSON.parse(localStorage.getItem('gh_tagcats_cache') || '[]');
  } else {
    // No admin session has ever configured/cached anything in this browser —
    // fall back to the public default data repo (DEFAULT_DATA_REPO,
    // shared.js) so a fresh visitor sees real reviews instead of "No
    // reviews yet." Deliberately kept out of the gh_*_cache keys: those mean
    // "what admin last loaded/saved from its configured repo," and this
    // isn't that — configuring a real repo later should behave exactly as
    // if this fallback never happened.
    const [defaultReviews, defaultTagCategories, defaultTags] = await Promise.all([
      fetchDefaultRepoJson('data/reviews.json'),
      fetchDefaultRepoJson('data/tag-categories.json'),
      fetchDefaultRepoJson('data/tags.json'),
    ]);
    reviews = defaultReviews || [];
    tagCategories = defaultTagCategories || [];
    tagRegistry = defaultTags || [];
  }

  // Same-browser preview: shows any in-progress admin.html edits (saved
  // locally but not yet pushed to GitHub) as if they were already live — see
  // applyLocalDrafts in shared.js. Only ever affects this browser; nobody
  // else visiting the real site sees these.
  reviews = applyLocalDrafts(reviews);

  const requestedId = new URLSearchParams(location.search).get('review');
  if (requestedId && reviews.some(r => r.id === requestedId)) {
    expandedId = requestedId;
  }

  document.getElementById('title-search').addEventListener('input', e => {
    titleSearchQuery = e.target.value;
    render();
  });
  // Pure visibility toggle — doesn't touch tagFilterState/tagSearchQuery, so
  // filters already applied stay applied while the panel is hidden.
  document.getElementById('tag-filters-toggle').addEventListener('click', () => {
    document.getElementById('tag-filters').classList.toggle('collapsed');
    updateTagFiltersToggleIcon();
    // Re-run truncation now that the panel's actual width is measurable —
    // the render() that originally built these rows may have run while it
    // was still display:none (e.g. on page load, where it starts collapsed).
    truncateTagGroups();
  });

  // Row widths depend on viewport width, so a wrap threshold computed once
  // can go stale after a resize; re-measure (debounced) whenever the panel
  // is actually open.
  let tagGroupResizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(tagGroupResizeTimer);
    tagGroupResizeTimer = setTimeout(truncateTagGroups, 150);
  });

  document.getElementById('recommend-filter-btn').addEventListener('click', e => {
    recommendedFilter = cycleTriState(recommendedFilter);
    e.target.classList.toggle('included', recommendedFilter === 'include');
    e.target.classList.toggle('excluded', recommendedFilter === 'exclude');
    e.target.textContent = recommendedFilter === 'include' ? 'Recommended'
      : recommendedFilter === 'exclude' ? 'Not Recommended'
      : 'Recommended?';
    render();
  });

  document.getElementById('playtime-sort-btn').addEventListener('click', () => {
    playtimeSort = cycleSortState(playtimeSort);
    priceSort = undefined;
    updateSortToggleButtons();
    render();
  });

  document.getElementById('price-sort-btn').addEventListener('click', () => {
    priceSort = cycleSortState(priceSort);
    playtimeSort = undefined;
    updateSortToggleButtons();
    render();
  });

  render();

  if (expandedId) {
    document.querySelector(`.card[data-id="${CSS.escape(expandedId)}"]`)?.scrollIntoView({ block: 'start' });
  }
}

// All distinct tag names in use, ordered by their category's position in
// tagCategories (unknown categories after known ones, uncategorized last);
// within each group, most-used tag (by review count) first, alphabetical
// among ties — so a category row's truncation (truncateTagGroup) folds away
// its least-common tags first rather than an arbitrary alphabetical tail.
function allTagNamesSorted() {
  const counts = new Map();
  reviews.forEach(r => (r.tags || []).forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));

  const categoryOf = new Map(tagRegistry.map(t => [t.name.toLowerCase(), t.category || '']));
  const categoryOrder = new Map(tagCategories.map((c, i) => [c.name, i]));
  const rank = name => {
    const cat = categoryOf.get(name.toLowerCase()) || '';
    if (!cat) return Infinity;
    return categoryOrder.has(cat) ? categoryOrder.get(cat) : categoryOrder.size;
  };

  return [...counts.keys()].sort((a, b) =>
    rank(a) - rank(b) || counts.get(b) - counts.get(a) || a.localeCompare(b));
}

function renderTagFilters() {
  const el = document.getElementById('tag-filters');
  if (!allTagNamesSorted().length) { el.innerHTML = ''; return; }

  // The search input + Clear/Close buttons are built once and never rebuilt
  // by subsequent renders (e.g. from an unrelated card click) — only
  // renderTagFilterGroups()'s own container gets replaced, so typing in the
  // search box never loses focus or cursor position mid-keystroke.
  if (!document.getElementById('tag-filters-top')) {
    el.innerHTML = `
      <div id="tag-filters-top">
        <input type="text" id="tag-search" placeholder="Search tags..." autocomplete="off">
        <button type="button" id="tag-search-clear" title="Clear search" aria-label="Clear tag search" style="display:none">&times;</button>
      </div>
      <div id="tag-filters-active"></div>
      <div id="tag-filter-groups"></div>
      <div id="tag-filters-bottom">
        <button class="tag-filter" id="tag-filter-clear">Clear Tags</button>
        <button class="tag-filter" id="tag-filter-close">Close</button>
      </div>
    `;
    const tagSearchClearBtn = document.getElementById('tag-search-clear');
    document.getElementById('tag-search').addEventListener('input', e => {
      tagSearchQuery = e.target.value;
      tagSearchClearBtn.style.display = tagSearchQuery ? '' : 'none';
      renderTagFilterGroups();
    });
    tagSearchClearBtn.addEventListener('click', () => {
      tagSearchQuery = '';
      const input = document.getElementById('tag-search');
      input.value = '';
      input.focus();
      tagSearchClearBtn.style.display = 'none';
      renderTagFilterGroups();
    });
    document.getElementById('tag-filter-clear').addEventListener('click', () => {
      tagFilterState.clear();
      tagFilterPinned.clear();
      render();
    });
    // Same panel this button lives in is only visible when open, so this
    // always means "close" — no need to toggle like the hamburger does.
    document.getElementById('tag-filter-close').addEventListener('click', () => {
      document.getElementById('tag-filters').classList.add('collapsed');
      updateTagFiltersToggleIcon();
    });
  }

  renderActiveTagFilters();
  renderTagFilterGroups();
}

// A persistent row of every pinned tag (tagFilterPinned, see its declaration
// above), directly under the search box — unlike the category groups below
// (renderTagFilterGroups), this is never cleared by a search query and never
// subject to truncateTagGroup's one-line folding, so a pinned tag always
// stays visible/clickable here no matter how it sorts, whether it's
// currently include/exclude/neutral, or whether its own category row happens
// to be showing it too (deliberately shown in both places at once). The
// "Filter tags:" header always renders, even with nothing pinned yet.
function renderActiveTagFilters() {
  const el = document.getElementById('tag-filters-active');
  if (!el) return;

  const names = allTagNamesSorted().filter(n => tagFilterPinned.has(n));
  const pill = name => {
    const state = tagFilterState.get(name);
    const cls = state ? ` ${state}d` : '';
    return `
      <span class="tag-filter-pinned${cls}">
        <button type="button" class="tag-filter-pinned-label" data-tag="${escHtml(name)}">${escHtml(name)}</button>
        <button type="button" class="tag-filter-pinned-remove" data-remove-tag="${escHtml(name)}" title="Remove from filters" aria-label="Remove ${escHtml(name)} filter">&times;</button>
      </span>`;
  };

  el.innerHTML = `<span class="tag-group-label">Filter tags:</span>${names.map(pill).join('')}`;

  el.querySelectorAll('.tag-filter-pinned-label').forEach(btn => {
    btn.addEventListener('click', () => cycleTagFilter(btn.dataset.tag));
  });
  el.querySelectorAll('.tag-filter-pinned-remove').forEach(btn => {
    btn.addEventListener('click', () => removeTagFilterPin(btn.dataset.removeTag));
  });
}

function renderTagFilterGroups() {
  const el = document.getElementById('tag-filter-groups');
  const names = allTagNamesSorted();
  const query = tagSearchQuery.trim().toLowerCase();
  const matches = query ? names.filter(n => n.toLowerCase().includes(query)) : names;

  if (!matches.length) {
    el.innerHTML = `<p class="tag-filter-empty">No matching tags.</p>`;
    return;
  }

  const groups = groupTagNames(matches, tagRegistry, tagCategories);
  const filterBtn = name => {
    const state = tagFilterState.get(name);
    const cls = state ? ` ${state}d` : '';
    return `<button class="tag-filter${cls}" data-tag="${escHtml(name)}">${escHtml(name)}</button>`;
  };

  el.innerHTML = groups.map(g => `<div class="tag-group">${
    g.category ? `<span class="tag-group-label">${escHtml(g.category)}</span>` : ''
  }${g.entries.map(e => filterBtn(e.name)).join('')}</div>`).join('');

  el.querySelectorAll('.tag-filter[data-tag]').forEach(btn => {
    btn.addEventListener('click', () => cycleTagFilter(btn.dataset.tag));
  });

  truncateTagGroups();
}

// Collapses each category row to a single line, replacing whichever trailing
// tags would otherwise wrap onto a second line with a "+N" count — purely a
// visual indicator (not clickable; the search box above is still how you
// reach a hidden tag). No-ops while the panel is closed (its container is
// display:none, so widths/heights all read as 0 and truncation would hide
// everything) — the toggle handler and the resize listener below both
// re-run this once the panel is actually visible/resized.
function truncateTagGroups() {
  const el = document.getElementById('tag-filter-groups');
  if (!el || el.offsetParent === null) return;
  el.querySelectorAll('.tag-group').forEach(truncateTagGroup);
}

function truncateTagGroup(group) {
  // Undo whatever an earlier pass left behind (a resize can call this
  // multiple times on the same, already-truncated rows) before re-measuring.
  group.querySelector('.tag-filter-more')?.remove();
  const buttons = [...group.querySelectorAll('.tag-filter[data-tag]')];
  buttons.forEach(b => { b.style.display = ''; });
  if (buttons.length < 2) return;

  const lineHeight = buttons[0].offsetHeight;
  const fitsOneLine = () => group.scrollHeight <= lineHeight + 4;
  if (fitsOneLine()) return;

  // Find how many tags actually overflow on their own merits first, with no
  // "+N" pill in the row yet to compete for space — only once that's settled
  // do we add the pill, and only give up one more real tag if the pill
  // itself doesn't fit in whatever room the true overflow already freed up.
  // Otherwise the pill's own width would routinely bump an extra tag or two
  // that would've fit fine, condensing more of the row than actually overflowed.
  let visibleCount = buttons.length;
  while (visibleCount > 1 && !fitsOneLine()) {
    visibleCount--;
    buttons[visibleCount].style.display = 'none';
  }

  const more = document.createElement('span');
  more.className = 'tag-filter tag-filter-more';
  more.textContent = `+${buttons.length - visibleCount}`;
  group.appendChild(more);

  while (visibleCount > 1 && !fitsOneLine()) {
    visibleCount--;
    buttons[visibleCount].style.display = 'none';
    more.textContent = `+${buttons.length - visibleCount}`;
  }
}

// Bottom spacer that guarantees enough scroll room to hold a card's
// on-screen position across a mutation that shrinks the page (e.g.
// collapsing a long review). Without it, the browser clamps scrollY to the
// new shorter max as soon as the DOM shrinks, before any compensating
// scroll adjustment gets a chance to run — so the card lands wherever that
// clamp puts it instead of back where it was. Sized down to the minimum
// actually needed for the specific target scroll position once it's known
// (see reRenderPreservingCardPosition), not left at whatever oversized
// value prevented the clamp.
let scrollSpacer = null;

function ensureScrollSpacer() {
  if (!scrollSpacer) {
    scrollSpacer = document.createElement('div');
    scrollSpacer.style.cssText = 'pointer-events:none;';
    document.body.appendChild(scrollSpacer);
  }
  return scrollSpacer;
}

// Drops (or shrinks) the spacer once real content already fills the
// viewport without it, so it doesn't linger as dead space below the last
// card that you could otherwise scroll into.
function trimScrollSpacer() {
  if (!scrollSpacer) return;
  const contentBottom = document.documentElement.scrollHeight - scrollSpacer.offsetHeight;
  if (window.scrollY + window.innerHeight <= contentBottom) {
    scrollSpacer.remove();
    scrollSpacer = null;
  }
}

window.addEventListener('scroll', trimScrollSpacer, { passive: true });

// Re-renders after mutating state, then compensates scroll so `cardId`'s
// card stays at the same viewport position. Without this, expanding one
// card while another collapses (only one can be expanded at a time) shifts
// everything above the click point, making the card you just clicked jump
// out from under the cursor.
function reRenderPreservingCardPosition(cardId, mutate) {
  const oldScrollY = window.scrollY;
  const viewportHeight = window.innerHeight;

  // When a *different* card is currently expanded and about to
  // auto-collapse as a side effect of this click (only one card can be
  // expanded at a time), anchor on whichever of the two cards comes first
  // in the list, not always the one that was already expanded. A card's
  // own top position never moves regardless of whether it's the one
  // collapsing or the one expanding — only content below it shifts — so
  // the earlier card is always a small, reliable anchor. Anchoring on the
  // later one instead would require scrolling further down to hold it in
  // place whenever the earlier (clicked) card grows, pushing the card you
  // just clicked to see further out of view above the viewport.
  const otherCardWasExpanded = expandedId !== null && expandedId !== cardId;
  let anchorId = cardId;
  if (otherCardWasExpanded) {
    const clickedIndex = reviews.findIndex(r => r.id === cardId);
    const otherIndex = reviews.findIndex(r => r.id === expandedId);
    anchorId = otherIndex < clickedIndex ? expandedId : cardId;
  }

  const before = document.querySelector(`.card[data-id="${CSS.escape(anchorId)}"]`)?.getBoundingClientRect().top;
  // Whether the anchor card's own top edge was still on-screen (as opposed
  // to scrolled past, e.g. while reading deep into a long expanded body).
  const topWasInView = before != null && before >= 0;

  // Oversize the spacer up front purely so this mutation can't shrink the
  // page far enough to trigger the browser's auto-clamp mid-reflow — it
  // gets shrunk back down to the real minimum below, once the target
  // scroll position is known.
  const spacer = ensureScrollSpacer();
  const oldContentHeight = document.documentElement.scrollHeight - spacer.offsetHeight;
  spacer.style.height = `${oldContentHeight}px`;

  mutate();
  render();

  const afterAnchor = document.querySelector(`.card[data-id="${CSS.escape(anchorId)}"]`);
  let targetScrollY = oldScrollY;
  if (afterAnchor) {
    if (topWasInView) {
      targetScrollY = oldScrollY + (afterAnchor.getBoundingClientRect().top - before);
    } else {
      // The anchor's top had already scrolled out of view (you were
      // reading deep into its body when it collapsed/changed) — there's no
      // pixel offset left to restore, since the content you were looking
      // at is gone. Bring its new, much shorter top back into view instead
      // of leaving scrollY where it was, which would otherwise strand the
      // viewport on whatever unrelated content shifted into that same
      // spot. Its own margin-top (see .card/.card.expanded in style.css)
      // is left visible above it rather than scrolled past — flush against
      // the viewport edge looks cramped.
      const marginTop = parseFloat(getComputedStyle(afterAnchor).marginTop) || 0;
      targetScrollY = oldScrollY + (afterAnchor.getBoundingClientRect().top - marginTop);
    }
  }
  targetScrollY = Math.max(0, targetScrollY);

  // Shrink the spacer to the least height that still lets targetScrollY be
  // reached without another clamp, instead of leaving it at the oversized
  // value from above (which would otherwise sit below the real content as
  // dead scrollable space until you scrolled back up past it).
  const newContentHeight = document.documentElement.scrollHeight - spacer.offsetHeight;
  spacer.style.height = `${Math.max(0, targetScrollY + viewportHeight - newContentHeight)}px`;

  window.scrollTo(0, targetScrollY);

  trimScrollSpacer();
}

function render() {
  renderTagFilters();

  const app = document.getElementById('app');
  const included = [...tagFilterState].filter(([, s]) => s === 'include').map(([t]) => t);
  const excluded = [...tagFilterState].filter(([, s]) => s === 'exclude').map(([t]) => t);
  const titleQuery = titleSearchQuery.trim().toLowerCase();
  const visible = reviews.filter(r => {
    if (titleQuery && !r.title.toLowerCase().includes(titleQuery)) return false;
    if (recommendedFilter === 'include' && !r.recommended) return false;
    if (recommendedFilter === 'exclude' && r.recommended) return false;
    const tags = r.tags || [];
    if (excluded.some(t => tags.includes(t))) return false;
    return included.every(t => tags.includes(t));
  });

  // Mutually exclusive (see the button handlers in init()) — at most one of
  // these actually sorts the list; neither touches which reviews are
  // visible, only their order.
  if (playtimeSort) {
    visible.sort((a, b) => playtimeSort === 'asc' ? a.hoursPlayed - b.hoursPlayed : b.hoursPlayed - a.hoursPlayed);
  } else if (priceSort) {
    // No price tag at all (see reviewPrice) always sorts last, regardless
    // of direction — "unknown" isn't the same as "cheapest."
    visible.sort((a, b) => {
      const pa = reviewPrice(a), pb = reviewPrice(b);
      if (pa === null && pb === null) return 0;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return priceSort === 'asc' ? pa - pb : pb - pa;
    });
  }

  if (!reviews.length) {
    app.innerHTML = '<p class="state-msg">No reviews yet.</p>';
    return;
  }
  if (!visible.length) {
    app.innerHTML = '<p class="state-msg">No reviews match these filters.</p>';
    return;
  }

  app.innerHTML = visible.map(r => renderCard(r, {
    expanded: expandedId === r.id,
    activeTabId: expandedBodyTab,
    activeSubIndex: expandedSubTab,
    permalinkHref: `?review=${r.id}`,
    tagRegistry,
    tagCategories,
    showAllTags: expandedId === r.id && showAllTags,
  })).join('');

  app.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      // Clicking an already-expanded card with its tag list open just closes
      // that list first — a second click is needed to collapse the card
      // itself, same as clicking a tab doesn't collapse the card either.
      if (expandedId === id && showAllTags) {
        reRenderPreservingCardPosition(id, () => { showAllTags = false; });
        return;
      }
      reRenderPreservingCardPosition(id, () => {
        expandedId = expandedId === id ? null : id;
        expandedBodyTab = 'steam';
        expandedSubTab = 0;
        showAllTags = false;
      });
    });
  });

  app.querySelectorAll('.review-tab').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (btn.dataset.reviewTab === expandedBodyTab) return;
      reRenderPreservingCardPosition(btn.closest('.card').dataset.id, () => {
        expandedBodyTab = btn.dataset.reviewTab;
        expandedSubTab = 0;
      });
    });
  });

  app.querySelectorAll('.sub-tab').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = Number(btn.dataset.subTab);
      if (idx === expandedSubTab) return;
      reRenderPreservingCardPosition(btn.closest('.card').dataset.id, () => {
        expandedSubTab = idx;
      });
    });
  });

  // The "+"/"−" button at the end of the Core Tags row (see renderCoreTags,
  // shared.js) expands the card (if collapsed) and reveals the full
  // category-grouped tag list at the top of the tab content; clicking it
  // again on an already-expanded card just toggles that list off.
  app.querySelectorAll('[data-toggle-tags]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.closest('.card').dataset.id;
      reRenderPreservingCardPosition(id, () => {
        if (expandedId !== id) {
          expandedId = id;
          expandedBodyTab = 'steam';
          expandedSubTab = 0;
          showAllTags = true;
        } else {
          showAllTags = !showAllTags;
        }
      });
    });
  });
}

init();
