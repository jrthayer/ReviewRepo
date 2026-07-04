let reviews = [];
let expandedId = null;

async function init() {
  try {
    const res = await fetch('data/reviews.json?v=' + Date.now());
    reviews = await res.json();
  } catch {
    document.getElementById('app').innerHTML = '<p class="state-msg">Could not load reviews.json.</p>';
    return;
  }

  const local = JSON.parse(localStorage.getItem('local_reviews') || '[]');
  local.forEach(lr => {
    if (!reviews.find(r => r.id === lr.id)) reviews.push(lr);
  });

  render();
}

function render() {
  const app = document.getElementById('app');
  if (!reviews.length) {
    app.innerHTML = '<p class="state-msg">No reviews yet.</p>';
    return;
  }

  app.innerHTML = reviews.map(r => {
    const expanded = expandedId === r.id;
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
          </div>
          <div class="card-chevron">${expanded ? '▲' : '▼'}</div>
        </div>
        ${expanded ? `
          <div class="card-expanded">
            ${r.body ? `<p class="expanded-body">${escHtml(r.body)}</p>` : ''}
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
            <button class="export-btn" data-id="${escHtml(r.id)}">Copy for Steam</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  app.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.export-btn')) return;
      const id = card.dataset.id;
      expandedId = expandedId === id ? null : id;
      render();
    });
  });

  app.querySelectorAll('.export-btn').forEach(btn => {
    btn.addEventListener('click', handleExport);
  });
}

function handleExport(e) {
  e.stopPropagation();
  const id = e.currentTarget.dataset.id;
  const r = reviews.find(r => r.id === id);
  if (!r) return;

  const lines = [];
  lines.push(`[h1]${r.title}[/h1]`);
  lines.push(`${r.recommended ? '✔ Recommended' : '✘ Not Recommended'} | ${r.hoursPlayed} hours played`);
  lines.push('');
  if (r.summary) { lines.push(`[i]${r.summary}[/i]`); lines.push(''); }
  if (r.body)    { lines.push(r.body); lines.push(''); }
  if (r.pros?.length) {
    lines.push('[b]Pros[/b]'); lines.push('[list]');
    r.pros.forEach(p => lines.push(`[*] ${p}`));
    lines.push('[/list]'); lines.push('');
  }
  if (r.cons?.length) {
    lines.push('[b]Cons[/b]'); lines.push('[list]');
    r.cons.forEach(c => lines.push(`[*] ${c}`));
    lines.push('[/list]'); lines.push('');
  }
  if (r.verdict) {
    lines.push('[hr][/hr]');
    lines.push('[b]Verdict[/b]');
    lines.push(r.verdict);
  }

  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    const btn = e.currentTarget;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy for Steam'; btn.classList.remove('copied'); }, 2000);
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(str) {
  return new Date(str).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

init();
