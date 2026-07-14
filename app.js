let reviews = [];
let expandedId = null;
let activeTag = null;
let expandedBodyTab = 'steam';
let expandedSubTab = 0;

async function init() {
  reviews = JSON.parse(localStorage.getItem('gh_reviews_cache') || '[]');

  const requestedId = new URLSearchParams(location.search).get('review');
  if (requestedId && reviews.some(r => r.id === requestedId)) {
    expandedId = requestedId;
  }

  render();

  if (expandedId) {
    document.querySelector(`.card[data-id="${CSS.escape(expandedId)}"]`)?.scrollIntoView({ block: 'start' });
  }
}

function allTags() {
  const set = new Set();
  reviews.forEach(r => (r.tags || []).forEach(t => set.add(t)));
  return [...set].sort((a, b) => a.localeCompare(b));
}

function renderTagFilters() {
  const el = document.getElementById('tag-filters');
  const tags = allTags();
  if (!tags.length) { el.innerHTML = ''; return; }

  el.innerHTML = [
    `<button class="tag-filter ${activeTag === null ? 'active' : ''}" data-tag="">All</button>`,
    ...tags.map(t => `<button class="tag-filter ${activeTag === t ? 'active' : ''}" data-tag="${escHtml(t)}">${escHtml(t)}</button>`),
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
