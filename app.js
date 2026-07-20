let reviews = [];
let tagRegistry = [];
let tagCategories = [];
let expandedId = null;
// Tag name -> 'include' | 'exclude'; absent means neutral. A review must
// have every 'include' tag (AND) and none of the 'exclude' tags, matching
// Steam's own tag-filter behavior.
let tagFilterState = new Map();
// Narrows which tag pills renderTagFilterGroups() shows; doesn't affect
// which reviews are visible (that's tagFilterState above).
let tagSearchQuery = '';
// Filters the review list itself (unlike tagSearchQuery, which only narrows
// which tag pills show).
let titleSearchQuery = '';
let expandedBodyTab = 'steam';
let expandedSubTab = 0;
let showAllTags = false;

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
  });

  render();

  if (expandedId) {
    document.querySelector(`.card[data-id="${CSS.escape(expandedId)}"]`)?.scrollIntoView({ block: 'start' });
  }
}

// All distinct tag names in use, ordered by their category's position in
// tagCategories (unknown categories after known ones, uncategorized last),
// alphabetical within each group — so the filter bar's grouping stays stable.
function allTagNamesSorted() {
  const set = new Set();
  reviews.forEach(r => (r.tags || []).forEach(t => set.add(t)));

  const categoryOf = new Map(tagRegistry.map(t => [t.name.toLowerCase(), t.category || '']));
  const categoryOrder = new Map(tagCategories.map((c, i) => [c.name, i]));
  const rank = name => {
    const cat = categoryOf.get(name.toLowerCase()) || '';
    if (!cat) return Infinity;
    return categoryOrder.has(cat) ? categoryOrder.get(cat) : categoryOrder.size;
  };

  return [...set].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function renderTagFilters() {
  const el = document.getElementById('tag-filters');
  if (!allTagNamesSorted().length) { el.innerHTML = ''; return; }

  // The search input + Clear button are built once and never rebuilt by
  // subsequent renders (e.g. from an unrelated card click) — only
  // renderTagFilterGroups()'s own container gets replaced, so typing in the
  // search box never loses focus or cursor position mid-keystroke.
  if (!document.getElementById('tag-filters-top')) {
    el.innerHTML = `
      <div id="tag-filters-top">
        <input type="text" id="tag-search" placeholder="Search tags..." autocomplete="off">
      </div>
      <div id="tag-filter-groups"></div>
      <div id="tag-filters-bottom">
        <button class="tag-filter" id="tag-filter-clear">Clear</button>
      </div>
    `;
    document.getElementById('tag-search').addEventListener('input', e => {
      tagSearchQuery = e.target.value;
      renderTagFilterGroups();
    });
    document.getElementById('tag-filter-clear').addEventListener('click', () => {
      tagFilterState.clear();
      render();
    });
  }

  renderTagFilterGroups();
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

  const groups = groupTagNames(matches, tagRegistry);
  const filterBtn = name => {
    const state = tagFilterState.get(name);
    const cls = state ? ` ${state}d` : '';
    return `<button class="tag-filter${cls}" data-tag="${escHtml(name)}">${escHtml(name)}</button>`;
  };

  el.innerHTML = groups.map(g => `<div class="tag-group">${
    g.category ? `<span class="tag-group-label">${escHtml(g.category)}</span>` : ''
  }${g.entries.map(e => filterBtn(e.name)).join('')}</div>`).join('');

  el.querySelectorAll('.tag-filter[data-tag]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.tag;
      const cur = tagFilterState.get(name);
      const next = cur === undefined ? 'include' : cur === 'include' ? 'exclude' : undefined;
      if (next === undefined) tagFilterState.delete(name); else tagFilterState.set(name, next);
      render();
    });
  });
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
    const tags = r.tags || [];
    if (excluded.some(t => tags.includes(t))) return false;
    return included.every(t => tags.includes(t));
  });

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
