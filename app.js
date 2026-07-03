let reviews = [];

async function init() {
  try {
    const res = await fetch('data/reviews.json?v=' + Date.now());
    reviews = await res.json();
  } catch {
    document.getElementById('app').innerHTML = '<p class="state-msg">Could not load reviews.json.</p>';
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}

function route() {
  const id = window.location.hash.slice(1);
  const app = document.getElementById('app');
  if (id) {
    const review = reviews.find(r => r.id === id);
    review ? renderDetail(app, review) : (app.innerHTML = '<p class="state-msg">Review not found.</p>');
  } else {
    renderList(app);
  }
  window.scrollTo(0, 0);
}

function renderList(container) {
  if (!reviews.length) {
    container.innerHTML = '<p class="state-msg">No reviews yet.</p>';
    return;
  }
  container.innerHTML = reviews.map(r => `
    <a class="card" href="#${r.id}">
      <div class="card-cover">
        ${r.coverImage ? `<img src="${escHtml(r.coverImage)}" alt="${escHtml(r.title)}">` : ''}
      </div>
      <div class="card-info">
        <h2>${escHtml(r.title)}</h2>
        <span class="badge ${r.recommended ? 'yes' : 'no'}">${r.recommended ? 'Recommended' : 'Not Recommended'}</span>
        <p class="summary">${escHtml(r.summary)}</p>
        <div class="meta">${r.hoursPlayed} hrs &middot; ${formatDate(r.datePosted)}</div>
      </div>
    </a>
  `).join('');
}

function renderDetail(container, r) {
  container.innerHTML = `
    <a class="back-link" href="#">&larr; All reviews</a>
    <article class="review">
      ${r.coverImage ? `<img class="review-cover" src="${escHtml(r.coverImage)}" alt="${escHtml(r.title)}">` : ''}
      <div class="review-header">
        <h1>${escHtml(r.title)}</h1>
        <span class="badge ${r.recommended ? 'yes' : 'no'}">${r.recommended ? 'Recommended' : 'Not Recommended'}</span>
        <div class="meta">${r.hoursPlayed} hrs played &middot; ${formatDate(r.datePosted)}</div>
      </div>

      <div class="review-body">
        ${r.summary ? `<p><em>${escHtml(r.summary)}</em></p>` : ''}
        ${r.body ? `<p>${escHtml(r.body)}</p>` : ''}
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

      <button class="export-btn" data-id="${escHtml(r.id)}">Copy for Steam</button>
    </article>
  `;

  container.querySelector('.export-btn').addEventListener('click', handleExport);
}

function handleExport(e) {
  const id = e.currentTarget.dataset.id;
  const r = reviews.find(r => r.id === id);
  if (!r) return;

  const lines = [];

  lines.push(`[h1]${r.title}[/h1]`);
  lines.push(`${r.recommended ? '✔ Recommended' : '✘ Not Recommended'} | ${r.hoursPlayed} hours played`);
  lines.push('');

  if (r.summary) {
    lines.push(`[i]${r.summary}[/i]`);
    lines.push('');
  }

  if (r.body) {
    lines.push(r.body);
    lines.push('');
  }

  if (r.pros?.length) {
    lines.push('[b]Pros[/b]');
    lines.push('[list]');
    r.pros.forEach(p => lines.push(`[*] ${p}`));
    lines.push('[/list]');
    lines.push('');
  }

  if (r.cons?.length) {
    lines.push('[b]Cons[/b]');
    lines.push('[list]');
    r.cons.forEach(c => lines.push(`[*] ${c}`));
    lines.push('[/list]');
    lines.push('');
  }

  if (r.verdict) {
    lines.push('[hr][/hr]');
    lines.push(`[b]Verdict[/b]`);
    lines.push(r.verdict);
  }

  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    const btn = e.currentTarget;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy for Steam';
      btn.classList.remove('copied');
    }, 2000);
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(str) {
  return new Date(str).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

init();
