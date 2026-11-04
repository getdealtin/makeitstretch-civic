// Admin page: one page for review, overdue listings, invite links, the directory,
// translation sign-off and (from Phase 4) activity. English only; for the operator.

const root = document.getElementById('admin');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = iso => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const ago = iso => (iso ? Math.floor((Date.now() - new Date(iso)) / 864e5) : null);

const KIND = { pantry: 'Food pantry', fridge: 'Community fridge', meals: 'Meal site', mutual_aid: 'Mutual aid', other: 'Other' };
const OFFER = { groceries: 'Groceries', produce: 'Fresh produce', meals: 'Hot meals', baby: 'Baby supplies', hygiene: 'Hygiene items', other: 'Other' };
const LANG = { en: 'English', es: 'Spanish', vi: 'Vietnamese', zh: 'Chinese', ar: 'Arabic', other: 'Other' };
const ACCESS = { walkup: 'Walk-up', appointment: 'Appointment', both: 'Walk-up or appointment' };
const LANG_NAME = { es: 'Spanish (Español)', vi: 'Vietnamese (Tiếng Việt)', 'zh-Hans': 'Chinese, Simplified (中文)' };
const SOURCE = { invite: 'Invite link', public: 'Public form', admin: 'Added by you' };

let city = new URLSearchParams(location.search).get('city') || '';
let data = null;

async function api(path, body) {
  const r = await fetch('/api/admin' + path + (body ? '' : (path.includes('?') ? '&' : '?') + 'city=' + encodeURIComponent(city)), body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city, ...body }) }
    : {});
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}

function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.append(t); setTimeout(() => t.remove(), 2600);
}

async function load() {
  const r = await api('/summary');
  if (r.status === 401) return renderLogin();
  if (r.status === 503) {
    root.innerHTML = `<div class="login"><h1>Admin isn't set up yet</h1><p>Add an <code>ADMIN_KEY</code> environment variable (your admin password) to the Render service, then reload.</p></div>`;
    return;
  }
  if (r.status !== 200) { root.innerHTML = `<p class="error">Couldn't load the admin data (${esc(r.error || r.status)}). Check the database settings.</p>`; return; }
  data = r; city = r.city;
  render();
}

function renderLogin(failed) {
  root.innerHTML = `
    <form class="login" id="login">
      <h1>Admin sign-in</h1>
      <label for="pw">Password</label>
      <input id="pw" type="password" autocomplete="current-password" required>
      ${failed ? '<p class="error" role="alert">That password didn’t match.</p>' : ''}
      <button class="btn btn-primary" type="submit">Sign in</button>
    </form>`;
  root.querySelector('#pw').focus();
  root.querySelector('#login').onsubmit = async e => {
    e.preventDefault();
    const r = await api('/login', { password: root.querySelector('#pw').value });
    r.ok ? load() : renderLogin(true);
  };
}

// ── Rendering ───────────────────────────────────────────────────
const details = (p, { showPrivate = true } = {}) => `
  <dl class="kv">
    <dt>Type</dt><dd>${esc(KIND[p.kind] || p.kind)}</dd>
    <dt>Address</dt><dd>${esc([p.address, p.zip].filter(Boolean).join(', ') || '—')}</dd>
    <dt>Hours</dt><dd>${esc(p.hours || '—')}</dd>
    <dt>How to get food</dt><dd>${esc(ACCESS[p.access] || '—')}${p.id_required === true ? ' · ID required' : p.id_required === false ? ' · No ID needed' : ''}</dd>
    <dt>Offers</dt><dd>${esc((p.offers || []).map(o => OFFER[o]).join(', ') || '—')}</dd>
    <dt>Languages</dt><dd>${esc((p.languages || []).map(l => LANG[l]).join(', ') || '—')}</dd>
    <dt>Phone / web</dt><dd>${esc(p.phone || '—')}${p.website ? ` · <a href="${esc(p.website)}" target="_blank" rel="noopener">${esc(p.website)}</a>` : ''}</dd>
    ${p.description ? `<dt>About</dt><dd>${esc(p.description)}</dd>` : ''}
  </dl>
  ${showPrivate ? `<dl class="kv private">
    <dt>Contact (private)</dt><dd>${esc(p.contact_name || '—')}${p.contact_email ? ` · <a href="mailto:${esc(p.contact_email)}">${esc(p.contact_email)}</a>` : ''}${p.contact_phone ? ` · <a href="tel:${esc(p.contact_phone)}">${esc(p.contact_phone)}</a>` : ''}</dd>
    ${p.admin_note ? `<dt>Your note</dt><dd>${esc(p.admin_note)}</dd>` : ''}
  </dl>` : ''}`;

const btn = (label, act, id, cls = '') => `<button class="btn-xs ${cls}" data-act="${act}" data-id="${esc(id)}">${esc(label)}</button>`;

