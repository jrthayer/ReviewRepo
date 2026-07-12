let reviews = [];
let expandedId = null;
let activeTag = null;
let expandedBodyTab = 'steam';

async function init() {
  reviews = JSON.parse(localStorage.getItem('gh_reviews_cache') || '[]');
  render();
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
    const bodyTabs = [
      { id: 'steam', name: 'Steam Review', content: r.body },
      ...(r.tabs || []),
    ].filter(t => t.content);
    const showTabs  = bodyTabs.length > 1;
    const activeTab = bodyTabs.find(t => t.id === expandedBodyTab) || bodyTabs[0];
    return `
      <div class="card ${expanded ? 'expanded' : ''}" data-id="${escHtml(r.id)}">
        <div class="card-main">
          <div class="card-cover">
            ${r.coverImage ? `<img src="${escHtml(r.coverImage)}" alt="${escHtml(r.title)}">` : ''}
          </div>
          <div class="card-info">
            <h2>${escHtml(r.title)}</h2>
            <span class="badge ${r.recommended ? 'yes' : 'no'}">${r.recommended ? 'Recommended' : 'Not Recommended'}</span>
            <p class="summary">${escHtml(r.summary)}</p>
            <div class="meta">${r.hoursPlayed} hrs &middot; ${formatDate(r.datePosted)}</div>
            ${r.tags?.length ? `<div class="tag-list">${r.tags.map(t => `<span class="tag-badge">${escHtml(t)}</span>`).join('')}</div>` : ''}
          </div>
          <div class="card-chevron">${expanded ? '▲' : '▼'}</div>
        </div>
        ${expanded ? `
          <div class="card-expanded">
            ${bodyTabs.length ? `<div class="expanded-body">${renderBBCode(activeTab.content)}</div>` : ''}
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
      render();
    });
  });

  app.querySelectorAll('.review-tab').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      expandedBodyTab = btn.dataset.reviewTab;
      render();
    });
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderBBCode(raw) {
  if (!raw) return '';
  let html = escHtml(raw);

  const noparseBlocks = [];
  html = html.replace(/\[noparse\]([\s\S]*?)\[\/noparse\]/gi, (_, inner) => {
    const token = `NP${noparseBlocks.length}`;
    noparseBlocks.push(inner.replace(/\n/g, '<br>'));
    return token;
  });

  html = html.replace(/\[table\]([\s\S]*?)\[\/table\]/gi, (_, tableInner) => {
    const rows = [...tableInner.matchAll(/\[tr\]([\s\S]*?)\[\/tr\]/gi)].map(m => {
      const cells = [...m[1].matchAll(/\[(th|td)\]([\s\S]*?)\[\/\1\]/gi)]
        .map(c => `<${c[1]}>${c[2].trim()}</${c[1]}>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table class="bb-table">${rows}</table>`;
  });

  html = html.replace(/\[list\]([\s\S]*?)\[\/list\]/gi, (_, inner) => {
    const items = inner.split(/\[\*\]/).map(s => s.trim()).filter(Boolean);
    return `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
  });
  html = html.replace(/\[olist\]([\s\S]*?)\[\/olist\]/gi, (_, inner) => {
    const items = inner.split(/\[\*\]/).map(s => s.trim()).filter(Boolean);
    return `<ol>${items.map(i => `<li>${i}</li>`).join('')}</ol>`;
  });

  html = html
    .replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, '<blockquote class="bb-quote">$1</blockquote>')
    .replace(/\[code\]([\s\S]*?)\[\/code\]/gi, '<pre class="bb-code"><code>$1</code></pre>')
    .replace(/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi, '<span class="bb-spoiler">$1</span>')
    .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>')
    .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<em>$1</em>')
    .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>')
    .replace(/\[strike\]([\s\S]*?)\[\/strike\]/gi, '<s>$1</s>')
    .replace(/\[h1\]([\s\S]*?)\[\/h1\]/gi, '<span class="bb-h1">$1</span>')
    .replace(/\[h2\]([\s\S]*?)\[\/h2\]/gi, '<span class="bb-h2">$1</span>')
    .replace(/\[h3\]([\s\S]*?)\[\/h3\]/gi, '<span class="bb-h3">$1</span>');

  html = html.replace(/\[url=(.+?)\]([\s\S]*?)\[\/url\]/gi, (_, url, text) => {
    return /^https?:\/\//i.test(url)
      ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
      : text;
  });

  html = html.replace(/\[hr\]\[\/hr\]/gi, '<hr class="bb-hr">');
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/NP(\d+)/g, (_, i) => noparseBlocks[Number(i)]);

  return html;
}

function formatDate(str) {
  return new Date(str).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

init();
