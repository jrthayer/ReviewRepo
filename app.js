let reviews = [];
let tagRegistry = [];
let tagCategories = [];
let expandedId = null;
let activeTag = null;
let expandedBodyTab = 'steam';
let expandedSubTab = 0;
let showAllTags = false;

async function init() {
  reviews = JSON.parse(localStorage.getItem('gh_reviews_cache') || '[]');
  tagRegistry = JSON.parse(localStorage.getItem('gh_tags_cache') || '[]');
  tagCategories = JSON.parse(localStorage.getItem('gh_tagcats_cache') || '[]');

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
        showAllTags = false;
        render();
        return;
      }
      expandedId = expandedId === id ? null : id;
      expandedBodyTab = 'steam';
      expandedSubTab = 0;
      showAllTags = false;
      render();
    });
  });

  app.querySelectorAll('.review-tab').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (btn.dataset.reviewTab === expandedBodyTab) return;
      expandedBodyTab = btn.dataset.reviewTab;
      expandedSubTab = 0;
      render();
    });
  });

  app.querySelectorAll('.sub-tab').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = Number(btn.dataset.subTab);
      if (idx === expandedSubTab) return;
      expandedSubTab = idx;
      render();
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
      if (expandedId !== id) {
        expandedId = id;
        expandedBodyTab = 'steam';
        expandedSubTab = 0;
        showAllTags = true;
      } else {
        showAllTags = !showAllTags;
      }
      render();
    });
  });
}

init();
