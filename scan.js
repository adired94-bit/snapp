/* סריקת מניות: כפתור אחד, דוח אחד.
   שלב 1 (Finnhub, מהיר): סורק רשימה רחבה לפי קרבה לשיא/שפל, חוזק יחסי מול S&P, תשואות, גאפ ופונדמנטל.
   שלב 2 (Twelve Data): ניתוח טכני מלא, תבנית מגמה ותבניות נרות למניות המובילות.
   שלב 3 (Finnhub): המלצות אנליסטים ותאריך דוחות.
   בסוף: ציון משולב שקוף (טכני, מגמה, יסוד, אנליסטים, נרות, חוזק יחסי, מצב שוק) והחלטה לכל מניה, עם תוכנית. */
(function () {
  'use strict';
  var E = AT.engine, DP = window.__deep;
  var $q = function (s) { return document.querySelector(s); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var num = function (n, d) { return n == null || !isFinite(n) ? '–' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); };
  var px = function (n) { return n == null || !isFinite(n) ? '–' : Math.abs(n) >= 10 ? num(n, 2) : num(n, 3); };
  var KEY = 'adir-scan3';
  var FAST = ('AAPL MSFT NVDA GOOGL AMZN META TSLA AVGO AMD NFLX COST ADBE CRM ORCL INTC QCOM MU TXN AMAT LRCX KLAC PLTR SMCI ARM TSM UBER SHOP COIN MSTR MARA RIOT HOOD SOFI PYPL JPM BAC GS V MA WMT HD NKE MCD SBUX DIS BA CAT LMT GE XOM CVX OXY LLY UNH PFE MRNA ABBV NVO ENPH FSLR SNOW CRWD PANW NET DDOG ANET MRVL').split(' ');
  var WIDE = FAST.concat(('AMGN GILD REGN VRTX ISRG TMO DHR MRK BMY CVS T VZ TMUS CMCSA PEP KO PG CL MDLZ LOW TGT TJX LULU ABNB BKNG MAR CMG NXPI ON ASML FTNT TEAM WDAY NOW INTU ADP SPGI BLK SCHW AXP C WFC MS USB COP EOG MPC PSX DVN HAL FCX NEM NUE ALB LIN UPS FDX DAL UAL AAL LUV CCL RCL F GM RIVN LCID DKNG PINS SNAP RBLX U TTD DOCU ZM OKTA TWLO MELI SE BABA PDD JD BIDU SPOT ETSY CHWY EBAY').split(' '));
  var uniq = function (a) { var s = {}; return a.filter(function (x) { return !s[x] && (s[x] = 1); }); };
  FAST = uniq(FAST); WIDE = uniq(WIDE);
  var ST = { mode: 'fast', busy: false, stop: false, stage: 0, done: 0, total: 0, msg: '', report: null, custom: '' };
  try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv && sv.rows) ST.report = sv; } catch (e) { }
  var persist = function () { try { var r = ST.report; localStorage.setItem(KEY, JSON.stringify({ at: r.at, mode: r.mode, regime: r.regime, rows: r.rows, s1: r.s1.slice(0, 60), universe: r.universe, failed: r.failed })); } catch (e) { } };

  /* ---------- עזרים ---------- */
  function parseSyms(text) {
    var seen = {}, out = [];
    String(text || '').split(/[\s,;\n\r\t]+/).forEach(function (t) {
      t = t.replace(/^.*:/, '').toUpperCase().replace(/[^A-Z0-9.\-\/]/g, ''); if (t === 'BTC') t = 'BTC/USD'; if (t === 'ETH') t = 'ETH/USD';
      if (/^[A-Z][A-Z0-9.\-]{0,5}$|^[A-Z]{2,5}\/USD$/.test(t) && !seen[t]) { seen[t] = 1; out.push(t); }
    });
    return out.slice(0, 200);
  }
  function mine() {
    var seen = {}, out = []; var add = function (t) { t = String(t || '').toUpperCase(); if (t && !seen[t]) { seen[t] = 1; out.push(t); } };
    (D.trades || []).filter(function (t) { return t.status !== 'closed'; }).forEach(function (t) { add(t.ticker); }); (D.plans || []).forEach(function (p) { add(p.ticker); });
    (D.watch || []).forEach(function (w) { w.items.forEach(function (t) { if (!/[:\/]/.test(t)) add(t); }); }); return out;
  }
  function fh(path) { var c = DP.getClient(); return c._json(c.fhBase + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(S.fh), c.fhLimiter); }
  function setMsg(t) { ST.msg = t; var n = $q('#scMsg'); if (n) n.textContent = t; var b = $q('#scBar i'); if (b && ST.total) b.style.width = Math.min(100, Math.round(ST.done / ST.total * 100)) + '%'; var s = $q('#scStage'); if (s) s.textContent = ST.stage ? 'שלב ' + ST.stage + ' מתוך 3' : ''; }
  async function pool(items, n, fn) { var i = 0, res = new Array(items.length); await Promise.all(Array.from({ length: n }, async function () { while (i < items.length && !ST.stop) { var k = i++; res[k] = await fn(items[k], k); } })); return res; }

  /* ---------- שלב 1: סריקה מהירה (Finnhub) ---------- */
  function s1row(sym, q, mm) {
    if (!q || !(q.c > 0)) return { sym: sym, err: 'אין מחיר' };
    var m = (mm && mm.metric) || {}, price = q.c, g = function (k) { var v = m[k]; return v != null && isFinite(v) ? v : null; };
    var gap = q.pc > 0 && q.o > 0 ? (q.o / q.pc - 1) * 100 : null, hi = g('52WeekHigh'), lo = g('52WeekLow');
    var dHi = hi ? (price / hi - 1) * 100 : null, dLo = lo ? (price / lo - 1) * 100 : null;
    var rs13 = g('priceRelativeToS&P50013Week'), rs26 = g('priceRelativeToS&P50026Week'), r13 = g('13WeekPriceReturnDaily'), r26 = g('26WeekPriceReturnDaily');
    var fs = DP.fundScore({ metric: m, rec: null }, price), L = 0, S_ = 0;
    if (dHi != null) { if (dHi >= -8) L += 2; else if (dHi >= -20) L += 1; if (dHi <= -40) S_ += 2; else if (dHi <= -25) S_ += 1; }
    if (dLo != null) { if (dLo <= 15) S_ += 2; if (dLo >= 60) L += 1; }
    if (rs13 != null) { L += rs13 > 5 ? 2 : rs13 > 0 ? 1 : 0; S_ += rs13 < -5 ? 2 : rs13 < 0 ? 1 : 0; }
    if (rs26 != null) { L += rs26 > 0 ? 1 : 0; S_ += rs26 < 0 ? 1 : 0; }
    if (r13 != null) { L += r13 > 15 ? 1 : 0; S_ += r13 < -15 ? 1 : 0; }
    if (gap != null) { L += gap > 2 ? 1 : 0; S_ += gap < -2 ? 1 : 0; }
    if (fs && fs.score != null) { L += fs.score >= 65 ? 1 : 0; S_ += fs.score <= 35 ? 1 : 0; }
    return { sym: sym, price: price, chg: q.dp, gap: gap, dHi: dHi, dLo: dLo, rs13: rs13, rs26: rs26, r13: r13, fs: fs ? fs.score : null, fsNotes: fs ? fs.notes : [], L: L, S: S_, metric: m };
  }
  async function stage1(syms) {
    ST.stage = 1; ST.done = 0; ST.total = syms.length; var rows = [], bad = [];
    await pool(syms, 5, async function (sym) {
      try { var q = await fh('/quote?symbol=' + encodeURIComponent(sym)), m = await fh('/stock/metric?symbol=' + encodeURIComponent(sym) + '&metric=all'), r = s1row(sym, q, m); if (r.err) bad.push({ sym: sym, err: r.err }); else rows.push(r); }
      catch (e) { bad.push({ sym: sym, err: e.message }); if (/401|403/.test(e.message)) ST.stop = true; }
      ST.done++; setMsg('סורק את השוק: ' + ST.done + ' מתוך ' + syms.length + ' מניות');
    });
    return { rows: rows, bad: bad };
  }
  function shortlist(rows, kL, kS) {
    var L = rows.slice().sort(function (a, b) { return b.L - a.L || (b.rs13 || 0) - (a.rs13 || 0); }).filter(function (r) { return r.L >= 3; }).slice(0, kL);
    var S_ = rows.slice().sort(function (a, b) { return b.S - a.S || (a.rs13 || 0) - (b.rs13 || 0); }).filter(function (r) { return r.S >= 3; }).slice(0, kS);
    var seen = {}, out = []; L.concat(S_).forEach(function (r) { if (!seen[r.sym]) { seen[r.sym] = 1; r.side1 = L.indexOf(r) >= 0 ? 'long' : 'short'; out.push(r); } }); return out;
  }

  /* ---------- שלב 2: ניתוח טכני (Twelve Data) ---------- */
  function ttShort(bars, spy) { /* מראה היפוכית של התבנית לשורט: בנייה שלי, לא מקור חיצוני */
    if (!bars || bars.length < 210) return { ok: false };
    var c = bars.map(function (b) { return b.c; }), i = c.length - 1, p_ = c[i], av = function (p, k) { var t = 0; for (var j = k - p + 1; j <= k; j++) t += c[j]; return t / p; };
    var s50 = av(50, i), s150 = av(150, i), s200 = av(200, i), s200p = av(200, i - 22), hi = -Infinity, lo = Infinity;
    bars.slice(-252).forEach(function (b) { if (b.h > hi) hi = b.h; if (b.l < lo) lo = b.l; });
    var r = [p_ < s150 && p_ < s200, s150 < s200, s200 < s200p, s50 < s150 && s50 < s200, p_ < s50, p_ <= hi * 0.7, p_ <= lo * 1.25];
    if (spy && spy.length > 130 && bars.length > 126) r.push((bars[i].c / bars[i - 126].c - spy[spy.length - 1].c / spy[spy.length - 127].c) < 0);
    var pass = r.filter(Boolean).length; return { ok: true, pass: pass, total: r.length, verdict: pass >= 7 ? 'ready' : pass >= 5 ? 'partial' : 'no' };
  }
  function technical(sym, bars, spy) {
    if (!bars || bars.length < 60) return { err: 'מעט מדי נרות (' + (bars ? bars.length : 0) + ')' };
    var a = E.analyzeTF(bars, '1D'); if (!a.ok) return { err: a.reason || 'אין ניתוח' };
    var dir = a.score >= 0 ? 'long' : 'short', tt = dir === 'long' ? DP.trendTemplate(bars, spy) : ttShort(bars, spy);
    var risk = a.atr * 1.5, long = dir === 'long', qty = risk > 0 && S.risk > 0 ? Math.floor(S.risk / risk) : 0, ml = +S.maxLev > 0 ? +S.maxLev : 1;
    if (S.acct > 0 && a.price > 0) qty = Math.min(qty, Math.floor(S.acct * ml / a.price));
    var rs6 = spy && spy.length > 130 && bars.length > 126 ? (bars[bars.length - 1].c / bars[bars.length - 127].c - spy[spy.length - 1].c / spy[spy.length - 127].c) * 100 : null;
    return { score: a.score, dir: dir, a: a, tt: tt && tt.ok ? tt : null, rs6: rs6, atrPct: a.atr / a.price * 100, rvol: a.rvol, state: a.state, patterns: a.patterns || [], notes: a.notes || [],
      plan: { entry: a.price, stop: long ? a.price - risk : a.price + risk, t1: long ? a.price + 2 * risk : a.price - 2 * risk, t2: long ? a.price + 3 * risk : a.price - 3 * risk, qty: qty, riskUsd: qty * risk, atr: a.atr } };
  }

  /* ---------- שלב 3 + ציון משולב ---------- */
  function composite(r, regime) {
    var sg = r.dir === 'long' ? 1 : -1, br = [], why = [], risks = [], add = function (k, v, label) { br.push({ k: k, v: v, label: label }); };
    var tech = Math.min(40, Math.abs(r.score) * 0.5); add('טכני', tech, 'ציון יומי ' + r.score);
    var tt = r.tt ? r.tt.pass / r.tt.total * 15 : 0; add('מגמה', tt, r.tt ? 'תבנית ' + r.tt.pass + '/' + r.tt.total : 'אין נתון');
    var f = r.fs != null ? (r.fs / 100 - 0.5) * 2 * 10 * sg : 0; add('יסוד', f, r.fs != null ? 'ציון יסוד ' + r.fs : 'אין נתון');
    var an = 0, anL = 'אין נתון';
    if (r.rec) { var share = r.rec.share; an = (sg > 0 ? (share - 0.5) : (0.5 - share)) * 2 * 10; if (r.rec.d != null) an += Math.max(-3, Math.min(3, r.rec.d * sg / 3)); anL = Math.round(share * 100) + '% ממליצים קנייה' + (r.rec.d != null ? ' (' + (r.rec.d >= 0 ? '+' : '') + r.rec.d.toFixed(0) + ' נק\')' : ''); }
    add('אנליסטים', an, anL);
    var cn = 0, pn = []; (r.patterns || []).forEach(function (p) { var d = p.dir === 'bull' ? 1 : p.dir === 'bear' ? -1 : 0; if (!d) return; var v = (d * sg > 0 ? 1 : -1) * Math.min(3, p.strength) * 2; cn += v; pn.push(p.name + (d * sg > 0 ? '' : ' (נגד)')); });
    cn = Math.max(-8, Math.min(8, cn)); add('נרות', cn, pn.length ? pn.join(', ') : 'אין תבנית');
    var rs = r.rs6 != null ? Math.max(-5, Math.min(5, r.rs6 * sg / 4)) : 0; add('חוזק יחסי', rs, r.rs6 != null ? (r.rs6 >= 0 ? '+' : '') + r.rs6.toFixed(1) + ' מול SPY' : 'אין נתון');
    var rg = 0; if (regime) { var counter = (r.dir === 'long' && regime.state === 'off') || (r.dir === 'short' && regime.state === 'on'); rg = counter ? -8 : (regime.state === 'mixed' ? 0 : 3); add('מצב שוק', rg, regime.label + (counter ? ' (נגד)' : '')); }
    var er = 0; if (r.earnDays != null && r.earnDays >= 0 && r.earnDays <= 7) { er = -5; risks.push('דוחות בעוד ' + r.earnDays + ' ימים: פער מחיר אפשרי'); } if (er) add('דוחות', er, 'בעוד ' + r.earnDays + ' ימים');
    var total = Math.max(0, Math.min(100, Math.round(tech + tt + f + an + cn + rs + rg + er)));
    br.forEach(function (b) { if (b.v >= 3) why.push(b.k + ': ' + b.label); else if (b.v <= -3) risks.push(b.k + ': ' + b.label + ' (נגד הכיוון)'); });
    var step = total >= 65 && Math.abs(r.score) >= 30 ? 2 : total >= 45 ? 1 : 0;
    if (r.gap != null && Math.abs(r.gap) >= 4) why.push('גאפ ' + (r.gap >= 0 ? '+' : '') + r.gap.toFixed(1) + '% בפתיחה');
    r.comp = total; r.br = br; r.why = why; r.risks = risks; r.step = step; return r;
  }
  async function enrich(rows, spy, regime) {
    ST.stage = 3; ST.done = 0; ST.total = rows.length;
    await pool(rows, 4, async function (r) {
      if (S.fh && r.sym.indexOf('/') < 0) {
        try { var rec = await fh('/stock/recommendation?symbol=' + encodeURIComponent(r.sym)); if (Array.isArray(rec) && rec.length) { var calc = function (x) { var t = (x.strongBuy || 0) + (x.buy || 0) + (x.hold || 0) + (x.sell || 0) + (x.strongSell || 0); return t ? { share: ((x.strongBuy || 0) + (x.buy || 0)) / t, tot: t } : null; }, a = calc(rec[0]), b = rec[1] ? calc(rec[1]) : null; if (a) r.rec = { share: a.share, tot: a.tot, d: b ? (a.share - b.share) * 100 : null, period: rec[0].period }; } } catch (e) { }
        try { var er = await DP.getClient().earnings(r.sym); if (er && er.date) r.earnDays = Math.round((Date.parse(er.date) - Date.now()) / 864e5); } catch (e) { }
      }
      composite(r, regime); ST.done++; setMsg('אנליסטים ודוחות: ' + ST.done + ' מתוך ' + rows.length);
    });
  }

  /* ---------- הרצה ---------- */
  async function run(opts) {
    if (ST.busy) { ST.stop = true; return; }
    opts = opts || {}; var mode = opts.mode || ST.mode, custom = opts.custom;
    if (!S.td) return toast('צריך מפתח Twelve Data בהגדרות (⚙️)');
    var universe = custom && custom.length ? custom : mode === 'wide' ? WIDE : mode === 'mine' ? mine() : FAST;
    if (!universe.length) return toast('אין מניות לסרוק');
    if (!S.fh && universe.length > 12) return toast('לסריקה רחבה צריך מפתח Finnhub. עם עד 12 מניות אפשר גם בלעדיו');
    ST.busy = true; ST.stop = false; ST.mode = custom && custom.length ? 'custom' : mode; paint();
    var c = DP.getClient(), report = { at: Date.now(), mode: ST.mode, universe: universe.length, regime: null, rows: [], s1: [], failed: [] };
    try {
      var s1 = { rows: [], bad: [] }, deep;
      if (universe.length > 20 && S.fh) { s1 = await stage1(universe); report.s1 = s1.rows.map(function (r) { var o = Object.assign({}, r); delete o.metric; delete o.fsNotes; return o; }); report.failed = s1.bad; if (!s1.rows.length) throw new Error('לא התקבלו נתונים מ-Finnhub. הרץ "בדיקת חיבורים" כדי לראות למה.'); deep = shortlist(s1.rows, 12, 8); }
      else deep = universe.map(function (s) { return { sym: s }; });
      if (!deep.length) throw new Error('אף מניה לא עברה את הסינון המהיר. נסה סריקה רחבה.');
      ST.stage = 2; ST.done = 0; ST.total = deep.length + 1; setMsg('בודק את מצב השוק (SPY)…');
      var spy = null; try { spy = await c.series('SPY', '1day', 300); } catch (e) { } ST.done = 1;
      report.regime = DP.regimeOf(spy); var out = [];
      for (var i = 0; i < deep.length && !ST.stop; i++) {
        var d = deep[i]; setMsg('ניתוח טכני: ' + d.sym + ' (' + (i + 1) + ' מתוך ' + deep.length + ')');
        try { var bars = d.sym === 'SPY' && spy ? spy : await c.series(d.sym, '1day', 300), t = technical(d.sym, bars, spy); if (t.err) report.failed.push({ sym: d.sym, err: t.err }); else { var row = Object.assign({}, d, t); delete row.a; row.zones = { poc: t.a.poc, vah: t.a.vah, val: t.a.val }; row.price = t.plan.entry; out.push(row); } }
        catch (e) { report.failed.push({ sym: d.sym, err: e.message }); }
        ST.done = i + 2;
      }
      await enrich(out, spy, report.regime);
      out.forEach(function (r) { delete r.metric; });
      out.sort(function (a, b) { return b.step - a.step || b.comp - a.comp; });
      report.rows = out; ST.report = report; persist();
      setMsg(ST.stop ? 'הסריקה נעצרה' : '');
    } catch (e) { setMsg('הסריקה נכשלה: ' + e.message); toast(e.message.slice(0, 80)); }
    ST.busy = false; ST.stage = 0; paint(); renderHome();
  }

  /* ---------- אבחון חיבורים ---------- */
  async function diagnose() {
    var box = $q('#scDiag'); box.innerHTML = '<div class="dp-foot">בודק…</div>'; var out = [];
    var test = async function (name, key, url, ok) {
      if (!key) return out.push([false, name, 'אין מפתח. הוסף בהגדרות (⚙️).']);
      try { var r = await fetch(url), j = await r.json(); var m = ok(j); out.push(m ? [true, name, m] : [false, name, (r.status === 401 || r.status === 403 ? 'המפתח לא תקין או חסום (' + r.status + ')' : r.status === 429 ? 'חריגה ממגבלת הקריאות. נסה בעוד דקה.' : 'תשובה לא צפויה: ' + JSON.stringify(j).slice(0, 120))]); }
      catch (e) { out.push([false, name, 'לא ניתן להגיע לשרת (' + e.message + '). סיבות אפשריות: חסם פרסומות או VPN, או חסימת רשת.']); }
    };
    await test('Twelve Data (נרות)', S.td, 'https://api.twelvedata.com/quote?symbol=SPY&apikey=' + encodeURIComponent(S.td || ''), function (j) { if (j.status === 'error') { out.msg = j.message; return null; } return j.close ? 'תקין. SPY ' + num(+j.close, 2) : null; });
    if (out.length && !out[out.length - 1][0] && out.msg) out[out.length - 1][2] = 'Twelve Data: ' + out.msg;
    await test('Finnhub (מחירים, יסוד, אנליסטים)', S.fh, 'https://finnhub.io/api/v1/quote?symbol=AAPL&token=' + encodeURIComponent(S.fh || ''), function (j) { return j && j.c > 0 ? 'תקין. AAPL ' + num(j.c, 2) : null; });
    box.innerHTML = '<ul class="dp-gates">' + out.map(function (x) { return '<li class="' + (x[0] ? 'ok' : 'no') + '"><i>' + (x[0] ? '✓' : '✕') + '</i><div>' + esc(x[1]) + '<small>' + esc(x[2]) + '</small></div></li>'; }).join('') + '</ul>';
    return out;
  }

  /* ---------- תצוגה ---------- */
  var DEC = { 2: ['entry', 'כניסה'], 1: ['prep', 'לקראת כניסה'], 0: ['watch', 'מעקב'] };
  function decText(r) {
    var side = r.dir === 'long' ? 'לונג' : 'שורט';
    return r.step === 2 ? side + ': הציון המשולב גבוה וכל הרכיבים העיקריים תומכים. אפשר לתכנן כניסה לפי התוכנית.' : r.step === 1 ? side + ': יש כיוון ותמיכה חלקית. מחכים לריטסט, נר אישור או שיפור באחד הרכיבים החלשים.' : 'נטייה ל' + side + ' בלבד, בלי יתרון מספיק. אם נכנסים בכל זאת, רק בגודל מוקטן.';
  }
  function bar(v) { var p = Math.round(Math.min(100, Math.abs(v)) / 2); return '<div class="dp-bar"><i class="' + (v >= 0 ? 'pos' : 'neg') + '" style="' + (v >= 0 ? 'right:50%;' : 'left:50%;') + 'width:' + p + '%"></i></div>'; }
  function cardHtml(r) {
    var d = DEC[r.step], side = r.dir, p = r.plan, pos = r.br.filter(function (b) { return b.v >= 3; }).length;
    var chips = r.br.map(function (b) { return '<span class="sc-ch ' + (b.v >= 3 ? 'pos' : b.v <= -3 ? 'neg' : '') + '" title="' + esc(b.label) + '">' + b.k + ' ' + (b.v >= 0 ? '+' : '') + Math.round(b.v) + '</span>'; }).join('');
    return '<div class="sm-r ' + side + ' s' + r.step + '" data-s="' + esc(r.sym) + '"><div class="sm-h"><b class="tk">' + esc(r.sym) + '</b><span class="sm-px">$' + px(r.price) + (r.chg != null ? ' <em class="' + (r.chg >= 0 ? 'up' : 'down') + '">' + (r.chg >= 0 ? '+' : '') + num(r.chg, 1) + '%</em>' : '') + '</span><span class="sm-v ' + side + '">' + (side === 'long' ? 'לונג' : 'שורט') + ' · ' + r.comp + '/100</span></div>' +
      '<div class="sc-comp"><div class="sc-meter"><i style="width:' + r.comp + '%"></i></div></div>' +
      '<div class="sm-d ' + d[0] + '"><i></i><b>' + d[1] + '</b><span>' + esc(decText(r)) + '</span></div><div class="sc-chips">' + chips + '</div>' +
      (r.why.length ? '<ul class="dp-list pos sc-l">' + r.why.slice(0, 4).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
      (r.risks.length ? '<ul class="dp-list neg sc-l">' + r.risks.slice(0, 3).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="sm-pl"><span>כניסה <b>$' + px(p.entry) + '</b></span><span>סטופ <b class="down">$' + px(p.stop) + '</b></span><span>יעד 1 <b class="up">$' + px(p.t1) + '</b></span><span>יעד 2 <b class="up">$' + px(p.t2) + '</b></span><span>כמות <b>' + (p.qty || '–') + '</b></span></div>' +
      '<div class="sm-a"><button data-a="deep">🧠 ניתוח מלא</button><button data-a="calc">🧮 מחשבון</button><button data-a="save">📓 שמור ליומן</button></div></div>';
  }
  function paint() {
    var host = $q('#scOut'); if (!host) return;
    var go = $q('#scGo'); if (go) go.textContent = ST.busy ? '⏹ עצור' : '🔎 סרוק את השוק';
    var bar_ = $q('#scBar'); if (bar_) bar_.style.display = ST.busy ? '' : 'none';
    document.querySelectorAll('#scMode button').forEach(function (b) { b.classList.toggle('on', b.dataset.m === ST.mode); });
    var cu = $q('#scCustomW'); if (cu) cu.style.display = ST.mode === 'custom' ? '' : 'none';
    var R = ST.report;
    if (!R) { host.innerHTML = ST.busy ? '<div class="dp-skel"><i style="height:150px"></i><i style="height:150px"></i></div>' : '<div class="dp-card"><div class="dp-empty">עוד לא נסרק. לחץ "סרוק את השוק". סריקה מהירה של כ-70 מניות לוקחת כ-4 דקות.</div></div>'; return; }
    var L = R.rows.filter(function (r) { return r.dir === 'long'; }), Sh = R.rows.filter(function (r) { return r.dir === 'short'; }), top = R.rows.filter(function (r) { return r.step === 2; }).length;
    var rg = R.regime ? '<div class="dp-regime ' + R.regime.state + '"><i></i><b>' + R.regime.label + '</b><span>SPY ' + (R.regime.dist >= 0 ? '+' : '') + R.regime.dist.toFixed(1) + '% מממוצע 200</span></div>' : '';
    var ph = AT.session.phase(Date.now()), when = '<div class="dp-foot" style="text-align:right">סריקה מ-' + new Date(R.at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' · נסרקו ' + R.universe + ' מניות, נותחו לעומק ' + R.rows.length + ' · כעת: ' + esc(ph.label) + '</div>';
    var sum = '<div class="sm-sum"><div><b>' + top + '</b><span>כניסה</span></div><div><b class="up">' + L.length + '</b><span>לונג</span></div><div><b class="down">' + Sh.length + '</b><span>שורט</span></div><div><b>' + R.universe + '</b><span>נסרקו</span></div></div>';
    var sec = function (title, arr) { return arr.length ? '<h2>' + title + ' <small>' + arr.length + '</small></h2>' + arr.map(cardHtml).join('') : ''; };
    var rest = (R.s1 || []).filter(function (x) { return !R.rows.some(function (r) { return r.sym === x.sym; }); }).slice(0, 25);
    var restH = rest.length ? '<details class="ht-set"><summary>שאר המניות שנסרקו (' + rest.length + ' מובילות מתוך הסינון המהיר)</summary><div class="sc-rest">' + rest.map(function (x) { return '<div><b>' + esc(x.sym) + '</b><span>$' + px(x.price) + '</span><em class="' + (x.L >= x.S ? 'up' : 'down') + '">' + (x.L >= x.S ? 'לונג ' + x.L : 'שורט ' + x.S) + '</em><small>' + (x.dHi != null ? num(x.dHi, 0) + '% משיא' : '') + (x.rs13 != null ? ' · חוזק ' + num(x.rs13, 0) : '') + '</small></div>'; }).join('') + '</div></details>' : '';
    var bad = (R.failed || []).length ? '<details class="ht-set"><summary>לא נסרקו (' + R.failed.length + ')</summary>' + R.failed.slice(0, 30).map(function (x) { return '<div class="dp-foot" style="text-align:right">' + esc(x.sym) + ': ' + esc(x.err) + '</div>'; }).join('') + '</details>' : '';
    host.innerHTML = rg + when + sum + (R.rows.length ? sec('📈 לונג', L) + sec('📉 שורט', Sh) : '<div class="dp-card"><div class="dp-empty">לא נמצאו מניות לניתוח מלא.</div></div>') + restH + bad +
      '<div class="dp-foot" style="text-align:right;margin-top:10px">הציון המשולב הוא סכום שקוף של טכני (עד 40), תבנית מגמה (15), יסוד (10), אנליסטים (10), נרות (8), חוזק יחסי (5), מצב שוק ודוחות. לא ייעוץ השקעות, והציון אינו הבטחה. נתוני Finnhub חינמיים עשויים להיות מושהים.</div>';
    host.querySelectorAll('.sm-r').forEach(function (el) {
      var r = R.rows.find(function (x) { return x.sym === el.dataset.s; });
      el.querySelectorAll('button').forEach(function (b) { b.onclick = function () {
        if (b.dataset.a === 'deep') openDeep(r.sym);
        else if (b.dataset.a === 'calc') openCalc({ sym: r.sym.replace('/USD', ''), entry: r.plan.entry, stop: r.plan.stop, atr: r.plan.atr, type: r.sym.indexOf('/') >= 0 ? 'crypto' : 'stock' });
        else saveRow(r); }; });
    });
  }
  async function saveRow(r) {
    var p = r.plan; if (!p.qty) return toast('הכמות 0. הגדר סיכון $ וגודל תיק בהגדרות');
    var tk = r.sym.replace('/USD', ''), dir = r.dir;
    var tr = { id: 't' + Date.now(), mode: MODE, ticker: tk, dir: dir, status: 'planned', created: Date.now(), horizon: 'swing',
      plan: { entry: p.entry, stop: p.stop, tp: [p.t1, p.t2], condition: 'סריקת מניות: ' + DEC[r.step][1] + ' (' + r.comp + '/100)', reasons: r.why.slice(0, 4), pattern: 'ציון משולב ' + r.comp, bias: r.dir, invalidation: (dir === 'long' ? 'סגירה מתחת ל-' : 'סגירה מעל ') + px(p.stop), analysts: r.rec ? Math.round(r.rec.share * 100) + '% ממליצים קנייה' : null, news_context: null },
      sizing: { entry: p.entry, stop: p.stop, qty: p.qty, risk: Math.round(p.riskUsd), riskPct: S.acct > 0 ? p.riskUsd / S.acct * 100 : 0, pos: Math.round(p.qty * p.entry) }, imgs: { chart: null }, qty: p.qty, entryPrice: null,
      log: [{ t: Date.now(), type: 'סריקת מניות', note: r.sym + ' ' + (dir === 'long' ? 'לונג' : 'שורט') + ' · ' + r.comp + '/100\n' + r.why.join('\n') }] };
    D.trades.push(tr);
    var pl = D.plans.find(function (x) { return x.ticker === tk; });
    if (!pl) { pl = { id: tk.toLowerCase() + Date.now(), ticker: tk, cls: '', checks: [['סטופ מוגדר לפני כניסה', true], ['גודל פוזיציה חושב לפי סיכון', true]] }; D.plans.push(pl); }
    Object.assign(pl, { status: (dir === 'long' ? 'לונג' : 'שורט') + ' – מתוכנן', qty: p.qty, entry: p.entry, stop: p.stop, tp1: p.t1, tp2: p.t2, tp3: 0, rules: decText(r) + '\nביטול: ' + tr.plan.invalidation });
    await save(); renderPlans(); renderTrades(); toast('נשמר ביומן כעסקה מתוכננת');
  }

  /* ---------- דף הבית: סריקת היום ---------- */
  function renderHome() {
    var host = $q('#homeScan'); if (!host) return;
    var R = ST.report, today = R && new Date(R.at).toDateString() === new Date().toDateString(), ph = AT.session.phase(Date.now());
    var pre = ph.key === 'pre' ? '<div class="dp-flag" style="margin-bottom:8px">טרום מסחר פעיל (' + ph.left + ' דקות עד הפתיחה). זה הזמן לסרוק, לבדוק גאפים והמלצות אנליסטים ולתכנן את היום.</div>' : '';
    if (!R || !R.rows.length) { host.innerHTML = pre + '<div class="empty">עוד לא נסרק. <button class="btn small" id="hsGo">🔎 סרוק את השוק</button></div>'; }
    else {
      var pick = function (dir) { return R.rows.filter(function (r) { return r.dir === dir; }).slice(0, 3).map(function (r) { return '<div class="hs-r ' + dir + '" data-s="' + esc(r.sym) + '"><b>' + esc(r.sym) + '</b><span>' + DEC[r.step][1] + '</span><em>' + r.comp + '</em></div>'; }).join('') || '<div class="hs-n">אין</div>'; };
      host.innerHTML = pre + '<div class="hs-g"><div><h4 class="up">לונג</h4>' + pick('long') + '</div><div><h4 class="down">שורט</h4>' + pick('short') + '</div></div><div class="dp-foot" style="text-align:right">' + (today ? 'סריקה של היום, ' : 'סריקה ישנה מ-') + new Date(R.at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' <button class="btn ghost small" id="hsOpen">פתח דוח מלא</button> <button class="btn small" id="hsGo">🔎 סרוק שוב</button></div>';
      host.querySelectorAll('.hs-r').forEach(function (el) { el.onclick = function () { goPage('p-smart'); onEnter('p-smart'); var c = $q('.sm-r[data-s="' + el.dataset.s + '"]'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); }; });
    }
    var o = $q('#hsOpen'); if (o) o.onclick = function () { goPage('p-smart'); onEnter('p-smart'); };
    var g = $q('#hsGo'); if (g) g.onclick = function () { goPage('p-smart'); onEnter('p-smart'); run({ mode: 'fast' }); };
  }

  function build() {
    if ($q('#p-smart')) return;
    var sec = document.createElement('section'); sec.className = 'page'; sec.id = 'p-smart';
    sec.innerHTML = '<div class="dp-card"><h3>סריקת מניות <small>שוק · אנליסטים · יסוד · טכני · נרות</small></h3>' +
      '<button class="btn sc-big" id="scGo">🔎 סרוק את השוק</button>' +
      '<div class="dp-seg" id="scMode" style="margin-top:10px"><button data-m="fast">מהיר (~70)</button><button data-m="wide">רחב (~150)</button><button data-m="mine">הרשימות שלי</button><button data-m="custom">הדבק</button></div>' +
      '<div id="scCustomW" style="display:none"><textarea id="scTxt" class="sm-txt" rows="3" dir="ltr" placeholder="NVDA MU AMD   או   NASDAQ:NVDA NYSE:BA"></textarea></div>' +
      '<div class="dp-prog" id="scBar" style="display:none"><i></i></div><div class="sc-st"><span id="scStage"></span><span id="scMsg" class="dp-msg"></span></div>' +
      '<details class="ht-set"><summary>🔧 בדיקת חיבורים (אם הנתונים לא נמשכים)</summary><div style="margin-top:10px"><button class="btn ghost" id="scDiagGo">בדוק את המפתחות עכשיו</button><div id="scDiag" style="margin-top:10px"></div></div></details></div><div id="scOut"></div>';
    document.querySelector('main').appendChild(sec);
    document.querySelectorAll('#scMode button').forEach(function (b) { b.onclick = function () { ST.mode = b.dataset.m; paint(); }; });
    $q('#scGo').onclick = function () { if (ST.busy) { ST.stop = true; return; } if (ST.mode === 'custom') { var c = parseSyms($q('#scTxt').value); if (!c.length) return toast('הדבק לפחות סימול אחד'); run({ custom: c }); } else run({ mode: ST.mode }); };
    $q('#scDiagGo').onclick = diagnose;
  }
  build();
  GROUPS.scan = GROUPS.scan.filter(function (x) { return x[0] !== 'p-smart'; }); GROUPS.scan.splice(0, 0, ['p-smart', 'סריקת מניות']); PAGE_GROUP['p-smart'] = 'scan';
  var _e = onEnter; onEnter = function (id) { _e(id); if (id === 'p-smart') paint(); if (id === 'p-morning') renderHome(); };
  /* כרטיס בדף הבית */
  var big = document.getElementById('bigCards');
  if (big && !document.getElementById('homeScan')) big.insertAdjacentHTML('afterend', '<h2 id="hsH">🔎 סריקת היום <small>הזדמנויות לכניסה</small></h2><div class="card" id="homeScan"></div>');
  var wait = setInterval(function () { if (typeof D !== 'undefined' && D) { clearInterval(wait); renderHome(); } }, 400);
  window.runScan = function (custom) { goPage('p-smart'); onEnter('p-smart'); var c = custom || []; if (c.length) { $q('#scTxt').value = c.join(' '); ST.mode = 'custom'; paint(); run({ custom: c }); } };
  window.__scan = { parseSyms: parseSyms, s1row: s1row, shortlist: shortlist, composite: composite, technical: technical, ttShort: ttShort, run: run, state: ST, diagnose: diagnose, FAST: FAST, WIDE: WIDE };
})();
