let reviews = [];
let tagRegistry = [];
let tagCategories = [];
let expandedId = null;
let activeTag = null;
let expandedBodyTab = 'steam';
let expandedSubTab = 0;

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
  })).join('');

  app.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      expandedId = expandedId === id ? null : id;
      expandedBodyTab = 'steam';
      expandedSubTab = 0;
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
}

init();
