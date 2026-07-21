// Constants and helpers shared between the live site (app.js) and the admin tool (admin.html).
// Anything used identically by both belongs here, not duplicated in each file.

const SITE_LINK_TEXT = 'Full breakdown and thoughts on the game can be found here';

// localStorage key prefix admin.html saves local-only review drafts under
// (see its "Local drafts" section) — a review's own id is appended. Shared
// so app.js can read the same keys admin.html writes without hand-typing the
// prefix a second time.
const LOCAL_DRAFT_PREFIX = 'local_draft_';

// Overlays any pending local drafts (admin.html, same browser only) onto a
// reviews array — lets the live site preview in-progress edits before
// they're ever pushed to GitHub. Read-only: never touches localStorage
// itself, just merges what's already there, and silently ignores malformed
// entries rather than throwing (same "nothing there is a legitimate state"
// convention as fetchDefaultRepoJson above). Also surfaces drafts for
// reviews that don't exist in reviewsList at all yet — an unsaved new
// review, authored but never pushed — so it can be previewed too.
function applyLocalDrafts(reviewsList) {
  const merged = reviewsList.map(r => {
    const raw = localStorage.getItem(`${LOCAL_DRAFT_PREFIX}${r.id}`);
    if (!raw) return r;
    try { return JSON.parse(raw).data; } catch { return r; }
  });

  const knownIds = new Set(reviewsList.map(r => r.id));
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith(LOCAL_DRAFT_PREFIX)) continue;
    const id = key.slice(LOCAL_DRAFT_PREFIX.length);
    if (knownIds.has(id)) continue;
    try {
      const draft = JSON.parse(localStorage.getItem(key));
      merged.push(draft.data);
    } catch { /* ignore malformed draft */ }
  }
  return merged;
}

// Public, read-only fallback data source — used by the live site (app.js)
// whenever gh_reviews_cache has never been populated in this browser, and by
// the admin tool (admin.html) whenever Settings has no owner/repo/token
// configured yet. Nothing in this app ever writes here automatically; it's
// only ever written by deliberately configuring admin's Settings with a PAT
// for this repo. Its only job is to give a fresh visitor/session real data
// to look at instead of "No reviews yet." / an empty editor.
const DEFAULT_DATA_REPO = { owner: 'jrthayer', repo: 'ReviewRepo_Data', branch: 'main' };

