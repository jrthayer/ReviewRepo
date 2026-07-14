// Constants and helpers shared between the live site (app.js) and the admin tool (admin.html).
// Anything used identically by both belongs here, not duplicated in each file.

const SITE_LINK_TEXT = 'Full breakdown and thoughts on the game can be found here';

const STEAM_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <circle cx="8.7" cy="15.3" r="2.4" fill="currentColor"/>
  <circle cx="15.2" cy="8.6" r="2.7" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <line x1="8.7" y1="15.3" x2="13.1" y2="10.7" stroke="currentColor" stroke-width="1.3"/>
</svg>`;

function steamAppId(coverImage) {
  const m = (coverImage || '').match(/\/apps\/(\d+)\//);
  return m ? m[1] : null;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(str) {
  return new Date(str).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function splitSubTabs(raw) {
  if (!raw) return null;
  const re = /\[tab=([^\]]+)\]([\s\S]*?)\[\/tab\]/gi;
  const tabs = [];
  let m;
  while ((m = re.exec(raw))) {
    tabs.push({ name: m[1].trim(), content: m[2].trim() });
  }
  return tabs.length ? tabs : null;
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

// Renders one review card's full markup (collapsed or expanded), used both for
// the live site's card list and the admin tool's "Site Card Preview". Each
// caller wires up its own click/expand behavior on top of this HTML, since
// that differs (a list of cards with shared expand state vs. a single card
// mirroring the live-editing form).
function renderCard(r, opts = {}) {
  const {
    expanded = false,
    activeTabId = 'steam',
    activeSubIndex = 0,
    permalinkHref = null,
    disablePermalinkNav = false,
  } = opts;

  const appId = steamAppId(r.coverImage);
  const bodyTabs = [
    { id: 'steam', name: 'Steam Review', content: r.body },
    ...(r.tabs || []).filter(t => t.content),
  ];
  const activeTab = bodyTabs.find(t => t.id === activeTabId) || bodyTabs[0];
  const subTabs   = expanded ? splitSubTabs(activeTab.content) : null;
  const activeSub = subTabs ? subTabs[Math.min(activeSubIndex, subTabs.length - 1)] : null;

  return `
    <div class="card ${expanded ? 'expanded' : ''}" data-id="${escHtml(r.id)}">
      <div class="card-main">
        <div class="card-cover">
          ${r.coverImage ? `<img src="${escHtml(r.coverImage)}" alt="${escHtml(r.title)}">` : ''}
        </div>
        <div class="card-info">
          <h2><span class="card-title-text">${escHtml(r.title) || 'Untitled'}</span>${appId ? `<a class="steam-link" href="https://store.steampowered.com/app/${appId}/" target="_blank" rel="noopener noreferrer" title="View on Steam" onclick="event.stopPropagation()">${STEAM_ICON}</a>` : ''}</h2>
          <span class="badge ${r.recommended ? 'yes' : 'no'}">${r.recommended ? 'Recommended' : 'Not Recommended'}</span>
          <p class="summary">${escHtml(r.summary)}</p>
          <div class="meta">${r.hoursPlayed} hrs &middot; ${r.datePosted ? formatDate(r.datePosted) : '—'}</div>
          ${r.tags?.length ? `<div class="tag-list">${r.tags.map(t => `<span class="tag-badge">${escHtml(t)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="card-chevron">${expanded ? '▲' : '▼'}</div>
      </div>
      ${expanded ? `
        <div class="card-expanded">
          <div class="expanded-body">
            ${subTabs ? `
              <div class="sub-tabs">
                ${subTabs.map((st, i) => `<button type="button" class="sub-tab ${i === activeSubIndex ? 'active' : ''}" data-sub-tab="${i}">${escHtml(st.name)}</button>`).join('')}
              </div>
              ${renderBBCode(activeSub.content)}
            ` : renderBBCode(activeTab.content)}
          </div>
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
          ${activeTab.id === 'steam' && permalinkHref ? `
            <div class="card-permalink">
              <a href="${escHtml(permalinkHref)}" onclick="${disablePermalinkNav ? 'event.preventDefault();' : ''}event.stopPropagation()">${SITE_LINK_TEXT}</a>
            </div>` : ''}
          <div class="review-tabs">
            ${bodyTabs.map(t => `<button type="button" class="review-tab ${activeTab.id === t.id ? 'active' : ''}" data-review-tab="${escHtml(t.id)}">${escHtml(t.name)}</button>`).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}