function render() {
  const d = data;
  const usedInvites = d.invites.filter(i => i.used_at).length;
  root.innerHTML = `
    <div class="admin-bar">
      <label>City <select id="city">${d.cities.map(c => `<option value="${esc(c.id)}" ${c.id === d.city ? 'selected' : ''}>${esc(c.place || c.id)}</option>`).join('')}</select></label>
      <span class="muted" style="font:14px var(--font-label)">${d.db === 'memory' ? '⚠ Test mode: no database connected, changes are not saved' : ''}</span>
      <button class="btn-xs" id="logout">Sign out</button>
    </div>

    <nav class="counts" aria-label="Summary">
      <a class="count ${d.pending.length ? 'alert' : ''}" href="#review"><b>${d.pending.length}</b><span>Needs review</span></a>
      <a class="count ${d.overdue.length ? 'alert' : ''}" href="#overdue"><b>${d.overdue.length}</b><span>Overdue to re-confirm</span></a>
      <a class="count" href="#directory"><b>${d.approved.length}</b><span>Live listings</span></a>
      <a class="count" href="#invites"><b>${usedInvites}/${d.invites.length}</b><span>Invites used</span></a>
      <a class="count ${d.reviews.some(r => r.status !== 'approved') ? 'alert' : ''}" href="#translations"><b>${d.reviews.filter(r => r.status === 'approved').length}/${d.reviews.length}</b><span>Languages reviewed</span></a>
    </nav>

    <section class="a-section" id="review" aria-labelledby="h-review">
      <h2 id="h-review">Needs review <small>${d.pending.length}</small></h2>
      <p class="a-hint">Nothing appears on the site until you approve it, including sign-ups from your invite links.</p>
      ${d.pending.length ? d.pending.map(p => `
        <article class="card">
          <div class="card-head"><h3>${esc(p.name)}</h3><span><span class="tag ${esc(p.source)}">${esc(SOURCE[p.source])}</span> <span class="muted" style="font:13px var(--font-label)">sent ${day(p.submitted_at)}</span></span></div>
          ${details(p)}
          <div class="actions">${btn('Approve', 'approve', p.id, 'go')}${btn('Edit', 'edit', p.id)}${btn('Reject', 'reject', p.id, 'warn')}</div>
        </article>`).join('') : '<p class="empty">All caught up. Nothing waiting.</p>'}
    </section>

    <section class="a-section" id="overdue" aria-labelledby="h-overdue">
      <h2 id="h-overdue">Overdue to re-confirm <small>${d.overdue.length}</small></h2>
      <p class="a-hint">Listings not confirmed in 6 months. Reach out, check the details, then mark confirmed (or edit/hide).</p>
      ${d.overdue.length ? `<ul class="row-list">${d.overdue.map(p => `
        <li><span><b>${esc(p.name)}</b><span class="sub">Last confirmed ${day(p.confirmed_at)} (${ago(p.confirmed_at)} days) · ${esc(p.contact_name || 'no contact name')}
          ${p.contact_email ? ` · <a href="mailto:${esc(p.contact_email)}?subject=${encodeURIComponent('Is your listing still correct?')}">${esc(p.contact_email)}</a>` : ''}${p.contact_phone ? ` · <a href="tel:${esc(p.contact_phone)}">${esc(p.contact_phone)}</a>` : ''}</span></span>
          <span class="actions">${btn('Mark confirmed', 'confirm', p.id, 'go')}${btn('Edit', 'edit', p.id)}${btn('Hide', 'hide', p.id, 'warn')}</span></li>`).join('')}</ul>`
        : '<p class="empty">Every listing is current.</p>'}
    </section>

    <section class="a-section" id="invites" aria-labelledby="h-invites">
      <h2 id="h-invites">Invite links <small>${d.invites.length}</small></h2>
      <p class="a-hint">Make a personal link for each organization, then paste it into your email. Their sign-up comes back to “Needs review.”</p>
      <form class="inline-form" id="invite-form">
        <input id="org" placeholder="Organization name, e.g. St. James Food Closet" aria-label="Organization name" required maxlength="200">
        <button class="btn-xs go" type="submit">Make invite link</button>
      </form>
      <div id="new-invite"></div>
      ${d.invites.length ? `<ul class="row-list">${d.invites.map(i => `
        <li><span><b>${esc(i.org_name)}</b><span class="sub">Made ${day(i.created_at)} · ${i.used_at ? `Signed up ${day(i.used_at)}${i.submission ? ` (${esc(i.submission.status)})` : ''}` : 'Not used yet'}</span></span>
          <span class="actions"><button class="btn-xs" data-copy="${esc(i.link)}">Copy link</button></span></li>`).join('')}</ul>`
        : '<p class="empty">No invites yet.</p>'}
    </section>

    <section class="a-section" id="directory" aria-labelledby="h-dir">
      <h2 id="h-dir">Directory <small>${d.approved.length} live</small></h2>
      <div class="actions" style="margin:8px 0 12px">${btn('+ Add a listing yourself', 'add', '')}</div>
      ${d.approved.length ? `<ul class="row-list">${d.approved.map(p => `
        <li><span><b>${esc(p.name)}</b><span class="sub">${esc(KIND[p.kind])} · ${esc(p.zip || '')} · confirmed ${day(p.confirmed_at)}</span></span>
          <span class="actions">${btn('Edit', 'edit', p.id)}${btn('Hide', 'hide', p.id, 'warn')}</span></li>`).join('')}</ul>`
        : '<p class="empty">No live listings yet.</p>'}
      ${d.hidden.length ? `<details class="more-list"><summary>Hidden and rejected (${d.hidden.length})</summary><ul class="row-list">${d.hidden.map(p => `
        <li><span><b>${esc(p.name)}</b><span class="sub">${esc(p.status)} ${day(p.reviewed_at)}</span></span>
          <span class="actions">${btn('Put back on the site', 'restore', p.id)}</span></li>`).join('')}</ul></details>` : ''}
    </section>

    <section class="a-section" id="translations" aria-labelledby="h-tr">
      <h2 id="h-tr">Translations</h2>
      <p class="a-hint">Drafted translations are on the site now. Mark a language reviewed once a native speaker has checked it, especially allergy words and cooking steps.</p>
      <ul class="row-list">${d.reviews.map(r => `
        <li><span><b>${esc(LANG_NAME[r.lang] || r.lang)}</b>
          <span class="sub">${r.status === 'approved' ? `Reviewed by ${esc(r.reviewer || '—')} on ${day(r.reviewed_at)}` : 'Waiting for a native-speaker review'}</span></span>
          <span class="actions"><span class="status-pill ${r.status === 'approved' ? 'ok' : ''}">${r.status === 'approved' ? 'Reviewed' : 'Pending review'}</span>
          ${r.status === 'approved' ? `<button class="btn-xs" data-review="${esc(r.lang)}" data-to="pending">Undo</button>`
            : `<button class="btn-xs go" data-review="${esc(r.lang)}" data-to="approved">Mark reviewed…</button>`}</span></li>`).join('')}</ul>
    </section>

    <section class="a-section" id="activity" aria-labelledby="h-act">
      <h2 id="h-act">Activity</h2>
      <p class="empty">Visits, plans built and food-box use will show here once visitor tracking is turned on (Phase 4, with the privacy policy update). Nothing is being collected yet.</p>
    </section>

    <dialog id="edit" aria-labelledby="edit-title"><form class="dialog-body" id="edit-form" method="dialog"></form></dialog>`;
  wire();
}

