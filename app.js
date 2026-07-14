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

  app.innerHTML = visible.map(r => {
    const expanded = expandedId === r.id;
    const appId = steamAppId(r.coverImage);
    const bodyTabs = [
      { id: 'steam', name: 'Steam Review', content: r.body },
      ...(r.tabs || []).filter(t => t.content),
    ];
    const showTabs  = true;
    const activeTab = bodyTabs.find(t => t.id === expandedBodyTab) || bodyTabs[0];
    const subTabs   = expanded ? splitSubTabs(activeTab.content) : null;
    const activeSub = subTabs ? subTabs[Math.min(expandedSubTab, subTabs.length - 1)] : null;
    return `
      <div class="card ${expanded ? 'expanded' : ''}" data-id="${escHtml(r.id)}">
        <div class="card-main">
          <div class="card-cover">
            ${r.coverImage ? `<img src="${escHtml(r.coverImage)}" alt="${escHtml(r.title)}">` : ''}
          </div>
          <div class="card-info">
            <h2><span class="card-title-text">${escHtml(r.title)}</span>${appId ? `<a class="steam-link" href="https://store.steampowered.com/app/${appId}/" target="_blank" rel="noopener noreferrer" title="View on Steam" onclick="event.stopPropagation()">${STEAM_ICON}</a>` : ''}</h2>
            <span class="badge ${r.recommended ? 'yes' : 'no'}">${r.recommended ? 'Recommended' : 'Not Recommended'}</span>
            <p class="summary">${escHtml(r.summary)}</p>
            <div class="meta">${r.hoursPlayed} hrs &middot; ${formatDate(r.datePosted)}</div>
            ${r.tags?.length ? `<div class="tag-list">${r.tags.map(t => `<span class="tag-badge">${escHtml(t)}</span>`).join('')}</div>` : ''}
          </div>
          <div class="card-chevron">${expanded ? '▲' : '▼'}</div>
        </div>
        ${expanded ? `
          <div class="card-expanded">
            ${bodyTabs.length ? `
              <div class="expanded-body">
                ${subTabs ? `
                  <div class="sub-tabs">
                    ${subTabs.map((st, i) => `<button type="button" class="sub-tab ${i === expandedSubTab ? 'active' : ''}" data-sub-tab="${i}">${escHtml(st.name)}</button>`).join('')}
                  </div>
                  ${renderBBCode(activeSub.content)}
                ` : renderBBCode(activeTab.content)}
              </div>
            ` : ''}
            ${r.pros?.length ? `
              <section>
                <h3>Pros</h3>
                <ul>${r.pros.map(p => `<li>${escHtml(p)}</li>`).join('')}</ul>
              </section>` : ''}
            ${r.cons?.length ? `
              <section>
                <h3>Cons</h3>
                <ul>${r.cons.map(c => `<li>${escHtml(c)}</li>`).join('')}</ul>
              </section>` : ''}
            ${r.verdict ? `
              <section class="verdict">
                <h3>Verdict</h3>
                <p>${escHtml(r.verdict)}</p>
              </section>` : ''}
            <div class="card-permalink">
              <a href="?review=${escHtml(r.id)}" onclick="event.stopPropagation()">${SITE_LINK_TEXT}</a>
            </div>
            ${showTabs ? `
              <div class="review-tabs">
                ${bodyTabs.map(t => `<button type="button" class="review-tab ${activeTab.id === t.id ? 'active' : ''}" data-review-tab="${escHtml(t.id)}">${escHtml(t.name)}</button>`).join('')}
              </div>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

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
