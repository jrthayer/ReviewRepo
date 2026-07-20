let reviews = [];
let tagRegistry = [];
let tagCategories = [];
let expandedId = null;
let activeTag = null;
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
  const names = allTagNamesSorted();
  if (!names.length) { el.innerHTML = ''; return; }

  const groups = groupTagNames(names, tagRegistry);
  const filterBtn = name => `<button class="tag-filter ${activeTag === name ? 'active' : ''}" data-tag="${escHtml(name)}">${escHtml(name)}</button>`;

  el.innerHTML = [
    `<button class="tag-filter ${activeTag === null ? 'active' : ''}" data-tag="">All</button>`,
    ...groups.map(g => g.category
      ? `<div class="tag-group"><span class="tag-group-label">${escHtml(g.category)}</span>${g.entries.map(e => filterBtn(e.name)).join('')}</div>`
      : g.entries.map(e => filterBtn(e.name)).join('')),
  ].join('');

  el.querySelectorAll('.tag-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTag = btn.dataset.tag || null;
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
  const before = document.querySelector(`.card[data-id="${CSS.escape(cardId)}"]`)?.getBoundingClientRect().top;
  // Whether the card's own top edge was still on-screen (as opposed to
  // scrolled past, e.g. while reading deep into a long expanded body).
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

  const afterCard = document.querySelector(`.card[data-id="${CSS.escape(cardId)}"]`);
  let targetScrollY = oldScrollY;
  if (afterCard) {
    if (topWasInView) {
      targetScrollY = oldScrollY + (afterCard.getBoundingClientRect().top - before);
    } else {
      // The card's top had already scrolled out of view (you were reading
      // deep into its body when it collapsed/changed) — there's no pixel
      // offset left to restore, since the content you were looking at is
      // gone. Bring the card's new, much shorter top back into view instead
      // of leaving scrollY where it was, which would otherwise strand the
      // viewport on whatever unrelated content shifted into that same spot.
      // Its own margin-top (see .card/.card.expanded in style.css) is left
      // visible above it rather than scrolled past — flush against the
      // viewport edge looks cramped.
      const marginTop = parseFloat(getComputedStyle(afterCard).marginTop) || 0;
      targetScrollY = oldScrollY + (afterCard.getBoundingClientRect().top - marginTop);
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
  const visible = activeTag ? reviews.filter(r => (r.tags || []).includes(activeTag)) : reviews;

  if (!reviews.length) {
    app.innerHTML = '<p class="state-msg">No reviews yet.</p>';
    return;
  }
  if (!visible.length) {
    app.innerHTML = '<p class="state-msg">No reviews with this tag.</p>';
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