function wire() {
  root.querySelector('#city').onchange = e => { city = e.target.value; history.replaceState(null, '', '?city=' + city); load(); };
  root.querySelector('#logout').onclick = async () => { await api('/logout', {}); renderLogin(); };

  root.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
    const { act, id } = b.dataset;
    if (act === 'edit' || act === 'add') return openEdit(act === 'add' ? null : findP(id));
    if (act === 'reject' && !confirm('Reject this sign-up? It won’t appear on the site. You can restore it later.')) return;
    if (act === 'hide' && !confirm('Hide this listing from the site? You can put it back later.')) return;
    const r = await api('/providers/' + id, { action: act });
    if (!r.ok) return toast('That didn’t save. Try again.');
    toast({ approve: 'Approved: it’s on the site now', reject: 'Rejected', hide: 'Hidden from the site', restore: 'Back on the site', confirm: 'Marked confirmed for another 6 months' }[act]);
    load();
  }));

  root.querySelector('#invite-form').onsubmit = async e => {
    e.preventDefault();
    const org = root.querySelector('#org').value.trim();
    const r = await api('/invites', { org_name: org });
    if (!r.ok) return toast('Couldn’t make the link.');
    const email = `Hi ${org} team,\n\nI run Make It Stretch, a free tool that helps Austin residents plan groceries on a tight budget and find free food nearby. We'd love to list ${org} so people can find you.\n\nIt takes about 3 minutes: ${r.link}\n\nWe review every listing before it goes live, and your contact details are never shown publicly.\n\nThank you!`;
    await load();
    const box = root.querySelector('#new-invite');
    box.innerHTML = `<div class="card"><b>Link for ${esc(org)}</b>
      <div class="linkbox"><input readonly value="${esc(r.link)}" aria-label="Invite link"><button class="btn-xs go" data-copy="${esc(r.link)}">Copy link</button></div>
      <p class="a-hint" style="margin-top:10px">Or copy a ready-to-send email:</p>
      <div class="linkbox"><textarea readonly rows="7" style="flex:1;font:14px var(--font-body);padding:8px;border:1.5px solid var(--rule);border-radius:8px" aria-label="Email text">${esc(email)}</textarea></div>
      <div class="actions" style="margin-top:8px"><button class="btn-xs" data-copy="${esc(email)}">Copy email text</button></div></div>`;
    wireCopy(box);
    box.querySelector('input').select();
  };
  wireCopy(root);

  root.querySelectorAll('[data-review]').forEach(b => b.addEventListener('click', async () => {
    let reviewer = null;
    if (b.dataset.to === 'approved') {
      reviewer = prompt(`Who reviewed the ${LANG_NAME[b.dataset.review]} translation?`);
      if (!reviewer) return;
    }
    const r = await api('/reviews/' + b.dataset.review, { status: b.dataset.to, reviewer });
    r.ok ? (toast(b.dataset.to === 'approved' ? 'Marked reviewed' : 'Set back to pending'), load()) : toast('That didn’t save.');
  }));
}

