/* מודול 3: רמות מפתח ואזורי FVG / Order Blocks / ביקוש / היצע.
   סימון ידני מהיר או ייבוא אוטומטי מהניתוח המלא. מעקב מרחק מהמחיר החי, סטטוס, והתראה כשהמחיר נכנס לאזור. */
(function () {
  'use strict';
  var $q = function (s) { return document.querySelector(s); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var num = function (n, d) { return n == null || !isFinite(n) ? '–' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); };
  var KINDS = { demand: ['ביקוש', 'up'], supply: ['היצע', 'down'], fvg_bull: ['פער עולה', 'up'], fvg_bear: ['פער יורד', 'down'], ob_bull: ['אזור קנייה', 'up'], ob_bear: ['אזור מכירה', 'down'], support: ['תמיכה', 'up'], resistance: ['התנגדות', 'down'], level: ['רמה', 'blue'] };
  var PX = {}, inside = {}, timer = null;
  var lv = function () { D.levels = D.levels || []; return D.levels; };
  var price = function (t) { var q = (typeof LIVE !== 'undefined') && (LIVE[t] || LIVE[t + '/USD']); return q && q.price ? +q.price : PX[t] != null ? PX[t] : null; };

  async function pull() {
    if (!S.fh || !D) return;
    var need = []; lv().forEach(function (l) { if (need.indexOf(l.ticker) < 0 && !(typeof LIVE !== 'undefined' && (LIVE[l.ticker] || LIVE[l.ticker + '/USD']))) need.push(l.ticker); });
    await Promise.all(need.slice(0, 20).map(async function (t) {
      try { var r = await fetch('https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(t) + '&token=' + encodeURIComponent(S.fh)); var j = await r.json(); if (j && j.c > 0) PX[t] = j.c; } catch (e) { }
    }));
  }
  function state(l) {
    var p = price(l.ticker); if (p == null) return { p: null, st: 'none' };
    var lo = Math.min(l.lo, l.hi), hi = Math.max(l.lo, l.hi), tol = lo === hi ? p * 0.0015 : 0;
    var ins = p >= lo - tol && p <= hi + tol, d = ins ? 0 : Math.min(Math.abs(p - lo), Math.abs(p - hi)) / p * 100;
    return { p: p, st: ins ? 'in' : d <= 1 ? 'near' : 'far', d: d, above: p > hi };
  }
  async function watch() {
    if (!D || document.hidden) return;
    await pull();
    lv().forEach(function (l) {
      if (l.alert === false) return; var s = state(l); if (s.st === 'none') return;
      var now = s.st === 'in', was = inside[l.id];
      if (now && was === false) { var k = KINDS[l.kind] || KINDS.level; fire('lvl-' + l.id, l.ticker + ' נכנס לאזור ' + k[0] + ' ' + num(l.lo) + (l.hi !== l.lo ? '–' + num(l.hi) : '') + ' (מחיר ' + num(s.p) + ')'); }
      inside[l.id] = now;
    });
    if ($q('#p-lvl.on')) render();
  }

  function add(o) {
    var a = lv(); var lo = Math.min(o.lo, o.hi), hi = Math.max(o.lo, o.hi);
    var dup = a.some(function (x) { return x.ticker === o.ticker && x.kind === o.kind && Math.abs(x.lo - lo) <= (hi - lo || lo * 0.002) && Math.abs(x.hi - hi) <= (hi - lo || hi * 0.002); });
    if (dup) return false;
    a.push({ id: 'l' + Date.now() + Math.floor(Math.random() * 1000), ticker: o.ticker, kind: o.kind, lo: lo, hi: hi, tf: o.tf || '', src: o.src || 'manual', note: o.note || '', alert: true, t: Date.now() });
    return true;
  }
  window.addLevelsFromAnalysis = async function (res, modeKey) {
    if (!res) return toast('אין ניתוח לייבא');
    var tk = res.sym.replace('/USD', ''), n = 0, tfs = ['1D', '1W'], m = res.modes[modeKey || 'swing'];
    tfs.forEach(function (tf) {
      var a = m && m.an.results[tf]; if (!a || !a.ok) return;
      (a.zones.fvg || []).slice(-3).forEach(function (z) { if (add({ ticker: tk, kind: z.dir === 'bull' ? 'fvg_bull' : 'fvg_bear', lo: z.lo, hi: z.hi, tf: tf, src: 'auto' })) n++; });
      (a.zones.ob || []).slice(-3).forEach(function (z) { if (add({ ticker: tk, kind: z.dir === 'bull' ? 'ob_bull' : 'ob_bear', lo: z.lo, hi: z.hi, tf: tf, src: 'auto' })) n++; });
      (a.zones.sr || []).filter(function (z) { return z.src === 'pivots' && z.touches >= 2; }).slice(0, 3).forEach(function (z) { if (add({ ticker: tk, kind: z.type, lo: z.level, hi: z.level, tf: tf, src: 'auto', note: z.touches + ' מגעים' })) n++; });
      if (tf === '1D' && a.poc) { if (add({ ticker: tk, kind: 'level', lo: a.poc, hi: a.poc, tf: tf, src: 'auto', note: 'POC' })) n++; }
    });
    PX[tk] = res.price != null ? res.price : PX[tk];
    await save(); render(); toast(n ? 'נוספו ' + n + ' רמות למעקב' : 'כל הרמות כבר במעקב');
  };

  function row(l) {
    var k = KINDS[l.kind] || KINDS.level, s = state(l), rng = l.hi !== l.lo ? num(l.lo) + ' – ' + num(l.hi) : num(l.lo);
    var stT = s.st === 'in' ? '<span class="chip warn">בתוך האזור</span>' : s.st === 'near' ? '<span class="chip blue">קרוב ' + num(s.d, 2) + '%</span>' : s.st === 'far' ? '<span class="lv-d">' + (s.above ? 'מעל' : 'מתחת') + ' · ' + num(s.d, 1) + '%</span>' : '<span class="lv-d">אין מחיר חי</span>';
    return '<div class="lv-r ' + s.st + '" data-id="' + l.id + '"><div class="lv-main"><b class="tk">' + esc(l.ticker) + '</b><span class="chip ' + k[1] + '">' + k[0] + '</span><b class="lv-rng">' + rng + '</b>' + stT + '</div>' +
      '<div class="lv-sub"><span>' + (s.p != null ? 'מחיר ' + num(s.p) : '') + (l.tf ? ' · ' + esc(l.tf) : '') + (l.src === 'auto' ? ' · אוטומטי' : '') + (l.note ? ' · ' + esc(l.note) : '') + '</span>' +
      '<span class="lv-act"><button data-a="deep" title="נתח">🧠</button><button data-a="calc" title="מחשבון">🧮</button><button data-a="bell" title="התראה" class="' + (l.alert === false ? 'off' : 'on') + '">🔔</button><button data-a="del" title="מחק">×</button></span></div></div>';
  }
  function render() {
    var host = $q('#lvList'); if (!host) return;
    var a = lv().map(function (l) { var s = state(l); return { l: l, d: s.st === 'none' ? 1e9 : (s.d || 0) }; }).sort(function (x, y) { return x.d - y.d; });
    var nIn = a.filter(function (x) { return state(x.l).st === 'in'; }).length, nNear = a.filter(function (x) { return state(x.l).st === 'near'; }).length;
    $q('#lvSum').innerHTML = '<div class="dp-tile"><span>במעקב</span><b>' + a.length + '</b></div><div class="dp-tile ' + (nIn ? 'big' : '') + '"><span>בתוך אזור</span><b>' + nIn + '</b></div><div class="dp-tile"><span>קרובים (עד 1%)</span><b>' + nNear + '</b></div>';
    host.innerHTML = a.length ? a.map(function (x) { return row(x.l); }).join('') : '<div class="dp-empty">עוד אין רמות. סמן אזור בטופס, או הרץ ניתוח מלא ולחץ "שמור רמות למעקב".</div>';
    host.querySelectorAll('.lv-r').forEach(function (el) {
      var l = lv().find(function (x) { return x.id === el.dataset.id; });
      el.querySelectorAll('button').forEach(function (b) {
        b.onclick = async function () {
          if (b.dataset.a === 'del') { D.levels = lv().filter(function (x) { return x.id !== l.id; }); await save(); render(); }
          else if (b.dataset.a === 'bell') { l.alert = l.alert === false; await save(); render(); toast(l.alert ? 'התראה פעילה' : 'התראה כבויה'); }
          else if (b.dataset.a === 'deep') openDeep(l.ticker === 'BTC' ? 'BTC/USD' : l.ticker);
          else if (b.dataset.a === 'calc') { var long = l.kind.indexOf('bear') < 0 && l.kind !== 'supply' && l.kind !== 'resistance'; var e = long ? l.hi : l.lo; openCalc({ sym: l.ticker, entry: e, stop: long ? l.lo - (l.hi - l.lo) * 0.25 - e * 0.002 : l.hi + (l.hi - l.lo) * 0.25 + e * 0.002 }); }
        };
      });
    });
  }
  function build() {
    if ($q('#p-lvl')) return;
    var sec = document.createElement('section'); sec.className = 'page'; sec.id = 'p-lvl';
    sec.innerHTML = '<div class="dp-card"><h3>רמות מחיר</h3>' +
      '<div class="rc-grid"><label class="rc-f"><span>סימול</span><input id="lvT" type="text" autocapitalize="characters"></label>' +
      '<label class="rc-f"><span>סוג</span><select id="lvK">' + Object.keys(KINDS).map(function (k) { return '<option value="' + k + '">' + KINDS[k][0] + '</option>'; }).join('') + '</select></label>' +
      '<label class="rc-f"><span>מחיר תחתון</span><input id="lvLo" type="number" inputmode="decimal" step="any"></label>' +
      '<label class="rc-f"><span>מחיר עליון (לרמה בודדת, השאר ריק)</span><input id="lvHi" type="number" inputmode="decimal" step="any"></label>' +
      '<label class="rc-f" style="grid-column:1/-1"><span>הערה</span><input id="lvN" type="text"></label></div>' +
      '<div class="dp-actions" style="grid-template-columns:1fr 1fr"><button class="btn" id="lvAdd">הוסף</button><button class="btn ghost" id="lvImp">קח מהניתוח האחרון</button></div></div>' +
      '<div class="dp-tiles" id="lvSum" style="margin-bottom:12px"></div><div class="dp-card"><h3>הרמות שלי</h3><div id="lvList"></div></div>';
    document.querySelector('main').appendChild(sec);
    $q('#lvAdd').onclick = async function () {
      var t = $q('#lvT').value.trim().toUpperCase().replace('/USD', ''), lo = +$q('#lvLo').value, hi = $q('#lvHi').value === '' ? lo : +$q('#lvHi').value;
      if (!t || !(lo > 0) || !(hi > 0)) return toast('הזן סימול ומחיר');
      var ok = add({ ticker: t, kind: $q('#lvK').value, lo: lo, hi: hi, note: $q('#lvN').value.trim() });
      if (!ok) return toast('האזור הזה כבר במעקב');
      await save(); $q('#lvLo').value = $q('#lvHi').value = $q('#lvN').value = ''; await pull(); render(); toast('נוסף למעקב');
    };
    $q('#lvImp').onclick = function () { var r = window.__deep && window.__deep.state.res; if (!r) return toast('אין ניתוח מלא אחרון. נתח טיקר קודם'); addLevelsFromAnalysis(r, window.__deep.state.mode); };
  }
  GROUPS.scan.push(['p-lvl', 'רמות']); PAGE_GROUP['p-lvl'] = 'scan';
  var _e = onEnter;
  onEnter = function (id) { _e(id); if (id === 'p-lvl') { build(); var t = $q('#lvT'); if (t && !t.value) t.value = (typeof curSym !== 'undefined' ? curSym : '').replace('/USD', ''); pull().then(render); render(); } };
  build();
  var wait = setInterval(function () { if (typeof D !== 'undefined' && D) { clearInterval(wait); timer = setInterval(watch, 45000); setTimeout(watch, 4000); } }, 400);
  window.__levels = { add: add, state: state, render: render, watch: watch, price: price, PX: PX };
})();
