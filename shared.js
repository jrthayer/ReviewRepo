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