function wireCopy(scope) {
  scope.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copied'); }
    catch { toast('Select the text and copy it'); }
  }));
}

const findP = id => [...data.pending, ...data.overdue, ...data.approved, ...data.hidden].find(p => p.id === id);

function openEdit(p) {
  const dlg = root.querySelector('#edit'), f = root.querySelector('#edit-form');
  const v = k => esc(p?.[k] ?? '');
  const sel = (name, map, cur) => `<select name="${name}"><option value="">—</option>${Object.entries(map).map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const checks = (name, map, cur = []) => Object.entries(map).map(([k, l]) => `<label style="display:inline-flex;gap:4px;margin-right:10px;font-weight:400"><input type="checkbox" name="${name}" value="${k}" ${cur.includes(k) ? 'checked' : ''} style="width:auto">${esc(l)}</label>`).join('');
  f.innerHTML = `
    <button type="button" class="btn btn-ghost dialog-close" id="x">Close</button>
    <h2 id="edit-title">${p ? 'Edit listing' : 'Add a listing'}</h2>
    <div class="edit-grid">
      <div class="wide"><label>Name<input name="name" value="${v('name')}" required maxlength="200"></label></div>
      <div><label>Type ${sel('kind', KIND, p?.kind)}</label></div>
      <div><label>Zip<input name="zip" value="${v('zip')}" inputmode="numeric" maxlength="5"></label></div>
      <div class="wide"><label>Address<input name="address" value="${v('address')}" maxlength="300"></label></div>
      <div class="wide"><label>Hours<input name="hours" value="${v('hours')}" maxlength="500"></label></div>
      <div><label>How to get food ${sel('access', ACCESS, p?.access)}</label></div>
      <div><label>ID required ${sel('id_required', { yes: 'Yes', no: 'No' }, p?.id_required === true ? 'yes' : p?.id_required === false ? 'no' : '')}</label></div>
      <div><label>Phone<input name="phone" value="${v('phone')}" maxlength="40"></label></div>
      <div><label>Website<input name="website" value="${v('website')}" maxlength="300"></label></div>
      <div class="wide"><label>Offers</label>${checks('offers', OFFER, p?.offers)}</div>
      <div class="wide"><label>Languages spoken</label>${checks('languages', LANG, p?.languages)}</div>
      <div class="wide"><label>About (public)<textarea name="description" rows="2" maxlength="1000">${v('description')}</textarea></label></div>
      <div><label>Contact name (private)<input name="contact_name" value="${v('contact_name')}"></label></div>
      <div><label>Contact email (private)<input name="contact_email" value="${v('contact_email')}" type="email"></label></div>
      <div><label>Contact phone (private)<input name="contact_phone" value="${v('contact_phone')}"></label></div>
      <div class="wide"><label>Your note (private)<textarea name="admin_note" rows="2" maxlength="1000">${v('admin_note')}</textarea></label></div>
    </div>
    <p class="error" id="edit-err" role="alert"></p>
    <div class="actions"><button class="btn-xs go" type="submit">${p ? 'Save changes' : 'Add to the site'}</button></div>`;
  f.querySelector('#x').onclick = () => dlg.close();
  f.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(f);
    const fields = Object.fromEntries([...fd.entries()].filter(([k]) => k !== 'offers' && k !== 'languages'));
    fields.offers = fd.getAll('offers'); fields.languages = fd.getAll('languages');
    const r = p ? await api('/providers/' + p.id, { action: 'edit', fields }) : await api('/providers', { fields });
    if (!r.ok) {
      f.querySelector('#edit-err').textContent = { name: 'Name is required.', kind: 'Pick a type.', zip: 'Zip must be 5 digits.', contact: 'Add a contact email or phone.' }[r.error] || 'That didn’t save.';
      return;
    }
    dlg.close(); toast(p ? 'Saved' : 'Added to the site'); load();
  };
  dlg.showModal();
}

load();
