/* חיפוש חופשי של כל מניה (שם או סימול, גם בעברית לשמות מוכרים) והזדמנויות השוק לפני הניתוח:
   מהסריקה, מניות שזזות עכשיו ורדאר. מכל אחד לוחצים ומקבלים ניתוח, או מקלידים כל טיקר אחר. */
(function () {
  'use strict';
  var DP = window.__deep, $q = function (s) { return document.querySelector(s); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var ALIAS = { 'אנבידיה': 'NVDA', 'נבידיה': 'NVDA', 'מיקרון': 'MU', 'טסלה': 'TSLA', 'אפל': 'AAPL', 'גוגל': 'GOOGL', 'אלפבית': 'GOOGL', 'מיקרוסופט': 'MSFT', 'אמזון': 'AMZN', 'מטא': 'META', 'פייסבוק': 'META', 'נטפליקס': 'NFLX', 'פלנטיר': 'PLTR', 'אינטל': 'INTC', 'איי אם די': 'AMD', 'ברודקום': 'AVGO', 'קואלקום': 'QCOM', 'אורקל': 'ORCL', 'סיילספורס': 'CRM', 'אדובי': 'ADBE', 'פייפאל': 'PYPL', 'קוינבייס': 'COIN', 'מיקרוסטרטג\'י': 'MSTR', 'סופרמיקרו': 'SMCI', 'ארם': 'ARM', 'אובר': 'UBER', 'דיסני': 'DIS', 'בואינג': 'BA', 'פייזר': 'PFE', 'מודרנה': 'MRNA', 'אקסון': 'XOM', 'שברון': 'CVX', 'וולמארט': 'WMT', 'נייקי': 'NKE', 'סטארבקס': 'SBUX', 'טבע': 'TEVA', 'צ\'ק פוינט': 'CHKP', 'מובילאיי': 'MBLY', 'נייס': 'NICE', 'וויקס': 'WIX', 'מונדיי': 'MNDY', 'סולאראדג\'': 'SEDG', 'אלביט': 'ESLT', 'קלאודפלייר': 'NET', 'קראודסטרייק': 'CRWD' };
  var cache = {};
  function fh(path) { var c = DP.getClient(); return c._json(c.fhBase + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(S.fh), c.fhLimiter); }
  function local(q) {
    var set = {}, out = [], u = q.toUpperCase();
    try { (D.watch || []).forEach(function (w) { (w.items || []).forEach(function (t) { set[t] = 1; }); }); (window.__scan && window.__scan.SECTORS || []).forEach(function (g) { g.syms.forEach(function (t) { set[t] = 1; }); }); } catch (e) { }
    Object.keys(ALIAS).forEach(function (k) { if (k.indexOf(q) >= 0 && q.length >= 2) out.push({ symbol: ALIAS[k], name: k }); });
    Object.keys(set).forEach(function (t) { if (t.indexOf(u) === 0 && !out.some(function (x) { return x.symbol === t; })) out.push({ symbol: t, name: 'מהרשימות והסריקה שלך' }); });
    return out.slice(0, 6);
  }
  async function remote(q) {
    if (!S.fh) return []; if (cache[q]) return cache[q];
    try { var j = await fh('/search?q=' + encodeURIComponent(q)); var a = ((j && j.result) || []).filter(function (x) { return /^[A-Z]{1,5}(\.[A-Z])?$/.test(x.symbol) && /Common Stock|ETP|ADR|ETF|REIT/i.test(x.type || 'Common Stock'); }).map(function (x) { return { symbol: x.symbol, name: x.description || '' }; }); cache[q] = a; return a; } catch (e) { return []; }
  }
  /* תפריט הצעות לשדה חיפוש */
  function attach(input, pick) {
    if (!input || input.dataset.fd) return; input.dataset.fd = '1'; input.removeAttribute('list');
    var host = input.parentNode; if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    var dd = document.createElement('div'); dd.className = 'sym-dd'; dd.style.display = 'none'; host.appendChild(dd); var tm = null, seq = 0;
    function hide() { dd.style.display = 'none'; dd.innerHTML = ''; }
    function show(list) {
      if (!list.length) return hide();
      dd.innerHTML = list.map(function (x) { return '<button type="button" data-s="' + esc(x.symbol) + '"><b dir="ltr">' + esc(x.symbol) + '</b><span>' + esc((x.name || '').slice(0, 34)) + '</span></button>'; }).join(''); dd.style.display = '';
      dd.querySelectorAll('button').forEach(function (b) { b.onmousedown = function (e) { e.preventDefault(); }; b.onclick = function () { hide(); pick(b.dataset.s); }; });
    }
    input.addEventListener('input', function () {
      var v = input.value.trim(), my = ++seq; if (!v) return hide();
      show(local(v)); clearTimeout(tm);
      tm = setTimeout(async function () { var r = await remote(v); if (my !== seq) return; var l = local(v), seen = {}; var all = l.concat(r).filter(function (x) { if (seen[x.symbol]) return false; seen[x.symbol] = 1; return true; }).slice(0, 8); show(all); }, 220);
    });
    input.addEventListener('blur', function () { setTimeout(hide, 150); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  }
  /* הזדמנויות השוק */
  var ST = { busy: false };
  function opp() {
    var out = [], rep = window.__scan && window.__scan.state.report;
    if (rep && rep.rows && rep.rows.length) out.push({ t: 'מהסריקה' + (rep.at ? ' (' + new Date(rep.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) + ')' : ''), items: rep.rows.slice().sort(function (a, b) { return b.step - a.step || b.comp - a.comp; }).slice(0, 12).map(function (r) { return { s: r.sym, tag: r.dir === 'long' ? 'לונג' : 'שורט', cls: r.dir, note: r.comp + '', sec: r.sector }; }) });
    var mv = window.__hot ? window.__hot.movers() : []; if (mv.length) out.push({ t: 'זזים עכשיו', items: mv.slice(0, 10).map(function (m) { return { s: m.s, tag: (m.dp >= 0 ? '+' : '') + (m.dp || 0).toFixed(1) + '%', cls: m.dp >= 0 ? 'long' : 'short' }; }) });
    var rd = null; try { rd = (window.__brief && window.__brief.state.radar && window.__brief.state.radar.hot) ? window.__brief.state.radar : JSON.parse(localStorage.getItem('adir-radar') || 'null'); } catch (e) { }
    if (rd && rd.hot) { var items = rd.hot.concat(rd.upcoming || []).filter(function (x) { return x.verified !== false; }).slice(0, 12).map(function (x) { return { s: x.sym, tag: x.type || x.move || 'רדאר', cls: '' }; }); if (items.length) out.push({ t: 'רדאר: מתפוצצות וקטליזטורים', items: items }); }
    return out;
  }
  function paintOpp() {
    var host = $q('#dpOpp'); if (!host) return; var G = opp(), sc = window.__scan && window.__scan.state;
    var msg = ST.busy ? (sc && sc.msg ? sc.msg : 'סורק…') : '';
    host.innerHTML = '<summary>הזדמנויות בשוק <small>בחר מניה מכאן, או הקלד כל טיקר למעלה</small></summary><div class="opp-in"><button class="btn" id="oppGo"' + (ST.busy ? ' disabled' : '') + '>' + (ST.busy ? 'סורק את השוק…' : 'סרוק את כל השוק עכשיו') + '</button>' + (msg ? '<div class="dp-foot" style="text-align:right">' + esc(msg) + '</div>' : '') +
      (G.length ? G.map(function (g) { return '<h4 class="cx-h">' + esc(g.t) + '</h4><div class="opp-ch">' + g.items.map(function (x) { return '<button data-os="' + esc(x.s) + '" class="opp-c ' + (x.cls || '') + '"><b dir="ltr">' + esc(x.s) + '</b><span>' + esc(x.tag) + (x.note ? ' · ' + esc(x.note) : '') + '</span></button>'; }).join('') + '</div>'; }).join('') : '<div class="dp-empty">עוד לא נסרק. לחץ "סרוק את כל השוק עכשיו" וקבל הזדמנויות לפי סקטור, מניות שזזות, ורדאר של מניות מתפוצצות.</div>') +
      '<div class="dp-foot" style="text-align:right">הסריקה בודקת מניות נזילות מכל הסקטורים ומדרגת אותן, והרדאר מחפש ברשת בכל השוק האמריקאי. מניה שלא ברשימה אפשר להקליד למעלה, והיא תיבדק כמו כל מניה אחרת.</div></div>';
    host.querySelectorAll('[data-os]').forEach(function (b) { b.onclick = function () { window.openDeep(b.dataset.os); }; });
    var go = $q('#oppGo'); if (go) go.onclick = marketScan;
  }
  async function marketScan() {
    if (ST.busy) return; ST.busy = true; paintOpp(); var iv = setInterval(paintOpp, 1500);
    try {
      var jobs = [];
      if (window.__scan && !window.__scan.state.busy) jobs.push(window.__scan.run({ mode: 'quick' }));
      if (window.__hot) { try { localStorage.removeItem('adir-hot'); } catch (e) { } jobs.push(window.__hot.refresh(true)); }
      if (window.__brief && window.__brief.loadRadar) jobs.push(window.__brief.loadRadar(true));
      await Promise.all(jobs.map(function (j) { return Promise.resolve(j).catch(function () { }); }));
    } finally { clearInterval(iv); ST.busy = false; paintOpp(); }
  }
  function build() {
    var sec = $q('#p-deep'); if (!sec) return false; if ($q('#dpOpp')) return true; var after = sec.querySelector('#dpSug');
    var d = document.createElement('details'); d.id = 'dpOpp'; d.className = 'dp-card dp-opp'; d.open = true; if (after) after.parentNode.insertBefore(d, after.nextSibling); else sec.insertBefore(d, sec.firstChild);
    var q = $q('#dpQ'); attach(q, function (sym) { q.value = sym; DP.run(sym); }); paintOpp(); return true;
  }
  /* אחרי שמתחיל ניתוח מקפלים את ההזדמנויות כדי שהעמוד יישאר נקי */
  setInterval(function () { var d = $q('#dpOpp'); if (d && d.open && DP.state.busy && !ST.busy) d.open = false; }, 500);
  var qs = $q('#qsIn'); attach(qs, function (sym) { qs.value = ''; window.openDeep(sym); });
  var _e = onEnter; onEnter = function (id) { _e(id); if (id === 'p-deep') { build(); paintOpp(); } };
  window.__find = { local: local, remote: remote, opp: opp, marketScan: marketScan, ALIAS: ALIAS };
  setTimeout(build, 1500);
})();
