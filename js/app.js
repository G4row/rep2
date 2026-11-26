/* WSK Replenishment — demo app (no database, no automatic restarts) */
{
  'use strict';
  const S = window.WStore;
  const I18N = window.WSK_I18N;
  const LANGS = [['nl', 'Nederlands', 'NL', 'nl-NL'], ['en', 'English', 'EN', 'en-GB'], ['pt', 'Português', 'PT', 'pt-PT'], ['pl', 'Polski', 'PL', 'pl-PL'], ['hr', 'Hrvatski', 'HR', 'hr-HR']];
  const ROLES = ['picking', 'replenishment', 'analytics'];
  const LOC_RE = /^D\d{2}-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
  const M = 60000;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- language ---------- */
  let lang = S.lang() || (() => { const n = (navigator.language || 'en').slice(0, 2).toLowerCase(); return LANGS.some(l => l[0] === n) ? n : 'en'; })();
  const t = (k, v) => {
    let s = (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k;
    if (v) Object.keys(v).forEach(x => { s = s.split('{' + x + '}').join(v[x]); });
    return s;
  };
  const langInfo = () => LANGS.find(l => l[0] === lang) || LANGS[1];
  function applyI18n() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  }
  function setLang(l) { lang = l; S.setLang(l); render(); }

  /* ---------- time ---------- */
  const pad = n => (n < 10 ? '0' : '') + n;
  const clock = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const dayKey = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const stamp = ms => (ms ? dayKey(ms) + ' ' + clock(ms) : '');
  const mins = ms => Math.round(ms / M * 10) / 10;
  function dur(ms) {
    const s = Math.floor(Math.max(0, ms) / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return h ? h + ':' + pad(m) + ':' + pad(x) : pad(m) + ':' + pad(x);
  }
  const hm = ms => { const m = Math.round(ms / M); return Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm'; };
  const longDate = ms => new Date(ms).toLocaleDateString(langInfo()[3], { weekday: 'long', day: 'numeric', month: 'long' });

  /* ---------- state ---------- */
  let data = S.load();
  let sess = S.session();
  const ui = { tab: 'request', an: 'undo', loginRole: 'picking', printDate: dayKey(Date.now()), dlg: null };
  const me = () => (sess ? sess.user : '');
  const find = (d, id) => d.tasks.find(x => x.id === id);
  const notesFor = loc => data.notes.filter(n => n.loc === loc);
  const noteText = n => (n.key ? t(n.key) : n.text);
  const today = () => data.tasks.filter(x => dayKey(x.posted) === dayKey(Date.now()));
  function commit(fn) { data = S.update(fn); render(); checkNew(); }

  let toastTimer = 0;
  function toast(msg, err) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.toggle('err', !!err);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }
  function serverOk() {
    if (data.server) return true;
    toast(t('server_off_err'), true);
    return false;
  }

  /* ---------- render ---------- */
  function render() {
    applyI18n();
    renderServer();
    if (!sess) { showLogin(); return; }
    $('scrLogin').hidden = true;
    $('scrApp').hidden = false;
    window.G4Rain.stop();
    $('offBanner').hidden = !!data.server;
    renderHeader();
    if (sess.role === 'analytics') renderAnalytics(); else renderBoard();
  }

  function renderServer() {
    document.querySelectorAll('[data-server]').forEach(b => {
      b.classList.toggle('off', !data.server);
      b.title = t('server_hint');
      b.innerHTML = esc(t('server')) + ': <span class="dot" aria-hidden="true"></span><b>' + esc(data.server ? t('on') : t('off')) + '</b>';
    });
  }

  /* ---------- login ---------- */
  function showLogin() {
    $('scrApp').hidden = true;
    $('scrLogin').hidden = false;
    $('loginLangs').innerHTML = LANGS.map(l => `<button type="button" data-lang="${l[0]}" aria-pressed="${l[0] === lang}" title="${esc(l[1])}">${l[2]}</button>`).join('');
    $('loginLangName').textContent = '> ' + langInfo()[1];
    $('loginRoles').innerHTML = ROLES.map(r => `<button type="button" data-role="${r}" aria-pressed="${r === ui.loginRole}">${esc(t('role_' + r))}</button>`).join('');
    updateEnter();
    window.G4Rain.start($('rain'));
  }
  function updateEnter() {
    const ok = $('inUser').value.trim().length > 0;
    $('btnEnter').disabled = !ok;
    $('btnEnter').textContent = ok ? t('enter') : t('enter_dis');
  }
  $('loginLangs').addEventListener('click', e => { const b = e.target.closest('[data-lang]'); if (b) setLang(b.dataset.lang); });
  $('loginRoles').addEventListener('click', e => {
    const b = e.target.closest('[data-role]');
    if (!b) return;
    ui.loginRole = b.dataset.role;
    $('loginRoles').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });
  $('inUser').addEventListener('input', updateEnter);
  $('loginForm').addEventListener('submit', e => {
    e.preventDefault();
    const user = $('inUser').value.trim().toLowerCase().replace(/\s+/g, '.').slice(0, 24);
    if (!user) return;
    signIn(user, ui.loginRole);
  });
  function signIn(user, role) {
    sess = { user, role };
    S.setSession(sess);
    if (role !== 'picking') S.claim(user);
    data = S.load();
    syncKnown();
    ui.tab = 'request';
    render();
  }

  /* ---------- header + role menu ---------- */
  function renderHeader() {
    const r = sess.role;
    const nb = `<button type="button" class="btn btn-sm btn-primary" data-top="new">+ ${esc(t('new_task'))}</button>`;
    const no = `<button type="button" class="btn btn-sm" data-top="note">${esc(t('note'))}</button>`;
    $('tbLeft').innerHTML = r === 'picking' ? nb + no : r === 'replenishment' ? no + nb : `<span class="brand-mini">WSK://${esc(t('an_title'))}</span>`;
    $('userChip').textContent = '@' + sess.user;
    $('btnRole').innerHTML = `<span class="role-pre">${esc(t('role'))}:</span> ${esc(t('role_' + r))} ▾`;
    $('roleMenu').innerHTML =
      `<div><div class="lbl">${esc(t('role'))}</div><div class="opts">${ROLES.map(x => `<button type="button" data-setrole="${x}" aria-pressed="${x === r}">${esc(t('role_' + x))}</button>`).join('')}</div></div>` +
      `<div><div class="lbl">${esc(t('choose_lang'))}</div><div class="lang-mini">${LANGS.map(l => `<button type="button" data-lang="${l[0]}" aria-pressed="${l[0] === lang}" title="${esc(l[1])}">${l[2]}</button>`).join('')}</div></div>` +
      ntfMenuHTML() +
      `<button type="button" class="btn btn-sm btn-danger" data-logout>${esc(t('logout'))}</button>`;
  }
  function menu(open) {
    $('roleMenu').hidden = !open;
    $('btnRole').setAttribute('aria-expanded', String(open));
  }
  $('btnRole').addEventListener('click', e => { e.stopPropagation(); menu($('roleMenu').hidden); });
  $('roleMenu').addEventListener('click', e => {
    e.stopPropagation();
    const r = e.target.closest('[data-setrole]'), l = e.target.closest('[data-lang]');
    if (r) {
      sess.role = r.dataset.setrole;
      S.setSession(sess);
      if (sess.role !== 'picking') S.claim(sess.user);
      data = S.load();
      ui.tab = 'request';
      menu(false);
      render();
    } else if (l) { setLang(l.dataset.lang); menu(true); }
    else if (e.target.closest('[data-ntf]')) ntfMenuClick(e.target.closest('[data-ntf]').dataset.ntf);
    else if (e.target.closest('[data-logout]')) { menu(false); sess = null; S.clearSession(); render(); }
  });
  document.addEventListener('click', () => menu(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') menu(false); });
  $('tbLeft').addEventListener('click', e => {
    const b = e.target.closest('[data-top]');
    if (!b) return;
    if (b.dataset.top === 'note') openNotes('');
    else if (sess.role === 'picking') openNewTask();
    else openAccept();
  });
  document.querySelectorAll('[data-server]').forEach(b => b.addEventListener('click', () => {
    commit(d => { d.server = !d.server; });
  }));

  /* ---------- board ---------- */
  function boardLists() {
    const u = me(), all = data.tasks;
    const active = (a, b) => (a.status === b.status ? 0 : a.status === 'done' ? 1 : -1);
    const recent = (a, b) => active(a, b) || (a.status === 'done' ? b.done - a.done : (a.accepted || a.posted) - (b.accepted || b.posted));
    return {
      request: all.filter(x => x.status === 'waiting').sort((a, b) => a.posted - b.posted),
      accepted: all.filter(x => x.status !== 'waiting').sort(recent),
      mytasks: all.filter(x => (sess.role === 'picking' ? x.picker === u : x.replenisher === u)).sort(recent)
    };
  }
  function rowHTML(x) {
    const n = notesFor(x.loc).length, u = me();
    const timer = x.status === 'done'
      ? `<span class="timer total num">${esc(t('total'))} <b>${dur(x.done - x.posted)}</b></span>`
      : `<span class="timer num" data-since="${x.changed}">${dur(Date.now() - x.changed)}</span>`;
    const act = sess.role === 'replenishment' && x.status === 'progress' && x.replenisher === u
      ? `<button type="button" class="btn btn-sm btn-accent" data-done="${esc(x.id)}">✓ ${esc(t('btn_done'))}</button>` : '';
    return `<tr>
      <td data-l="${esc(t('col_location'))}"><span class="loc-tag">${esc(x.loc)}</span>${n ? `<button type="button" class="note-tag" data-notes="${esc(x.loc)}">${esc(t('note').toUpperCase())}${n > 1 ? ' ×' + n : ''}</button>` : ''}</td>
      <td data-l="${esc(t('col_picker'))}" class="${x.picker === u ? 'who-me' : ''}">${esc(x.picker)}</td>
      <td data-l="${esc(t('col_time'))}" class="num">${clock(x.posted)}</td>
      <td data-l="${esc(t('col_status'))}"><span class="st st-${x.status}">${esc(t('st_' + x.status))}</span>${x.resets ? `<span class="reset-mark">↺ ${esc(t('reset_mark', { n: x.resets }))}</span>` : ''}</td>
      <td data-l="${esc(t('col_replenisher'))}" class="${x.replenisher === u ? 'who-me' : ''}">${x.replenisher ? esc(x.replenisher) : '—'}</td>
      <td data-l="${esc(t('col_timer'))}">${timer}</td>
      <td class="act">${act}</td></tr>`;
  }
  function renderBoard() {
    const lists = boardLists(), rows = lists[ui.tab];
    const empty = { request: 'empty_request', accepted: 'empty_accepted', mytasks: 'empty_mine' }[ui.tab];
    const cols = ['col_location', 'col_picker', 'col_time', 'col_status', 'col_replenisher', 'col_timer'];
    $('main').innerHTML = `
      <div class="page-head"><h1 class="display">${esc(t('role_' + sess.role))}</h1><span class="hint">${esc(longDate(Date.now()))}</span></div>
      <div class="tabs" role="tablist">${['request', 'accepted', 'mytasks'].map(k =>
        `<button type="button" role="tab" data-tab="${k}" aria-selected="${ui.tab === k}">${esc(t('tab_' + k))} <span class="cnt">${lists[k].length}</span></button>`).join('')}</div>
      <div class="panel">${rows.length
        ? `<div class="table-wrap"><table class="stack"><thead><tr>${cols.map(c => `<th>${esc(t(c))}</th>`).join('')}<th><span class="muted">${esc(t('col_action'))}</span></th></tr></thead><tbody>${rows.map(rowHTML).join('')}</tbody></table></div>`
        : `<p class="empty">${esc(t(empty))}</p>`}</div>`;
  }

  $('main').addEventListener('click', e => {
    const tb = e.target.closest('[data-tab]'), dn = e.target.closest('[data-done]'), nt = e.target.closest('[data-notes]');
    const an = e.target.closest('[data-an]'), rs = e.target.closest('[data-reset]'), pr = e.target.closest('[data-print]');
    if (tb) { ui.tab = tb.dataset.tab; render(); }
    else if (dn) markDone(dn.dataset.done);
    else if (nt) openNotes(nt.dataset.notes);
    else if (an) { ui.an = an.dataset.an; render(); }
    else if (rs) resetTask(rs.dataset.reset);
    else if (pr) downloadReport();
  });

  function markDone(id) {
    if (!serverOk()) return;
    let done = null;
    commit(d => {
      const x = find(d, id);
      if (x && x.status === 'progress' && x.replenisher === me()) {
        const now = Date.now();
        Object.assign(x, { status: 'done', done: now, changed: now });
        done = x;
      }
    });
    if (done) toast(t('ok_done', { loc: done.loc, d: dur(done.done - done.posted) }));
  }

  /* ---------- dialogs ---------- */
  const dlg = $('dlg');
  function openDlg(kind, html) {
    ui.dlg = kind;
    dlg.innerHTML = html;
    dlg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dlg.close()));
    if (!dlg.open) dlg.showModal();
  }
  dlg.addEventListener('close', () => { camStop(); ui.dlg = null; });
  const dlgHead = (kicker, title) => `<div class="dlg-head"><div><div class="kicker">${kicker}</div><h2>${esc(title)}</h2></div><button type="button" class="btn btn-sm" data-close aria-label="${esc(t('btn_close'))}">✕</button></div>`;
  const locOptions = () => {
    const set = new Set(S.LOCS);
    data.tasks.forEach(x => set.add(x.loc));
    return '<datalist id="locList">' + [...set].sort().map(l => `<option value="${esc(l)}"></option>`).join('') + '</datalist>';
  };
  const normLoc = v => v.trim().toUpperCase().replace(/\s+/g, '');
  function setMsg(el, text, kind) { el.textContent = text || ''; el.className = 'msg' + (kind ? ' ' + kind : ''); }

  /* New task — picker: Barcode / Type */
  const cam = { stream: null, timer: 0 };
  const canScan = () => 'BarcodeDetector' in window && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  function openNewTask() {
    if (!serverOk()) return;
    openDlg('new', `<form id="ntForm" novalidate>${dlgHead('WSK://NEW_TASK', t('nt_title'))}
      <div class="dlg-body">
        <div class="seg" id="ntMode" role="group"><button type="button" data-mode="barcode" aria-pressed="true">▥ ${esc(t('nt_barcode'))}</button><button type="button" data-mode="type" aria-pressed="false">⌨ ${esc(t('nt_type'))}</button></div>
        <div id="ntScan">
          <p class="hint">${esc(t('nt_scan_hint'))}</p>
          ${canScan() ? `<button type="button" class="btn btn-accent btn-block" id="ntCam" style="margin-top:10px">◉ ${esc(t('nt_cam_start'))}</button><div class="cam" id="ntCamBox" hidden style="margin-top:10px"><video id="ntVideo" playsinline muted></video></div>` : `<p class="hint" style="margin-top:6px">${esc(t('nt_no_cam'))}</p>`}
        </div>
        <p class="hint" id="ntTypeHint" hidden>${esc(t('nt_type_hint'))}</p>
        <div><label class="lbl" for="ntLoc">${esc(t('nt_loc'))}</label>
          <input id="ntLoc" type="text" list="locList" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="D53-004-41">${locOptions()}</div>
        <p class="msg" id="ntMsg" role="alert"></p>
      </div>
      <div class="dlg-foot"><button type="button" class="btn" data-close>${esc(t('btn_cancel'))}</button><button type="submit" class="btn btn-primary">${esc(t('btn_confirm'))}</button></div></form>`);
    const input = $('ntLoc');
    input.focus();
    $('ntMode').addEventListener('click', e => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      $('ntMode').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      const scan = b.dataset.mode === 'barcode';
      $('ntScan').hidden = !scan;
      $('ntTypeHint').hidden = scan;
      if (!scan) camStop();
      input.focus();
    });
    if ($('ntCam')) $('ntCam').addEventListener('click', () => (cam.stream ? camStop() : camStart()));
    $('ntForm').addEventListener('submit', e => {
      e.preventDefault();
      const loc = normLoc(input.value), msg = $('ntMsg');
      if (!loc) return setMsg(msg, t('err_empty'), 'err');
      if (!LOC_RE.test(loc)) return setMsg(msg, t('err_format'), 'err');
      if (!serverOk()) return;
      if (S.load().tasks.some(x => x.loc === loc && x.status !== 'done')) return setMsg(msg, t('err_active', { loc }), 'err');
      const now = Date.now();
      ui.tab = 'request';
      commit(d => { d.tasks.push({ id: S.uid(), loc, picker: me(), posted: now, status: 'waiting', changed: now, replenisher: null, accepted: null, done: null, resets: 0 }); });
      dlg.close(); // everyone signed in (this tab too) gets the notification
    });
  }
  async function camStart() {
    const box = $('ntCamBox'), video = $('ntVideo'), btn = $('ntCam'), msg = $('ntMsg');
    try {
      const want = ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'itf', 'qr_code', 'data_matrix'];
      const fmts = (await window.BarcodeDetector.getSupportedFormats()).filter(f => want.includes(f));
      const det = new window.BarcodeDetector(fmts.length ? { formats: fmts } : undefined);
      cam.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      video.srcObject = cam.stream;
      await video.play();
      box.hidden = false;
      btn.textContent = '■ ' + t('nt_cam_stop');
      cam.timer = setInterval(async () => {
        try {
          const codes = await det.detect(video);
          if (codes && codes.length) {
            const v = normLoc(codes[0].rawValue || '');
            $('ntLoc').value = v;
            camStop();
            setMsg(msg, t('nt_scanned', { loc: v }), 'ok');
          }
        } catch (err) { /* frame not ready */ }
      }, 250);
    } catch (err) {
      camStop();
      setMsg(msg, t('nt_cam_err'), 'err');
    }
  }
  function camStop() {
    clearInterval(cam.timer);
    if (cam.stream) cam.stream.getTracks().forEach(tr => tr.stop());
    cam.stream = null;
    const box = $('ntCamBox'), btn = $('ntCam');
    if (box) box.hidden = true;
    if (btn) btn.textContent = '◉ ' + t('nt_cam_start');
  }

  /* New task — replenisher: Locations + Accept */
  function openAccept() {
    const list = data.tasks.filter(x => x.status === 'waiting').sort((a, b) => a.posted - b.posted);
    openDlg('accept', `${dlgHead('WSK://LOCATIONS', t('rt_title'))}
      <div class="dlg-body"><p class="hint">${esc(t('rt_hint'))}</p>
      ${list.length ? `<ul class="accept-list">${list.map(x => `<li><div><span class="loc-tag">${esc(x.loc)}</span>${notesFor(x.loc).length ? ` <button type="button" class="note-tag" data-notes="${esc(x.loc)}">${esc(t('note').toUpperCase())}</button>` : ''}
        <div class="meta">${esc(x.picker)} · ${esc(t('posted_at', { t: clock(x.posted) }))} · <span class="num" data-since="${x.changed}">${dur(Date.now() - x.changed)}</span></div></div>
        <button type="button" class="btn btn-primary btn-sm" data-accept="${esc(x.id)}">${esc(t('btn_accept'))}</button></li>`).join('')}</ul>` : `<p class="empty">${esc(t('rt_empty'))}</p>`}
      </div><div class="dlg-foot"><button type="button" class="btn" data-close>${esc(t('btn_close'))}</button></div>`);
    dlg.querySelector('.dlg-body').addEventListener('click', e => {
      const a = e.target.closest('[data-accept]'), n = e.target.closest('[data-notes]');
      if (n) { openNotes(n.dataset.notes); return; }
      if (!a) return;
      if (!acceptTask(a.dataset.accept)) openAccept(); // someone else was faster — refresh the list
    });
  }
  function acceptTask(id) {
    if (!serverOk()) return true;
    let got = null;
    commit(d => {
      const x = find(d, id);
      if (x && x.status === 'waiting') {
        const now = Date.now();
        Object.assign(x, { status: 'progress', replenisher: me(), accepted: now, changed: now });
        got = x;
      }
    });
    if (!got) return false;
    ui.tab = 'mytasks';
    render();
    if (dlg.open) dlg.close();
    toast(t('ok_accepted', { loc: got.loc }));
    return true;
  }

  /* Notes — both roles */
  function openNotes(loc) {
    openDlg('notes', `<form id="noteForm" novalidate>${dlgHead('WSK://NOTE', t('note_title'))}
      <div class="dlg-body">
        <div><label class="lbl" for="noteLoc">${esc(t('note_loc'))}</label>
          <input id="noteLoc" type="text" list="locList" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="D53-004-41" value="${esc(loc)}">${locOptions()}</div>
        <div><label class="lbl" for="noteText">${esc(t('note_text'))}</label>
          <textarea id="noteText" maxlength="300" placeholder="${esc(t('note_ph'))}"></textarea></div>
        <p class="msg" id="noteMsg" role="alert"></p>
        <div class="lbl" id="noteListTitle"></div>
        <ul class="note-list" id="noteList"></ul>
      </div>
      <div class="dlg-foot"><button type="button" class="btn" data-close>${esc(t('btn_close'))}</button><button type="submit" class="btn btn-primary">${esc(t('btn_save'))}</button></div></form>`);
    const locIn = $('noteLoc');
    const paint = () => {
      const l = normLoc(locIn.value), filt = LOC_RE.test(l) && data.notes.some(n => n.loc === l);
      const list = data.notes.filter(n => !filt || n.loc === l).sort((a, b) => b.t - a.t);
      $('noteListTitle').textContent = filt ? t('note_for', { loc: l }) : t('note_all');
      $('noteList').innerHTML = list.length ? list.map(n => `<li><div class="meta"><span class="loc-tag">${esc(n.loc)}</span> @${esc(n.user)} · ${clock(n.t)}</div>
        ${n.user === me() ? `<button type="button" class="btn btn-sm btn-danger" data-del="${esc(n.id)}">${esc(t('btn_delete'))}</button>` : '<span></span>'}<p>${esc(noteText(n))}</p></li>`).join('')
        : `<li><span class="muted">${esc(t('note_empty'))}</span></li>`;
    };
    paint();
    (loc ? $('noteText') : locIn).focus();
    locIn.addEventListener('input', paint);
    $('noteList').addEventListener('click', e => {
      const b = e.target.closest('[data-del]');
      if (!b || !serverOk()) return;
      commit(d => { d.notes = d.notes.filter(n => !(n.id === b.dataset.del && n.user === me())); });
      paint();
      setMsg($('noteMsg'), t('note_deleted'), 'ok');
    });
    $('noteForm').addEventListener('submit', e => {
      e.preventDefault();
      const l = normLoc(locIn.value), text = $('noteText').value.trim(), msg = $('noteMsg');
      if (!l) return setMsg(msg, t('err_empty'), 'err');
      if (!LOC_RE.test(l)) return setMsg(msg, t('err_format'), 'err');
      if (!text || !serverOk()) return;
      commit(d => { d.notes.push({ id: S.uid(), loc: l, text, user: me(), t: Date.now() }); });
      locIn.value = l;
      $('noteText').value = '';
      paint();
      setMsg(msg, t('note_saved'), 'ok');
    });
  }

  /* Demo reset */
  $('btnDemoReset').addEventListener('click', () => {
    openDlg('reset', `${dlgHead('WSK://DEMO', t('demo_reset_yes'))}<div class="dlg-body"><p>${esc(t('demo_reset_q'))}</p></div>
      <div class="dlg-foot"><button type="button" class="btn" data-close>${esc(t('btn_cancel'))}</button><button type="button" class="btn btn-danger" id="doReset">${esc(t('demo_reset_yes'))}</button></div>`);
    $('doReset').addEventListener('click', () => {
      S.resetDemo();
      if (sess && sess.role !== 'picking') S.claim(sess.user);
      data = S.load();
      syncKnown();
      dlg.close();
      render();
      toast(t('demo_done'));
    });
  });

  /* ---------- analytics ---------- */
  function renderAnalytics() {
    const tabs = ['undo', 'locations', 'target', 'team', 'print'];
    $('main').innerHTML = `
      <div class="page-head"><h1 class="display">${esc(t('an_title'))}</h1><span class="hint">@${esc(me())} · ${esc(longDate(Date.now()))}</span></div>
      <div class="subtabs" role="tablist">${tabs.map(k => `<button type="button" role="tab" data-an="${k}" aria-selected="${ui.an === k}">[${esc(t('an_' + k))}]</button>`).join('')}</div>
      <div id="anBody"></div>`;
    ({ undo: renderUndo, locations: renderLocs, target: renderTarget, team: renderTeam, print: renderPrint })[ui.an]($('anBody'));
  }

  function renderUndo(box) {
    const u = me();
    const mine = data.tasks.filter(x => x.replenisher === u && x.status !== 'waiting').sort((a, b) => b.accepted - a.accepted);
    const log = data.resets.slice().sort((a, b) => b.t - a.t);
    box.innerHTML = `<section class="card"><h2>${esc(t('an_undo'))}</h2><div class="card-body" style="padding-bottom:0"><p class="hint">${esc(t('undo_hint'))}</p></div>
      ${mine.length ? `<ul class="undo-list">${mine.map(x => `<li><div><span class="loc-tag">${esc(x.loc)}</span> <span class="st st-${x.status}">${esc(t('st_' + x.status))}</span>
        <div class="meta">${esc(t('posted_at', { t: clock(x.posted) }))} · ${esc(t('accepted_at', { t: clock(x.accepted) }))}${x.done ? ' · ' + esc(t('done_at', { t: clock(x.done) })) + ' · ' + esc(t('total')) + ' ' + dur(x.done - x.posted) : ' · <span class="num" data-since="' + x.changed + '">' + dur(Date.now() - x.changed) + '</span>'}</div></div>
        <button type="button" class="btn btn-sm btn-danger" data-reset="${esc(x.id)}">↺ ${esc(t('btn_reset'))}</button></li>`).join('')}</ul>` : `<p class="empty">${esc(t('undo_empty'))}</p>`}</section>
      <section class="card"><h2>${esc(t('undo_log'))}</h2>
      ${log.length ? `<ul class="log">${log.map(r => `<li><span class="num muted">${clock(r.t)}</span><span>${esc(t('reset_by', { by: '@' + r.by, loc: r.loc }))}</span><span class="muted">${esc(r.from || '—')} · ${dur(r.waited)}</span></li>`).join('')}</ul>` : `<p class="empty">${esc(t('undo_log_empty'))}</p>`}</section>`;
  }
  function resetTask(id) {
    if (!serverOk()) return;
    let loc = '';
    commit(d => {
      const x = find(d, id);
      if (!x || x.replenisher !== me() || x.status === 'waiting') return;
      const now = Date.now();
      d.resets.push({ id: S.uid(), taskId: x.id, loc: x.loc, by: me(), from: x.replenisher, t: now, waited: now - x.posted });
      Object.assign(x, { status: 'waiting', replenisher: null, accepted: null, done: null, changed: now, resets: (x.resets || 0) + 1 });
      loc = x.loc;
    });
    if (loc) toast(t('ok_reset', { loc }));
  }

  const countBy = (arr, key) => { const m = new Map(); arr.forEach(x => { const k = key(x); m.set(k, (m.get(k) || 0) + 1); }); return m; };
  const barRows = (entries, label, dim) => {
    const max = Math.max(1, ...entries.map(e => e[1]));
    return `<div class="bars">${entries.map(([k, n], i) => `<div class="bar-row"><span>${label(k)}</span><span class="track"><span class="fill${dim && i ? ' dim' : ''}" style="width:${(n / max * 100).toFixed(1)}%;display:block"></span></span><span class="n num">${n}</span></div>`).join('')}</div>`;
  };
  function renderLocs(box) {
    const list = today();
    if (!list.length) { box.innerHTML = `<p class="empty card">${esc(t('loc_empty'))}</p>`; return; }
    const byLoc = [...countBy(list, x => x.loc)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const byZone = [...countBy(list, x => S.zoneOf(x.loc))].sort((a, b) => a[0].localeCompare(b[0]));
    box.innerHTML = `<div class="grid2">
      <section class="card"><h2>${esc(t('loc_repeats'))}</h2><div class="card-body">${barRows(byLoc, k => `<span class="loc-tag">${esc(k)}</span>`, true)}</div></section>
      <section class="card"><h2>${esc(t('loc_zones'))}</h2><div class="card-body"><p class="hint">${esc(t('loc_zone_hint'))}</p>${barRows(byZone, k => `D${esc(k)}`, false)}</div></section></div>`;
  }

  function myDone() {
    const u = me();
    return today().filter(x => x.replenisher === u && x.status === 'done').sort((a, b) => a.done - b.done);
  }
  function hourStats(list) {
    const m = new Map();
    list.forEach(x => { const h = new Date(x.done).getHours(); const v = m.get(h) || []; v.push(x.done - x.accepted); m.set(h, v); });
    return [...m].map(([h, v]) => ({ h, n: v.length, avg: v.reduce((a, b) => a + b, 0) / v.length }));
  }
  let curveObs = null;
  function renderTarget(box) {
    if (curveObs) { curveObs.disconnect(); curveObs = null; }
    const list = myDone();
    if (!list.length) { box.innerHTML = `<section class="card"><h2>${esc(t('tg_title'))}</h2><p class="empty">${esc(t('tg_empty'))}</p></section>`; return; }
    const work = list.map(x => x.done - x.accepted);
    const avg = work.reduce((a, b) => a + b, 0) / work.length;
    const fi = work.indexOf(Math.min(...work)), si = work.indexOf(Math.max(...work));
    const span = list[list.length - 1].done - Math.min(...list.map(x => x.accepted));
    const avgTot = list.reduce((a, x) => a + (x.done - x.posted), 0) / list.length;
    const hs = hourStats(list).filter(h => h.n > 0);
    const slow = hs.slice().sort((a, b) => b.avg - a.avg)[0], fast = hs.slice().sort((a, b) => a.avg - b.avg)[0];
    const hl = h => pad(h.h) + ':00–' + pad((h.h + 1) % 24) + ':00 · ø ' + dur(h.avg);
    box.innerHTML = `
      <div class="kpis">
        <div class="kpi hi"><span class="k">${esc(t('tg_done'))}</span><span class="v num">${list.length}</span><span class="s">${esc(t('tg_title'))}</span></div>
        <div class="kpi"><span class="k">${esc(t('tg_avg'))}</span><span class="v num">${dur(avg)}</span><span class="s">${esc(t('tg_avg_total'))}: ${dur(avgTot)}</span></div>
        <div class="kpi"><span class="k">${esc(t('tg_fast'))}</span><span class="v num">${dur(work[fi])}</span><span class="s">${esc(list[fi].loc)} · ${clock(list[fi].done)}</span></div>
        <div class="kpi"><span class="k">${esc(t('tg_slow'))}</span><span class="v num">${dur(work[si])}</span><span class="s">${esc(list[si].loc)} · ${clock(list[si].done)}</span></div>
        <div class="kpi"><span class="k">${esc(t('tg_work'))}</span><span class="v num">${hm(span)}</span><span class="s">${clock(Math.min(...list.map(x => x.accepted)))}–${clock(list[list.length - 1].done)}</span></div>
      </div>
      <section class="card"><h2>${esc(t('tg_curve'))}</h2><div class="card-body"><p class="hint">${esc(t('tg_curve_hint'))}</p>
        <div class="fig"><svg id="curve" role="img" aria-label="${esc(t('tg_curve'))}"></svg></div>
        ${hs.length > 1 ? `<div class="insights"><span>${esc(t('tg_slow_hour'))}: <b>${hl(slow)}</b></span><span>${esc(t('tg_fast_hour'))}: <b>${hl(fast)}</b></span></div>` : ''}
      </div></section>`;
    const svg = $('curve');
    const pts = list.map(x => ({ x: x.done, y: (x.done - x.accepted) / M }));
    curveObs = new ResizeObserver(() => drawCurve(svg, pts, avg / M));
    curveObs.observe(svg);
  }
  function drawCurve(svg, pts, avgM) {
    const W = svg.clientWidth, H = svg.clientHeight;
    if (!W || !H) return;
    const L = 40, R = 22, T = 18, B = 30, HR = 3600000;
    let x0 = Math.floor(Math.min(...pts.map(p => p.x)) / HR) * HR, x1 = Math.ceil(Math.max(...pts.map(p => p.x)) / HR) * HR;
    if (x1 - x0 < HR) x1 = x0 + HR;
    const ymax = Math.max(5, Math.ceil(Math.max(...pts.map(p => p.y)) * 1.1 / 5) * 5);
    const sx = x => L + (x - x0) / (x1 - x0) * (W - L - R), sy = y => T + (1 - y / ymax) * (H - T - B);
    let g = '';
    for (let y = 0; y <= ymax; y += 5) g += `<line x1="${L}" x2="${W - R}" y1="${sy(y)}" y2="${sy(y)}" stroke="#0f4d22" stroke-width="1"/><text x="${L - 8}" y="${sy(y) + 4}" text-anchor="end">${y}</text>`;
    g += `<text x="${L + 4}" y="${T - 5}" text-anchor="start">min</text>`;
    const step = W < 520 ? 2 : 1;
    for (let x = x0, i = 0; x <= x1; x += HR, i++) {
      if (i % step) continue;
      const d = new Date(x);
      g += `<line x1="${sx(x)}" x2="${sx(x)}" y1="${H - B}" y2="${H - B + 5}" stroke="#1f7a3a"/><text x="${sx(x)}" y="${H - 8}" text-anchor="middle">${pad(d.getHours())}:00</text>`;
    }
    const ma = pts.map((p, i) => { const w = pts.slice(Math.max(0, i - 2), i + 1); return { x: p.x, y: w.reduce((a, b) => a + b.y, 0) / w.length }; });
    const line = ma.map((p, i) => (i ? 'L' : 'M') + sx(p.x).toFixed(1) + ',' + sy(p.y).toFixed(1)).join('');
    const area = line + `L${sx(ma[ma.length - 1].x).toFixed(1)},${H - B}L${sx(ma[0].x).toFixed(1)},${H - B}Z`;
    svg.innerHTML = `<defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00ff41" stop-opacity=".22"/><stop offset="1" stop-color="#00ff41" stop-opacity="0"/></linearGradient></defs>
      ${g}<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="#1f7a3a"/>
      <line x1="${L}" x2="${W - R}" y1="${sy(avgM)}" y2="${sy(avgM)}" stroke="#ffd23f" stroke-dasharray="4 5" stroke-width="1"/>
      <text x="${W - R}" y="${sy(avgM) - 6}" text-anchor="end" style="fill:#ffd23f">ø ${avgM.toFixed(1)}</text>
      <path d="${area}" fill="url(#cg)"/><path d="${line}" fill="none" stroke="#b6ffc8" stroke-width="2"/>
      ${pts.map(p => `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="4.5" fill="#00ff41" stroke="#020602" stroke-width="1.5"><title>${clock(p.x)} · ${p.y.toFixed(1)} min</title></circle>`).join('')}`;
  }

  function renderTeam(box) {
    const list = today(), u = me();
    const total = list.length, mine = list.filter(x => x.replenisher === u).length;
    const share = total ? mine / total : 0;
    const R = 86, C = 2 * Math.PI * R;
    const hours = new Map();
    list.forEach(x => { const h = new Date(x.posted).getHours(); const v = hours.get(h) || { tot: 0, me: 0 }; v.tot++; if (x.replenisher === u) v.me++; hours.set(h, v); });
    const hs = [...hours.keys()].sort((a, b) => a - b);
    const range = hs.length ? Array.from({ length: hs[hs.length - 1] - hs[0] + 1 }, (_, i) => hs[0] + i) : [];
    const max = Math.max(1, ...[...hours.values()].map(v => v.tot));
    box.innerHTML = `<section class="card"><h2>${esc(t('tm_title'))}</h2><div class="card-body"><p class="hint">${esc(t('tm_hint'))}</p>
      <div class="team-top">
        <svg class="donut" viewBox="0 0 220 220" role="img" aria-label="${Math.round(share * 100)}% ${esc(t('tm_share'))}">
          <circle cx="110" cy="110" r="${R}" fill="none" stroke="#0f4d22" stroke-width="26"/>
          <circle cx="110" cy="110" r="${R}" fill="none" stroke="#00ff41" stroke-width="26" stroke-dasharray="${(C * share).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 110 110)"/>
          <text x="110" y="118" text-anchor="middle" font-size="52">${Math.round(share * 100)}%</text>
          <text x="110" y="146" text-anchor="middle" font-size="20" style="fill:#5fd47f">${esc(t('tm_share'))}</text>
        </svg>
        <div class="legend">
          <div><i style="background:#0f4d22;border:1px solid #1f7a3a"></i><span class="big num">${total}</span>${esc(t('tm_team'))} · ${esc(t('tm_requested'))}</div>
          <div><i style="background:#00ff41"></i><span class="big num">${mine}</span>${esc(t('tm_you'))} · ${esc(t('tm_accepted'))}</div>
        </div>
      </div></div></section>
      <section class="card"><h2>${esc(t('tm_hourly'))}</h2><div class="card-body">
        <div class="hourly">${range.map(h => { const v = hours.get(h) || { tot: 0, me: 0 }; return `<div class="col" title="${pad(h)}:00 · ${esc(t('tm_team'))} ${v.tot} · ${esc(t('tm_you'))} ${v.me}"><div class="tot" style="height:${(v.tot / max * 100).toFixed(1)}%"><span class="lab num">${v.tot || ''}</span><div class="me" style="height:${v.tot ? (v.me / v.tot * 100).toFixed(1) : 0}%"></div></div></div>`; }).join('')}</div>
        <div class="hours">${range.map(h => `<span>${pad(h)}</span>`).join('')}</div>
        <div class="legend" style="flex-direction:row;flex-wrap:wrap;gap:16px;margin-top:12px;font-size:13px"><span><i style="background:#0f4d22;border:1px solid #1f7a3a"></i>${esc(t('tm_team'))}</span><span><i style="background:#00ff41"></i>${esc(t('tm_you'))}</span></div>
      </div></section>`;
  }

  /* Print — Excel via SheetJS (loaded only when needed) */
  const SHEETS = ['tasks', 'locations', 'zones', 'target', 'team', 'resets', 'notes'];
  function renderPrint(box) {
    const day = ui.printDate, n = data.tasks.filter(x => dayKey(x.posted) === day).length;
    box.innerHTML = `<section class="card"><h2>${esc(t('pr_title'))}</h2><div class="card-body">
      <div class="field" style="max-width:260px"><label class="lbl" for="prDate">${esc(t('pr_date'))}</label><input type="date" id="prDate" value="${day}" max="${dayKey(Date.now())}"></div>
      <div class="lbl">${esc(t('pr_sheets'))} · WSK_REPORT_${day}.xlsx</div>
      <ul class="sheets">${SHEETS.map((s, i) => `<li><span class="ix">[${pad(i + 1)}]</span><span><b>${esc(t('sh_' + s))}</b><span class="d">${esc(t('shd_' + s))}</span></span><span></span></li>`).join('')}</ul>
      <button type="button" class="btn btn-primary btn-block" data-print ${n ? '' : 'disabled'}>${esc(t('pr_download'))}</button>
      <p class="msg ${n ? '' : 'err'}" id="prMsg" role="status">${n ? '' : esc(t('pr_none'))}</p>
    </div></section>`;
    $('prDate').addEventListener('change', e => { if (e.target.value) { ui.printDate = e.target.value; render(); } });
  }
  let xlsxLoading = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxLoading) xlsxLoading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'js/xlsx.full.min.js';
      s.onload = () => res(window.XLSX);
      s.onerror = () => { xlsxLoading = null; rej(new Error('xlsx')); };
      document.head.appendChild(s);
    });
    return xlsxLoading;
  }
  function reportSheets(day) {
    const u = me(), list = data.tasks.filter(x => dayKey(x.posted) === day).sort((a, b) => a.posted - b.posted);
    const st = x => t('st_' + x.status);
    const tasks = [[t('col_location'), t('x_zone'), t('col_picker'), t('x_posted'), t('col_status'), t('col_replenisher'), t('x_accepted'), t('x_done'), t('x_wait'), t('x_work'), t('x_total'), t('x_resets')]]
      .concat(list.map(x => [x.loc, 'D' + S.zoneOf(x.loc), x.picker, stamp(x.posted), st(x), x.replenisher || '', stamp(x.accepted), stamp(x.done),
        x.accepted ? mins(x.accepted - x.posted) : '', x.done && x.accepted ? mins(x.done - x.accepted) : '', x.done ? mins(x.done - x.posted) : '', x.resets || 0]));
    const locs = [[t('col_location'), t('x_zone'), t('x_count')]].concat([...countBy(list, x => x.loc)].sort((a, b) => b[1] - a[1]).map(([l, n]) => [l, 'D' + S.zoneOf(l), n]));
    const zones = [[t('x_zone'), t('x_count')]].concat([...countBy(list, x => S.zoneOf(x.loc))].sort((a, b) => a[0].localeCompare(b[0])).map(([z, n]) => ['D' + z, n]));
    const mine = list.filter(x => x.replenisher === u && x.status === 'done').sort((a, b) => a.done - b.done);
    const w = mine.map(x => x.done - x.accepted);
    const target = [[t('x_metric'), t('x_value')], [t('x_user'), u], [t('tg_done'), mine.length]];
    if (mine.length) {
      target.push([t('tg_avg') + ' (min)', mins(w.reduce((a, b) => a + b, 0) / w.length)], [t('tg_fast') + ' (min)', mins(Math.min(...w))], [t('tg_slow') + ' (min)', mins(Math.max(...w))],
        [t('tg_work') + ' (min)', mins(mine[mine.length - 1].done - Math.min(...mine.map(x => x.accepted)))]);
    }
    target.push([], [t('col_location'), t('x_accepted'), t('x_done'), t('x_work')]);
    mine.forEach(x => target.push([x.loc, stamp(x.accepted), stamp(x.done), mins(x.done - x.accepted)]));
    const hrs = new Map();
    list.forEach(x => { const h = new Date(x.posted).getHours(); const v = hrs.get(h) || [0, 0]; v[0]++; if (x.replenisher === u) v[1]++; hrs.set(h, v); });
    const team = [[t('x_hour'), t('tm_team'), t('tm_you')]].concat([...hrs].sort((a, b) => a[0] - b[0]).map(([h, v]) => [pad(h) + ':00', v[0], v[1]]));
    const mineN = list.filter(x => x.replenisher === u).length;
    team.push([], [t('total'), list.length, mineN], [t('tm_share'), '', list.length ? Math.round(mineN / list.length * 1000) / 10 + ' %' : '0 %']);
    const resets = [[t('col_time'), t('col_location'), t('x_by'), t('x_from'), t('x_waited')]]
      .concat(data.resets.filter(r => dayKey(r.t) === day).sort((a, b) => a.t - b.t).map(r => [stamp(r.t), r.loc, r.by, r.from || '', mins(r.waited)]));
    const notes = [[t('col_time'), t('col_location'), t('x_user'), t('note_text')]]
      .concat(data.notes.filter(n => dayKey(n.t) === day).sort((a, b) => a.t - b.t).map(n => [stamp(n.t), n.loc, n.user, noteText(n)]));
    return { tasks, locations: locs, zones, target, team, resets, notes };
  }
  async function downloadReport() {
    const msg = $('prMsg'), day = ui.printDate;
    setMsg(msg, t('pr_loading'));
    try {
      const X = await loadXLSX();
      const wb = X.utils.book_new(), sh = reportSheets(day);
      SHEETS.forEach(k => {
        const ws = X.utils.aoa_to_sheet(sh[k]);
        const widths = sh[k].reduce((acc, row) => { row.forEach((c, i) => { acc[i] = Math.max(acc[i] || 8, String(c == null ? '' : c).length + 2); }); return acc; }, []);
        ws['!cols'] = widths.map(w => ({ wch: Math.min(w, 60) }));
        X.utils.book_append_sheet(wb, ws, t('sh_' + k).slice(0, 31));
      });
      const file = 'WSK_REPORT_' + day + '.xlsx';
      X.writeFile(wb, file);
      setMsg(msg, t('pr_saved', { f: file }), 'ok');
    } catch (e) {
      console.error(e);
      setMsg(msg, t('pr_error'), 'err');
    }
  }


  /* ---------- notifications: popup + sound + vibration (+ system notification) ---------- */
  // Demo: reaches everyone signed in in THIS browser (all tabs), the picker who posted included.
  let known = new Set(data.tasks.map(x => x.id));
  let unread = 0;
  const baseTitle = document.title;
  let ntfSet = Object.assign({ sound: true, vibrate: true, system: false }, S.ntf() || {});
  let swReg = null;
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').then(r => { swReg = r; }).catch(() => {});
  }
  function syncKnown() { known = new Set(data.tasks.map(x => x.id)); }
  function checkNew() {
    const fresh = data.tasks.filter(x => !known.has(x.id));
    fresh.forEach(x => known.add(x.id));
    const posts = fresh.filter(x => x.status === 'waiting');
    if (sess && posts.length) notifyPosts(posts);
  }
  function notifyPosts(posts) {
    if (posts.length > 3) popup({ many: posts.length });
    else posts.forEach(x => popup({ task: x }));
    alertFx();
    if (document.hidden) { unread += posts.length; updateTitle(); }
    if (posts.length > 3) sysNotify(t('ntf_many', { n: posts.length }), posts.map(x => x.loc).join(', '), 'wskr-many');
    else posts.forEach(x => sysNotify(t('ntf_new') + ': ' + x.loc, '@' + x.picker + ' · ' + clock(x.posted), 'wskr-' + x.id));
  }

  // in-app popup (top right)
  function popup(o) {
    const stack = $('ntfStack');
    const el = document.createElement('div');
    el.className = 'ntf';
    el.setAttribute('role', 'status');
    const x = o.task;
    let act = '';
    if (x && !o.test) act = sess.role === 'replenishment'
      ? `<button type="button" class="btn btn-sm btn-primary" data-ntf-accept="${esc(x.id)}">${esc(t('btn_accept'))}</button>`
      : sess.role === 'picking' ? `<button type="button" class="btn btn-sm" data-ntf-show>${esc(t('ntf_show'))}</button>` : '';
    el.innerHTML = `<div class="ntf-head"><span class="kicker">▲ ${esc(o.many ? t('ntf_many', { n: o.many }) : t('ntf_new'))}</span>
      <button type="button" class="ntf-x" aria-label="${esc(t('btn_close'))}">✕</button></div>
      ${x ? `<div class="ntf-body"><span class="loc-tag">${esc(x.loc)}</span><span class="muted">@${esc(x.picker)} · ${clock(x.posted)}</span></div>` : ''}
      ${act ? `<div class="ntf-act">${act}</div>` : ''}`;
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 250); };
    el.addEventListener('click', e => {
      if (e.target.closest('.ntf-x')) close();
      else if (e.target.closest('[data-ntf-accept]')) { acceptTask(x.id); close(); }
      else if (e.target.closest('[data-ntf-show]')) { ui.tab = 'request'; render(); close(); }
    });
    stack.prepend(el);
    while (stack.children.length > 4) stack.lastElementChild.remove();
    setTimeout(close, 9000);
  }

  // sound: short two-tone terminal beep (Web Audio, unlocked by the first tap/click)
  let actx = null;
  function audioUnlock() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; }
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, audioUnlock, { passive: true }));
  function beep() {
    if (!actx || actx.state !== 'running') return;
    const t0 = actx.currentTime;
    [[880, 0], [1320, 0.17], [1760, 0.34]].forEach(([f, dt]) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.09, t0 + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.15);
      o.connect(g).connect(actx.destination);
      o.start(t0 + dt);
      o.stop(t0 + dt + 0.16);
    });
  }
  function alertFx() {
    if (ntfSet.sound) beep();
    if (ntfSet.vibrate && navigator.vibrate) { try { navigator.vibrate([200, 100, 200, 100, 300]); } catch (e) { /* not allowed */ } }
  }

  // "(3) WSK · Replenishment Board" while the tab is in the background
  function updateTitle() { document.title = (unread ? '(' + unread + ') ' : '') + baseTitle; }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { unread = 0; updateTitle(); } });

  // system notification — only when the tab is in the background and the user allowed it
  function sysNotify(title, body, tag) {
    if (!ntfSet.system || !document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = { body, tag, renotify: true, vibrate: ntfSet.vibrate ? [200, 100, 200, 100, 300] : undefined, silent: !ntfSet.sound };
    if (swReg && swReg.showNotification) swReg.showNotification(title, opts).catch(() => {});
    else { try { new Notification(title, opts); } catch (e) { /* Android needs the service worker */ } }
  }
  function sysState() {
    if (!('Notification' in window)) return 'na';
    if (Notification.permission === 'denied') return 'denied';
    return ntfSet.system && Notification.permission === 'granted' ? 'on' : 'off';
  }

  // settings in the Role menu
  function ntfMenuHTML() {
    const st = sysState();
    const info = st === 'na' ? t('ntf_sys_na') : st === 'denied' ? t('ntf_sys_denied') : t('ntf_hint');
    const b = (k, icon, label, on) => `<button type="button" data-ntf="${k}" aria-pressed="${on}">${icon} ${esc(label)} <span class="tog">${on ? esc(t('on')) : esc(t('off'))}</span></button>`;
    return `<div><div class="lbl">${esc(t('ntf_title'))}</div><div class="opts">` +
      b('sound', '♪', t('ntf_sound'), ntfSet.sound) + b('vibrate', '≋', t('ntf_vibrate'), ntfSet.vibrate) +
      b('system', '◉', t('ntf_system'), st === 'on') +
      `<button type="button" data-ntf="test">▶ ${esc(t('ntf_test'))}</button></div><p class="hint" style="margin-top:6px">${esc(info)}</p></div>`;
  }
  async function ntfMenuClick(k) {
    audioUnlock();
    if (k === 'test') {
      popup({ task: { id: 'test', loc: 'D53-004-41', picker: me(), posted: Date.now() }, test: true });
      alertFx();
      return;
    }
    if (k === 'system') {
      if (sysState() === 'on') ntfSet.system = false;
      else if ('Notification' in window && Notification.permission !== 'denied') {
        const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
        ntfSet.system = p === 'granted';
      }
    } else ntfSet[k] = !ntfSet[k];
    S.setNtf(ntfSet);
    renderHeader();
    menu(true);
  }

  /* ---------- live updates ---------- */
  setInterval(() => {
    const now = Date.now();
    document.querySelectorAll('[data-since]').forEach(el => { el.textContent = dur(now - Number(el.dataset.since)); });
  }, 1000);
  // another tab changed the data (e.g. picker in one tab, replenisher in another)
  S.onChange(() => {
    data = S.load();
    if (!sess) { renderServer(); checkNew(); return; }
    if (ui.dlg === 'accept') openAccept();
    const focused = document.activeElement && document.activeElement.id === 'prDate';
    if (!focused) render();
    checkNew();
  });

  render();
}