// Fetches a JSON file from DEFAULT_DATA_REPO via GitHub's raw content CDN —
// unauthenticated (works for any public repo) and needs no base64 decoding,
// unlike the authenticated Contents API admin.html uses for its own
// configured repo (ghGetJson). Resolves to null on any failure (missing
// file, network error, bad JSON) rather than throwing — every caller treats
// "nothing there" as a legitimate empty state, not an error to surface.
async function fetchDefaultRepoJson(path) {
  const { owner, repo, branch } = DEFAULT_DATA_REPO;
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

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

// str is always a bare yyyy-mm-dd (every caller passes a type="date" input's
// value — datePosted, releaseDate). Parsed as-is, that's UTC midnight per
// spec, which toLocaleDateString then renders in the viewer's local
// timezone — anyone west of UTC sees it roll back a day (e.g. "2007-08-21"
// showing as "Aug 20, 2007"). Appending a time-of-day makes the same Date
// constructor parse it as local midnight instead, which is what a bare date
// (no timezone information) should mean here.
function formatDate(str) {
  return new Date(`${str}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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

// Groups a review's flat tag-name array by category, looked up (case-insensitively)
// in the global tag registry (data/tags.json, [{ id, name, category }]). Categories
// are ordered per tagCategories (data/tag-categories.json — same source the tag
// filter bar's allTagNamesSorted() ranks by, see app.js), so a card's expanded tag
// list lines up top-to-bottom with the filter bar's category order; any category
// name not found there (or when tagCategories isn't passed at all) falls back to
// first-appearance order among tagNames, stable-sorted after the known ones.
// Unregistered/uncategorized names collect into a single trailing group with
// category ''. Each entry keeps its original index into tagNames so callers
// (admin's chip removal) can address it.
function groupTagNames(tagNames, tagRegistry = [], tagCategories = []) {
  const categoryOf = new Map(tagRegistry.map(t => [t.name.toLowerCase(), t.category || '']));
  const categoryOrder = new Map(tagCategories.map((c, i) => [c.name, i]));
  const groups = [];
  const groupByCategory = new Map();
  const uncategorized = { category: '', entries: [] };

  tagNames.forEach((name, index) => {
    const category = categoryOf.get(name.toLowerCase()) || '';
    if (!category) { uncategorized.entries.push({ name, index }); return; }
    if (!groupByCategory.has(category)) {
      const group = { category, entries: [] };
      groupByCategory.set(category, group);
      groups.push(group);
    }
    groupByCategory.get(category).entries.push({ name, index });
  });

  const rank = g => categoryOrder.has(g.category) ? categoryOrder.get(g.category) : categoryOrder.size;
  groups.sort((a, b) => rank(a) - rank(b));

  if (uncategorized.entries.length) groups.push(uncategorized);
  return groups;
}

// Renders a review's curated "core" tags (r.coreTags — a per-review subset
// of r.tags picked locally, not a global tag category, see the Tag
// categories section of CLAUDE.md) as a flat row of .tag-badge pills, in the
// order stored on the review. This is what actually shows on the card; the
// full registry-grouped tag list (groupTagNames above, via renderFullTagList)
// only appears if `canExpand` toggles it open (see the [data-toggle-tags]
// button below and renderCard's use of it) — callers wire that button's
// click to their own expand/toggle state, same as .review-tab/.sub-tab.
function renderCoreTags(coreTagNames, { canExpand = false, expanded = false } = {}) {
  if (!coreTagNames?.length) return '';
  return `<div class="tag-list"><div class="tag-group">${
    coreTagNames.map(name => `<span class="tag-badge">${escHtml(name)}</span>`).join('')
  }${canExpand ? `<button type="button" class="tag-badge tag-more-btn" data-toggle-tags title="${expanded ? 'Hide' : 'Show'} all tags">${expanded ? '−' : '+'}</button>` : ''}</div></div>`;
}

// Renders a review's *entire* tag list, grouped into labeled .tag-group
// blocks per the tag registry (see groupTagNames above); uncategorized tags
// render with an empty label rather than no label at all — .tag-list-full
// lays every group's label + badges out as a two-column grid (see
// style.css), so every group needs the same two elements in the same order
// for its badges to land in the badges column, whether or not it has a
// category name to show. Shown at the top of the expanded card's tab
// content when the [data-toggle-tags] button (see renderCoreTags above) is
// toggled on.
function renderFullTagList(tagNames, tagRegistry = [], tagCategories = []) {
  if (!tagNames?.length) return '';
  const groups = groupTagNames(tagNames, tagRegistry, tagCategories);
  const badge = e => `<span class="tag-badge">${escHtml(e.name)}</span>`;
  return `<div class="tag-list tag-list-full">${groups.map(g => `<div class="tag-group">
    <span class="tag-group-label">${g.category ? escHtml(g.category) : ''}</span>
    <div class="tag-group-badges">${g.entries.map(badge).join('')}</div>
  </div>`).join('')}</div>`;
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
    tagRegistry = [],
    tagCategories = [],
    showAllTags = false,
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
          <div class="meta">${r.hoursPlayed} hrs${r.releaseDate ? ` &middot; Released ${formatDate(r.releaseDate)}` : ''} &middot; Reviewed ${r.datePosted ? formatDate(r.datePosted) : '—'}</div>
          ${renderCoreTags(r.coreTags, { canExpand: (r.tags?.length || 0) > (r.coreTags?.length || 0), expanded: showAllTags })}
        </div>
        <div class="card-chevron">${expanded ? '▲' : '▼'}</div>
      </div>
      ${expanded ? `
        <div class="card-expanded">
          <div class="expanded-body">
            ${showAllTags ? renderFullTagList(r.tags, tagRegistry, tagCategories) : ''}
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
