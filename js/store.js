/* WSK Replenishment — demo data layer
 * No database: tasks, notes and resets live in this browser (localStorage) and are shared
 * between tabs. The login (username + role) is per tab (sessionStorage), so one tab can be
 * a picker and another a replenisher during a demo.
 * For the real version only this file needs to talk to an API instead.
 */
(function () {
  'use strict';

  var DATA_KEY = 'wskr_demo_data_v1';
  var SESS_KEY = 'wskr_demo_session_v1';
  var LANG_KEY = 'wskr_demo_lang_v1';
  var NTF_KEY = 'wskr_demo_ntf_v1';

  // Locations that are already on the board when the demo starts
  var LOCS = [
    'D53-004-41', 'D53-033-25', 'D13-007-11', 'D17-010-11', 'D12-007-23', 'D15-007-23',
    'D15-038-15', 'D11-032-11', 'D10-006-25', 'D18-000-24', 'D15-016-23', 'D13-010-19'
  ];
  var ME = '__you__'; // demo history that the first replenisher/analyst to sign in takes over

  var memData = null, memSess = null, memLang = null; // fallback when storage is blocked

  function readJSON(store, key) {
    try { var v = store.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function writeJSON(store, key, val) {
    try { store.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }
  function ls() { try { return window.localStorage; } catch (e) { return null; } }
  function ss() { try { return window.sessionStorage; } catch (e) { return null; } }

  function zoneOf(loc) { var m = /^D(\d{2})/.exec(loc || ''); return m ? m[1] : '??'; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Starting state: the 12 locations on the board + ~6 h of finished tasks for the analytics
  function seed() {
    var r = rng(20261125), now = Date.now(), M = 60000;
    var team = ['ana.k', 'ivan.p', 'tomas.v', 'lea.m'];
    var pickers = ['marta.s', 'david.r', 'nina.b', 'josip.h'];
    var weights = [3, 1, 4, 2, 2, 5, 2, 1, 2, 1, 3, 2]; // some locations repeat more often
    var pool = [];
    LOCS.forEach(function (l, i) { for (var k = 0; k < weights[i]; k++) pool.push(l); });
    function pick(a) { return a[Math.floor(r() * a.length)]; }

    var tasks = [], resets = [], notes = [];
    var start = now - 6 * 60 * M, end = now - 40 * M, N = 44;
    for (var i = 0; i < N; i++) {
      var p = i / (N - 1);
      var posted = start + (end - start) * (i + r() * 0.6) / N;
      var mine = i % 4 === 1;
      var wait = (1 + r() * 9) * M;
      var work = mine
        // slower at the start of the shift, a slower stretch mid-shift, faster towards the end
        ? (15.5 - 8.5 * p + 4.5 * Math.exp(-Math.pow((p - 0.55) / 0.09, 2)) + (r() * 2.4 - 1.2)) * M
        : (5 + r() * 11) * M;
      var acc = posted + wait;
      var done = Math.min(acc + work, now - 3 * M);
      tasks.push({
        id: 'h' + i, loc: pick(pool), picker: pick(pickers), posted: Math.round(posted),
        status: 'done', changed: Math.round(done), replenisher: mine ? ME : pick(team),
        accepted: Math.round(acc), done: Math.round(done), resets: 0
      });
    }
    // two tasks that were reset once on the way
    [6, 23].forEach(function (k) {
      var tk = tasks[k];
      tk.resets = 1;
      resets.push({ id: 'r' + k, taskId: tk.id, loc: tk.loc, by: 'lea.m', from: 'tomas.v', t: tk.posted + 4 * M, waited: 4 * M });
    });

    // the 12 locations: 10 waiting, 2 in progress
    LOCS.forEach(function (loc, k) {
      var posted = now - (30 - k * 2.3) * M;
      var t = { id: 'a' + k, loc: loc, picker: pickers[k % pickers.length], posted: Math.round(posted), status: 'waiting', changed: Math.round(posted), replenisher: null, accepted: null, done: null, resets: 0 };
      if (k === 2 || k === 6) {
        t.status = 'progress';
        t.replenisher = k === 2 ? 'ana.k' : 'ivan.p';
        t.accepted = t.changed = Math.round(posted + 3 * M);
      }
      tasks.push(t);
    });

    notes.push({ id: 'n1', loc: 'D15-038-15', key: 'seed_note1', user: 'marta.s', t: now - 55 * M });
    notes.push({ id: 'n2', loc: 'D53-004-41', key: 'seed_note2', user: 'ana.k', t: now - 22 * M });

    return { v: 1, server: true, claimed: false, tasks: tasks, notes: notes, resets: resets };
  }

  function load() {
    var s = ls();
    var d = s ? readJSON(s, DATA_KEY) : memData;
    if (!d || d.v !== 1) { d = seed(); save(d); }
    return d;
  }
  function save(d) {
    var s = ls();
    if (!s || !writeJSON(s, DATA_KEY, d)) memData = d;
  }

  window.WStore = {
    LOCS: LOCS,
    ME: ME,
    zoneOf: zoneOf,
    uid: uid,
    load: load,
    save: save,
    // read the newest data, change it, save it (keeps tabs from overwriting each other)
    update: function (fn) { var d = load(); fn(d); save(d); return d; },
    resetDemo: function () { var d = seed(); save(d); return d; },
    // demo history marked ME becomes the history of the first replenisher/analyst
    claim: function (user) {
      return this.update(function (d) {
        if (d.claimed) return;
        d.tasks.forEach(function (t) { if (t.replenisher === ME) t.replenisher = user; });
        d.claimed = true;
      });
    },
    session: function () { var s = ss(); return s ? readJSON(s, SESS_KEY) : memSess; },
    setSession: function (v) { var s = ss(); if (!s || !writeJSON(s, SESS_KEY, v)) memSess = v; },
    clearSession: function () { var s = ss(); try { if (s) s.removeItem(SESS_KEY); } catch (e) {} memSess = null; },
    lang: function () { var s = ls(); return s ? readJSON(s, LANG_KEY) : memLang; },
    setLang: function (l) { var s = ls(); if (!s || !writeJSON(s, LANG_KEY, l)) memLang = l; },
    ntf: function () { var s = ls(); return s ? readJSON(s, NTF_KEY) : null; },
    setNtf: function (v) { var s = ls(); if (s) writeJSON(s, NTF_KEY, v); },
    onChange: function (cb) {
      window.addEventListener('storage', function (e) { if (e.key === DATA_KEY) cb(); });
    }
  };
})();
