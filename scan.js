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
  var SECTORS = [
    { k: 'semi', n: 'שבבים ו-AI', s: 'NVDA AMD AVGO MU TSM ARM SMCI MRVL ANET' },
    { k: 'sw', n: 'תוכנה וענן', s: 'MSFT CRM ORCL PLTR SNOW CRWD PANW NET DDOG NOW' },
    { k: 'mega', n: 'מגה-טק ואינטרנט', s: 'AAPL GOOGL AMZN META NFLX UBER SHOP ADBE' },
    { k: 'fin', n: 'פיננסים וקריפטו', s: 'JPM BAC GS MS V MA COIN MSTR HOOD SOFI' },
    { k: 'health', n: 'בריאות ופארמה', s: 'LLY UNH PFE MRNA ABBV NVO AMGN REGN VRTX' },
    { k: 'energy', n: 'אנרגיה', s: 'XOM CVX OXY SLB COP EOG MPC HAL' },
    { k: 'cons', n: 'צריכה וקמעונאות', s: 'WMT COST HD NKE MCD SBUX LULU TGT' },
    { k: 'ind', n: 'תעשייה וביטחוני', s: 'BA CAT LMT RTX GE DE UPS FDX' },
    { k: 'auto', n: 'רכב ואנרגיה ירוקה', s: 'TSLA RIVN LCID GM F ENPH FSLR' }].map(function (x) { return { k: x.k, n: x.n, syms: x.s.split(' ') }; });
  var ST = { mode: 'quick', spec: true, busy: false, stop: false, stage: 0, done: 0, total: 0, msg: '', report: null };
  try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv && sv.rows && sv.sectors) ST.report = sv; } catch (e) { }
  var persist = function () { try { var r = ST.report; localStorage.setItem(KEY, JSON.stringify({ at: r.at, mode: r.mode, regime: r.regime, rows: r.rows, sectors: r.sectors, universe: r.universe, failed: r.failed, spec: r.spec })); } catch (e) { } };

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
  function setMsg(t) { ST.msg = t; var n = $q('#scMsg'); if (n) n.textContent = t; var b = $q('#scBar i'); if (b && ST.total) b.style.width = Math.min(100, Math.round(ST.done / ST.total * 100)) + '%'; var s = $q('#scStage'); if (s) s.textContent = ''; }
  async function pool(items, n, fn) { var i = 0, res = new Array(items.length); await Promise.all(Array.from({ length: n }, async function () { while (i < items.length && !ST.stop) { var k = i++; res[k] = await fn(items[k], k); } })); return res; }

  /* ---------- שלב 1: סריקה מהירה (Finnhub) ---------- */
  function s1row(sym, q, mm) {
    if (q && !(q.c > 0)) return { sym: sym, err: 'אין מחיר' };
    var m = (mm && mm.metric) || {}, price = q ? q.c : null, g = function (k) { var v = m[k]; return v != null && isFinite(v) ? v : null; };
    var gap = q && q.pc > 0 && q.o > 0 ? (q.o / q.pc - 1) * 100 : null, hi = g('52WeekHigh'), lo = g('52WeekLow');
    var dHi = hi && price ? (price / hi - 1) * 100 : null, dLo = lo && price ? (price / lo - 1) * 100 : null;
    var rs13 = g('priceRelativeToS&P50013Week'), rs26 = g('priceRelativeToS&P50026Week'), r13 = g('13WeekPriceReturnDaily'), r26 = g('26WeekPriceReturnDaily');
    var fs = DP.fundScore({ metric: m, rec: null }, price), L = 0, S_ = 0;
    if (dHi != null) { if (dHi >= -8) L += 2; else if (dHi >= -20) L += 1; if (dHi <= -40) S_ += 2; else if (dHi <= -25) S_ += 1; }
    if (dLo != null) { if (dLo <= 15) S_ += 2; if (dLo >= 60) L += 1; }
    if (rs13 != null) { L += rs13 > 5 ? 2 : rs13 > 0 ? 1 : 0; S_ += rs13 < -5 ? 2 : rs13 < 0 ? 1 : 0; }
    if (rs26 != null) { L += rs26 > 0 ? 1 : 0; S_ += rs26 < 0 ? 1 : 0; }
    if (r13 != null) { L += r13 > 15 ? 1 : 0; S_ += r13 < -15 ? 1 : 0; }
    if (gap != null) { L += gap > 2 ? 1 : 0; S_ += gap < -2 ? 1 : 0; }
    if (fs && fs.score != null) { L += fs.score >= 65 ? 1 : 0; S_ += fs.score <= 35 ? 1 : 0; }
    /* מדד עניין: מה קורה עכשיו (תנועה היום, גאפ, קרבה לשיא או שפל שנתי, חוזק מול השוק) */
    var hot = [], move = q ? Math.min(30, Math.abs(q.dp || 0) * 6) : 0, gp = gap != null ? Math.min(15, Math.abs(gap) * 3) : 0, lvl = 0;
    if (q && Math.abs(q.dp || 0) >= 2) hot.push((q.dp > 0 ? 'עולה ' : 'יורדת ') + num(Math.abs(q.dp), 1) + '% היום');
    if (gap != null && Math.abs(gap) >= 2) hot.push('גאפ ' + (gap > 0 ? '+' : '') + num(gap, 1) + '%');
    if (dHi != null) { lvl = dHi >= -2 ? 15 : dHi >= -5 ? 10 : dHi >= -10 ? 5 : 0; if (dHi >= -5) hot.push('ליד שיא שנתי'); }
    if (dLo != null) { var l2 = dLo <= 3 ? 15 : dLo <= 8 ? 10 : dLo <= 15 ? 5 : 0; if (l2 > lvl) lvl = l2; if (dLo <= 8) hot.push('ליד שפל שנתי'); }
    var rsI = rs13 != null ? Math.min(15, Math.abs(rs13)) : 0; if (rs13 != null && Math.abs(rs13) >= 8) hot.push(rs13 > 0 ? 'חזקה מהשוק' : 'חלשה מהשוק');
    var fsI = fs && fs.score != null && (fs.score >= 75 || fs.score <= 25) ? 5 : 0, r13I = r13 != null ? Math.min(10, Math.abs(r13) / 3) : 0;
    var interest = Math.round(move + gp + lvl + rsI + fsI + r13I);
    return { sym: sym, interest: interest, hot: hot, price: price, chg: q ? q.dp : null, gap: gap, dHi: dHi, dLo: dLo, rs13: rs13, rs26: rs26, r13: r13, fs: fs ? fs.score : null, fsNotes: fs ? fs.notes : [], L: L, S: S_, metric: m };
  }
  async function stage1(groups) {
    ST.stage = 1; ST.done = 0; var all = []; groups.forEach(function (g) { g.syms.forEach(function (sym) { all.push({ sym: sym, g: g }); }); }); ST.total = all.length; var bad = [];
    await pool(all, 5, async function (it) {
      try { var q = await fh('/quote?symbol=' + encodeURIComponent(it.sym)), r = s1row(it.sym, q, null); if (r.err) bad.push({ sym: it.sym, err: r.err }); else { r.sector = it.g.n; it.g.rows = (it.g.rows || []); it.g.rows.push(r); } }
      catch (e) { bad.push({ sym: it.sym, err: e.message }); if (/401|403/.test(e.message)) ST.stop = true; }
      ST.done++; setMsg('בודק מה זז עכשיו (שלב 1 מתוך 3): ' + ST.done + ' מתוך ' + all.length);
    });
    return bad;
  }
  /* מכל סקטור בוחרים את n המעניינות ביותר ברגע הסריקה, לפי מדד העניין (כל סריקה יכולה להחזיר רשימה אחרת) */
  function pickPerSector(groups, n) {
    var out = [];
    groups.forEach(function (g) {
      var rows = (g.rows && g.rows.length ? g.rows : g.syms.map(function (s) { return { sym: s, sector: g.n, L: 0, S: 0 }; })).slice();
      rows.sort(function (a, b) { return (b.interest || 0) - (a.interest || 0) || Math.max(b.L, b.S) - Math.max(a.L, a.S); });
      rows.slice(0, n).forEach(function (r) { r.sector = g.n; r.gk = g.k; r.side1 = r.L >= r.S ? 'long' : 'short'; out.push(r); });
    });
    return out;
  }

  var BK = 'adir-bars', BTTL = 6 * 3600e3, bcache = {}; try { bcache = JSON.parse(localStorage.getItem(BK) || '{}'); } catch (e) { }
  function barsGet(sym) { var h = bcache[sym]; return h && Date.now() - h.t < BTTL ? h.b : null; }
  function barsPut(sym, b) { bcache[sym] = { t: Date.now(), b: b.slice(-260) }; try { var k = Object.keys(bcache); if (k.length > 70) k.sort(function (a, c) { return bcache[a].t - bcache[c].t; }).slice(0, k.length - 70).forEach(function (x) { delete bcache[x]; }); localStorage.setItem(BK, JSON.stringify(bcache)); } catch (e) { try { localStorage.removeItem(BK); } catch (e2) { } } }
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
    var gp = 0; if (r.gap != null) { var ag = r.gap * sg; gp = ag >= 2 ? 2 : ag <= -2 ? -2 : 0; if (gp) add('גאפ', gp, (r.gap >= 0 ? '+' : '') + r.gap.toFixed(1) + '% בפתיחה'); }
    var er = 0; if (r.earnDays != null && r.earnDays >= 0 && r.earnDays <= 7) { er = -5; risks.push('דוחות בעוד ' + r.earnDays + ' ימים: פער מחיר אפשרי'); } if (er) add('דוחות', er, 'בעוד ' + r.earnDays + ' ימים');
    var total = Math.max(0, Math.min(100, Math.round(tech + tt + f + an + cn + rs + rg + er + gp)));
    br.forEach(function (b) { if (b.v >= 3) why.push(b.k + ': ' + b.label); else if (b.v <= -3) risks.push(b.k + ': ' + b.label + ' (נגד הכיוון)'); });
    var step = total >= 65 && Math.abs(r.score) >= 30 ? 2 : total >= 45 ? 1 : 0;
    r.comp = total; r.br = br; r.why = why; r.risks = risks; r.step = step; return r;
  }
  function mkPlan(entry, atr, dir) { var risk = atr * 1.5, long = dir === 'long', qty = risk > 0 && S.risk > 0 ? Math.floor(S.risk / risk) : 0, ml = +S.maxLev > 0 ? +S.maxLev : 1; if (S.acct > 0 && entry > 0) qty = Math.min(qty, Math.floor(S.acct * ml / entry)); return { entry: entry, stop: long ? entry - risk : entry + risk, t1: long ? entry + 2 * risk : entry - 2 * risk, t2: long ? entry + 3 * risk : entry - 3 * risk, qty: qty, riskUsd: qty * risk, atr: atr }; }
  async function fhEnrich(r) {
    if (!S.fh || r.sym.indexOf('/') >= 0) return;
    if (!r.metric || !Object.keys(r.metric).length) { try { var mm = await fh('/stock/metric?symbol=' + encodeURIComponent(r.sym) + '&metric=all'); if (mm && mm.metric) { r.metric = mm.metric; var f1 = DP.fundScore({ metric: mm.metric, rec: null }, r.price || null); if (f1) { r.fs = f1.score; r.fsNotes = f1.notes; } } } catch (e) { } }
    try { var q = await fh('/quote?symbol=' + encodeURIComponent(r.sym)); if (q && q.c > 0) { r.q = q.c; r.chg = q.dp; r.gap = q.pc > 0 && q.o > 0 ? (q.o / q.pc - 1) * 100 : null; } } catch (e) { }
    try { var rec = await fh('/stock/recommendation?symbol=' + encodeURIComponent(r.sym)); if (Array.isArray(rec) && rec.length) { var calc = function (x) { var t = (x.strongBuy || 0) + (x.buy || 0) + (x.hold || 0) + (x.sell || 0) + (x.strongSell || 0); return t ? { share: ((x.strongBuy || 0) + (x.buy || 0)) / t, tot: t } : null; }, a = calc(rec[0]), b = rec[1] ? calc(rec[1]) : null; if (a) r.rec = { share: a.share, tot: a.tot, d: b ? (a.share - b.share) * 100 : null, period: rec[0].period }; } } catch (e) { }
    try { var er = await DP.getClient().earnings(r.sym); if (er && er.date) r.earnDays = Math.round((Date.parse(er.date) - Date.now()) / 864e5); } catch (e) { }
  }
  /* ניתוח טכני (Twelve Data, אחד אחרי השני) ואנליסטים/מחיר/דוחות (Finnhub, במקביל) */
  async function deepAll(list, spy, regime, failed) {
    ST.stage = 2; var td = 0, fhd = 0, n = list.length; ST.total = n; ST.done = 0; var okRows = [];
    var upd = function () { ST.done = td; setMsg('ניתוח טכני ' + td + '/' + n + ' · אנליסטים ומחירים ' + fhd + '/' + n); };
    var c = DP.getClient();
    var techLoop = (async function () {
      for (var i = 0; i < n && !ST.stop; i++) {
        var d = list[i];
        try { var bars = d.sym === 'SPY' && spy ? spy : (barsGet(d.sym) || await c.series(d.sym, '1day', 300)); if (!barsGet(d.sym) && d.sym !== 'SPY') barsPut(d.sym, bars); var t = technical(d.sym, bars, spy); if (t.err) failed.push({ sym: d.sym, err: t.err }); else { Object.assign(d, t); d.zones = { poc: t.a.poc, vah: t.a.vah, val: t.a.val }; delete d.a; okRows.push(d); } }
        catch (e) { failed.push({ sym: d.sym, err: e.message }); }
        td++; ST.live = okRows.map(function (x) { return x.sym + ' ' + (x.dir === 'long' ? 'לונג' : 'שורט'); }); upd(); paintLive();
      }
    })();
    var fhLoop = pool(list, 4, async function (r) { await fhEnrich(r); fhd++; upd(); });
    await Promise.all([techLoop, fhLoop]);
    okRows.forEach(function (r) { if (r.q) { r.price = r.q; r.plan = mkPlan(r.q, r.plan.atr, r.dir); } else r.price = r.plan.entry; delete r.metric; composite(r, regime); });
    return okRows;
  }

  /* ---------- מניות ספקולטיביות עד $5 עם קטליזטור ---------- */
  var CAT = { fda: 'החלטת FDA', trial: 'ניסוי קליני', earnings: 'דוח רבעוני', contract: 'חוזה / עסקה', news: 'חדשות', other: 'אחר' };
  var SPEC_SYS = 'אתה חוקר שוק הון עבור סוחר ישראלי. חפש ברשת מניות אמריקאיות לא מוכרות (שווי שוק קטן, עד 2 מיליארד דולר) שנסחרות מתחת ל-5 דולר, ויש להן קטליזטור קרוב שיכול להזיז אותן בחדות: החלטת FDA (תאריך PDUFA), פרסום תוצאות ניסוי קליני, דוח רבעוני, חוזה, עסקה או חדשות מהותיות. ' +
    'מקורות מועדפים: biopharmcatalyst.com, investing.com, marketbeat.com, fda.gov, הודעות החברות. חוק ברזל: כלול רק מה שמצאת בפועל, עם קישור למקור. אסור להמציא טיקר, תאריך או אירוע. אם לא מצאת, החזר רשימה ריקה. ' +
    'החזר JSON בלבד: {"items":[{"ticker":"ABCD","catalyst_type":"fda|trial|earnings|contract|news|other","catalyst":"תיאור קצר בעברית","date":"YYYY-MM-DD או ריק","why":"למה עלולה לזנק, משפט בעברית","risk":"הסיכון המרכזי, משפט בעברית","source":"שם האתר","url":"קישור"}]}. עד 14 פריטים, מהקרוב לרחוק.';
  async function spec() {
    if (!aiKey()) return { err: 'לחיפוש מניות ספקולטיביות צריך מפתח בינה (Anthropic או Gemini) בהגדרות' };
    if (!S.fh) return { err: 'לאימות מחירים צריך מפתח Finnhub' };
    try {
      var raw = await claude([{ role: 'user', content: 'היום: ' + new Date().toISOString().slice(0, 10) + '. מצא מניות כאלה לחודש הקרוב.' }], { system: SPEC_SYS, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }], max_tokens: 3800, tier: 'smart' });
      var j = parseJSON(raw), cand = (j.items || []).filter(function (i) { return i && i.ticker && i.catalyst && i.url && /^https?:/.test(i.url); }), out = [], seen = {};
      for (var k = 0; k < cand.length && out.length < 9; k++) {
        var i = cand[k], tk = String(i.ticker).toUpperCase().replace(/[^A-Z.]/g, ''); if (!tk || seen[tk]) continue; seen[tk] = 1;
        try {
          var q = await fh('/quote?symbol=' + tk), pr = await fh('/stock/profile2?symbol=' + tk);
          if (!(q && q.c > 0) || !(pr && pr.name)) continue; /* אימות: טיקר קיים ויש לו מחיר */
          out.push({ sym: tk, name: pr.name, price: q.c, chg: q.dp, cap: pr.marketCapitalization, ind: pr.finnhubIndustry, type: CAT[i.catalyst_type] ? i.catalyst_type : 'other', catalyst: i.catalyst, date: i.date || '', why: i.why || '', risk: i.risk || '', source: i.source || 'מקור', url: i.url });
        } catch (e) { }
      }
      var low = out.filter(function (x) { return x.price <= 5; }), hi = out.filter(function (x) { return x.price > 5 && x.price <= 10; });
      var items = low.concat(hi).slice(0, 5); items.forEach(function (x) { x.over5 = x.price > 5; });
      return { items: items, found: cand.length, validated: out.length, at: Date.now() };
    } catch (e) { return { err: 'החיפוש נכשל: ' + e.message }; }
  }

  /* ---------- הרצה ---------- */
  async function run(opts) {
    if (ST.busy) { ST.stop = true; return; }
    opts = opts || {}; var mode = opts.custom ? 'custom' : (opts.mode || ST.mode);
    if (!S.td) return toast('צריך מפתח Twelve Data בהגדרות (⚙️)');
    var groups, per = mode === 'quick' ? 2 : 5, sectorMode = mode === 'sectors' || mode === 'quick';
    if (mode === 'custom') groups = [{ k: 'custom', n: 'הרשימה שלך', syms: opts.custom.slice(0, 20) }];
    else if (mode === 'mine') groups = [{ k: 'mine', n: 'הרשימות שלי', syms: mine().slice(0, 30) }];
    else groups = SECTORS.map(function (g) { return { k: g.k, n: g.n, syms: (mode === 'quick' ? g.syms.slice(0, 6) : g.syms.slice()) }; });
    if (!groups[0].syms.length) return toast('אין מניות לסרוק');
    if (sectorMode && !S.fh) toast('בלי מפתח Finnhub הסריקה לוקחת את המניות הראשונות בכל סקטור, בלי דירוג מקדים');
    ST.busy = true; ST.stop = false; ST.mode = mode; paint();
    var c = DP.getClient(), report = { at: Date.now(), mode: mode, universe: groups.reduce(function (a, g) { return a + g.syms.length; }, 0), regime: null, rows: [], sectors: [], failed: [], spec: null };
    var specP = sectorMode && ST.spec ? spec() : Promise.resolve(null);
    try {
      var list;
      if (sectorMode && S.fh) { report.failed = await stage1(groups); if (!groups.some(function (g) { return g.rows && g.rows.length; })) throw new Error('לא התקבלו נתונים מ-Finnhub. הרץ "בדיקת חיבורים" כדי לראות למה.'); }
      list = sectorMode ? pickPerSector(groups, per) : groups[0].syms.map(function (sym) { return { sym: sym, sector: groups[0].n, gk: groups[0].k }; });
      ST.stage = 2; setMsg('בודק את מצב השוק (SPY)…'); var spy = null; try { spy = barsGet('SPY') || await c.series('SPY', '1day', 300); if (spy && !barsGet('SPY')) barsPut('SPY', spy); } catch (e) { }
      report.regime = DP.regimeOf(spy);
      var rows = await deepAll(list, spy, report.regime, report.failed);
      rows.sort(function (a, b) { return b.step - a.step || b.comp - a.comp; });
      report.rows = rows;
      report.sectors = groups.map(function (g) { return { k: g.k, n: g.n, rows: rows.filter(function (r) { return r.gk === g.k; }) }; }).filter(function (g) { return g.rows.length; });
      ST.report = report; persist();
      setMsg(ST.stop ? 'הסריקה נעצרה' : 'מחפש מניות ספקולטיביות…'); paint(); renderHome();
      report.spec = await specP; ST.report = report; persist(); setMsg(ST.stop ? 'הסריקה נעצרה' : '');
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
  var DEC = { 2: ['entry', 'כניסה'], 1: ['prep', 'כמעט'], 0: ['watch', 'מעקב'] };
  function decText(r) {
    var side = r.dir === 'long' ? 'לונג' : 'שורט';
    return r.step === 2 ? side + ': כל הסימנים מצביעים לאותו כיוון. אפשר לתכנן כניסה.' : r.step === 1 ? side + ': יש כיוון אבל חסר אישור. מחכים לריטסט או לנר אישור.' : side + ' חלש. בלי יתרון ברור, ואם נכנסים אז בגודל קטן.';
  }
  function bar(v) { var p = Math.round(Math.min(100, Math.abs(v)) / 2); return '<div class="dp-bar"><i class="' + (v >= 0 ? 'pos' : 'neg') + '" style="' + (v >= 0 ? 'right:50%;' : 'left:50%;') + 'width:' + p + '%"></i></div>'; }
  function cardHtml(r) {
    var d = DEC[r.step], side = r.dir, p = r.plan, pos = r.br.filter(function (b) { return b.v >= 3; }).length;
    var chips = r.br.map(function (b) { return '<span class="sc-ch ' + (b.v >= 3 ? 'pos' : b.v <= -3 ? 'neg' : '') + '" title="' + esc(b.label) + '">' + b.k + ' ' + (b.v >= 0 ? '+' : '') + Math.round(b.v) + '</span>'; }).join('');
    return '<div class="sm-r ' + side + ' s' + r.step + '" data-s="' + esc(r.sym) + '"><div class="sm-h"><b class="tk">' + esc(r.sym) + '</b><span class="sm-px">$' + px(r.price) + (r.chg != null ? ' <em class="' + (r.chg >= 0 ? 'up' : 'down') + '">' + (r.chg >= 0 ? '+' : '') + num(r.chg, 1) + '%</em>' : '') + '</span><span class="sm-v ' + side + '">' + (side === 'long' ? 'לונג' : 'שורט') + ' · ' + r.comp + '/100</span></div>' +
      '<div class="sc-comp"><div class="sc-meter"><i style="width:' + r.comp + '%"></i></div></div>' + (r.hot && r.hot.length ? '<div class="sc-hot">' + r.hot.slice(0, 3).map(function (h) { return '<span>' + esc(h) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="sm-d ' + d[0] + '"><i></i><b>' + d[1] + '</b><span>' + esc(decText(r)) + '</span></div><div class="sc-chips">' + chips + '</div>' +
      (r.why.length ? '<ul class="dp-list pos sc-l">' + r.why.slice(0, 4).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
      (r.risks.length ? '<ul class="dp-list neg sc-l">' + r.risks.slice(0, 3).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="sm-pl"><span>כניסה <b>$' + px(p.entry) + '</b></span><span>סטופ <b class="down">$' + px(p.stop) + '</b></span><span>יעד 1 <b class="up">$' + px(p.t1) + '</b></span><span>יעד 2 <b class="up">$' + px(p.t2) + '</b></span><span>כמות <b>' + (p.qty || '–') + '</b></span></div>' +
      '<div class="sm-a"><button data-a="deep">ניתוח</button><button data-a="calc">גודל</button><button data-a="save">שמור</button></div></div>';
  }
  function specCard(x) {
    var days = x.date ? Math.round((Date.parse(x.date) - Date.now()) / 864e5) : null, cap = x.cap != null ? (x.cap >= 1000 ? '$' + num(x.cap / 1000, 1) + 'B' : '$' + num(x.cap, 0) + 'M') : '–';
    var risk$ = S.risk > 0 ? S.risk * 0.25 : 0, stop = x.price * 0.85, qty = risk$ > 0 ? Math.floor(risk$ / (x.price * 0.15)) : 0;
    return '<div class="sm-r long sp" data-s="' + esc(x.sym) + '"><div class="sm-h"><b class="tk">' + esc(x.sym) + '</b><span class="sm-px">$' + px(x.price) + (x.chg != null ? ' <em class="' + (x.chg >= 0 ? 'up' : 'down') + '">' + (x.chg >= 0 ? '+' : '') + num(x.chg, 1) + '%</em>' : '') + '</span><span class="sm-v long">' + CAT[x.type] + (days != null && days >= 0 ? ' · בעוד ' + days + ' ימים' : '') + '</span></div>' +
      '<div class="sm-kv">' + esc(x.name) + ' · שווי שוק ' + cap + (x.ind ? ' · ' + esc(x.ind) : '') + (x.over5 ? ' · <em class="warn">מעל $5</em>' : '') + '</div>' +
      '<p class="sp-c">' + esc(x.catalyst) + '</p>' + (x.why ? '<ul class="dp-list pos sc-l"><li>' + esc(x.why) + '</li></ul>' : '') + (x.risk ? '<ul class="dp-list neg sc-l"><li>' + esc(x.risk) + '</li></ul>' : '') +
      '<div class="sm-pl"><span>כניסה <b>$' + px(x.price) + '</b></span><span>סטופ (−15%) <b class="down">$' + px(stop) + '</b></span><span>גודל שמרני <b>' + (qty || '–') + '</b></span><span>סיכון <b>$' + num(qty * x.price * 0.15, 0) + '</b></span></div>' +
      '<div class="sm-a"><a class="sp-src" href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.source) + ' ↗</a><button data-a="deep">ניתוח</button><button data-a="save">שמור</button></div></div>';
  }
  function paintLive() { var el = $q('#scLive'); if (!el) return; el.innerHTML = ST.busy && ST.live && ST.live.length ? '<div class="dp-foot" style="text-align:right"><b>כבר נותחו:</b> ' + ST.live.map(esc).join(' · ') + '</div>' : ''; }
  function paint() {
    var host = $q('#scOut'); if (!host) return; paintLive();
    var go = $q('#scGo'); if (go) go.textContent = ST.busy ? 'עצור' : 'סרוק';
    var bar_ = $q('#scBar'); if (bar_) bar_.style.display = ST.busy ? '' : 'none';
    document.querySelectorAll('#scMode button').forEach(function (b) { b.classList.toggle('on', b.dataset.m === ST.mode); });
    var cu = $q('#scCustomW'); if (cu) cu.style.display = ST.mode === 'custom' ? '' : 'none';
    var sp = $q('#scSpecW'); if (sp) sp.style.display = ST.mode === 'sectors' || ST.mode === 'quick' ? '' : 'none';
    var R = ST.report;
    if (!R) { host.innerHTML = ST.busy ? '<div class="dp-skel"><i style="height:150px"></i><i style="height:150px"></i></div>' : '<div class="dp-card"><div class="dp-empty">לחץ "סרוק" וקבל את המניות הכי מעניינות ברגע זה, בכל סקטור. הסריקה לוקחת כמה דקות.</div></div>'; return; }
    var rows = R.rows, L = rows.filter(function (r) { return r.dir === 'long'; }).length, Sh = rows.length - L, top = rows.filter(function (r) { return r.step === 2; }).length;
    var rg = R.regime ? '<div class="dp-regime ' + R.regime.state + '"><i></i><b>' + R.regime.label + '</b><span>SPY ' + (R.regime.dist >= 0 ? '+' : '') + R.regime.dist.toFixed(1) + '% מממוצע 200</span></div>' : '';
    var ph = AT.session.phase(Date.now()), when = '<div class="dp-foot" style="text-align:right">נסרק ב-' + new Date(R.at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' · כעת: ' + esc(ph.label) + '</div>';
    var sum = '<div class="sm-sum"><div><b>' + top + '</b><span>כניסה</span></div><div><b class="up">' + L + '</b><span>לונג</span></div><div><b class="down">' + Sh + '</b><span>שורט</span></div><div><b>' + rows.length + '</b><span>נותחו</span></div></div>';
    var jump = '<div class="tabs" id="scJump" style="margin:6px 0 4px">' + (R.sectors || []).map(function (g) { return '<button data-j="sec-' + g.k + '">' + esc(g.n) + '</button>'; }).join('') + (R.spec ? '<button data-j="sec-spec">עד $5</button>' : '') + '</div>';
    var secs = (R.sectors || []).map(function (g) { return '<h2 id="sec-' + g.k + '">' + esc(g.n) + '</h2>' + g.rows.slice().sort(function (a, b) { return b.step - a.step || b.comp - a.comp; }).map(cardHtml).join(''); }).join('');
    var spc = '';
    if (R.spec) {
      if (R.spec.err) spc = '<h2 id="sec-spec">מניות עד $5</h2><div class="dp-card"><div class="dp-empty">' + esc(R.spec.err) + '</div></div>';
      else spc = '<h2 id="sec-spec">מניות עד $5 <small>סיכון גבוה</small></h2><div class="dp-flag warn">מניות כאלה יכולות לאבד את רוב הערך בחדשה שלילית. הקצה רק סכום שאתה מוכן להפסיד. הגודל המוצע הוא רבע מהסיכון הרגיל שלך, והסטופ (15%) הוא מסגרת סיכון ולא תחזית.</div>' + (R.spec.items.length ? R.spec.items.map(specCard).join('') : '<div class="dp-card"><div class="dp-empty">לא נמצאו כרגע מניות עם קטליזטור מתועד ועם מחיר עד $10.</div></div>');
    } else if (ST.busy && ST.spec && (ST.mode === 'sectors' || ST.mode === 'quick')) spc = '<h2 id="sec-spec">מניות עד $5</h2><div class="dp-card"><div class="dp-empty"><span class="spin"></span> מחפש…</div></div>';
    var bad = (R.failed || []).length ? '<details class="ht-set"><summary>לא נסרקו (' + R.failed.length + ')</summary>' + R.failed.slice(0, 30).map(function (x) { return '<div class="dp-foot" style="text-align:right">' + esc(x.sym) + ': ' + esc(x.err) + '</div>'; }).join('') + '</details>' : '';
    host.innerHTML = rg + when + sum + (R.rows.length ? jump + secs : '<div class="dp-card"><div class="dp-empty">לא נמצאו מניות לניתוח מלא.</div></div>') + spc + bad +
      '<details class="ht-set"><summary>איך מחושב הציון</summary><div class="dp-foot" style="text-align:right">הציון הוא סכום של: טכני (עד 40), מגמה (15), יסוד (10), אנליסטים (10), נרות (8), חוזק מול השוק (5), מצב השוק, גאפ ודוחות. המניות נבחרות לפי מה שזז עכשיו. זה לא ייעוץ השקעות, והציון אינו הבטחה. נתונים חינמיים עשויים להיות מושהים.</div></details>';
    host.querySelectorAll('#scJump button').forEach(function (b) { b.onclick = function () { var t = document.getElementById(b.dataset.j); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
    host.querySelectorAll('.sm-r:not(.sp)').forEach(function (el) {
      var r = R.rows.find(function (x) { return x.sym === el.dataset.s; });
      el.querySelectorAll('button').forEach(function (b) { b.onclick = function () {
        if (b.dataset.a === 'deep') openDeep(r.sym);
        else if (b.dataset.a === 'calc') openCalc({ sym: r.sym.replace('/USD', ''), entry: r.plan.entry, stop: r.plan.stop, atr: r.plan.atr, type: r.sym.indexOf('/') >= 0 ? 'crypto' : 'stock' });
        else saveRow(r); }; });
    });
    host.querySelectorAll('.sm-r.sp').forEach(function (el) {
      var x = ((R.spec && R.spec.items) || []).find(function (y) { return y.sym === el.dataset.s; });
      el.querySelectorAll('button').forEach(function (b) { b.onclick = function () { if (b.dataset.a === 'deep') openDeep(x.sym); else saveSpec(x); }; });
    });
  }
  async function saveSpec(x) {
    var risk$ = S.risk > 0 ? S.risk * 0.25 : 0, stop = x.price * 0.85, qty = risk$ > 0 ? Math.floor(risk$ / (x.price * 0.15)) : 0; if (!qty) return toast('הכמות 0. הגדר סיכון $ בהגדרות');
    var tr = { id: 't' + Date.now(), mode: MODE, ticker: x.sym, dir: 'long', status: 'planned', created: Date.now(), horizon: 'swing',
      plan: { entry: x.price, stop: stop, tp: [x.price * 1.3, x.price * 1.45], condition: 'ספקולטיבית: ' + CAT[x.type] + (x.date ? ' ב-' + x.date : ''), reasons: [x.catalyst, x.why].filter(Boolean), pattern: 'קטליזטור', bias: 'long', invalidation: 'סגירה מתחת ל-' + px(stop), analysts: null, news_context: x.url },
      sizing: { entry: x.price, stop: stop, qty: qty, risk: Math.round(qty * x.price * 0.15), riskPct: S.acct > 0 ? qty * x.price * 0.15 / S.acct * 100 : 0, pos: Math.round(qty * x.price) }, imgs: { chart: null }, qty: qty, entryPrice: null,
      log: [{ t: Date.now(), type: 'ספקולטיבית', note: x.sym + ' · ' + x.catalyst + '\nמקור: ' + x.url }] };
    D.trades.push(tr);
    var pl = D.plans.find(function (p) { return p.ticker === x.sym; }); if (!pl) { pl = { id: x.sym.toLowerCase() + Date.now(), ticker: x.sym, cls: '', checks: [['סטופ מוגדר לפני כניסה', true], ['גודל פוזיציה חושב לפי סיכון', true]] }; D.plans.push(pl); }
    Object.assign(pl, { status: 'לונג – מתוכנן (ספקולטיבית)', qty: qty, entry: x.price, stop: stop, tp1: x.price * 1.3, tp2: x.price * 1.45, tp3: 0, rules: x.catalyst + '\nסיכון: ' + x.risk });
    await save(); renderPlans(); renderTrades(); toast('נשמר ביומן כעסקה מתוכננת');
  }
  async function saveRow(r) {
    var p = r.plan; if (window.__pro && !window.__pro.gateOk()) return; if (!p.qty) return toast('הכמות 0. הגדר סיכון $ וגודל תיק בהגדרות');
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
    var pre = ph.key === 'pre' ? '<div class="dp-flag" style="margin-bottom:8px">טרום מסחר פעיל, עוד ' + ph.left + ' דקות לפתיחה. זה הזמן לסרוק ולתכנן את היום.</div>' : '';
    if (!R || !R.rows.length) { host.innerHTML = pre + '<div class="empty">עוד לא נסרק. <button class="btn small" id="hsGo">סרוק</button></div>'; }
    else {
      var pick = function (dir) { return R.rows.filter(function (r) { return r.dir === dir; }).slice(0, 3).map(function (r) { return '<div class="hs-r ' + dir + '" data-s="' + esc(r.sym) + '"><b>' + esc(r.sym) + '</b><span>' + DEC[r.step][1] + '</span><em>' + r.comp + '</em></div>'; }).join('') || '<div class="hs-n">אין</div>'; };
      var spl = R.spec && R.spec.items && R.spec.items.length ? '<div class="hs-sp"><b>עד $5:</b> ' + R.spec.items.slice(0, 5).map(function (x) { return esc(x.sym) + ' $' + px(x.price); }).join(' · ') + '</div>' : '';
      host.innerHTML = pre + '<div class="hs-g"><div><h4 class="up">לונג</h4>' + pick('long') + '</div><div><h4 class="down">שורט</h4>' + pick('short') + '</div></div>' + spl + '<div class="dp-foot" style="text-align:right">' + (today ? 'נסרק היום ב-' : 'סריקה ישנה מ-') + new Date(R.at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' <button class="btn ghost small" id="hsOpen">פתח דוח</button> <button class="btn small" id="hsGo">סרוק שוב</button></div>';
      host.querySelectorAll('.hs-r').forEach(function (el) { el.onclick = function () { goPage('p-smart'); onEnter('p-smart'); var c = $q('.sm-r[data-s="' + el.dataset.s + '"]'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); }; });
    }
    var o = $q('#hsOpen'); if (o) o.onclick = function () { goPage('p-smart'); onEnter('p-smart'); };
    var g = $q('#hsGo'); if (g) g.onclick = function () { goPage('p-smart'); onEnter('p-smart'); run({ mode: 'quick' }); };
  }

  function build() {
    if ($q('#p-smart')) return;
    var sec = document.createElement('section'); sec.className = 'page'; sec.id = 'p-smart';
    sec.innerHTML = '<div class="dp-card sc-main"><button class="btn sc-big" id="scGo">סרוק</button>' +
      '<div class="dp-prog" id="scBar" style="display:none"><i></i></div><div class="sc-st"><span id="scStage"></span><span id="scMsg" class="dp-msg"></span></div>' +
      '<details class="ht-set"><summary>אפשרויות</summary><div class="sc-opt">' +
      '<div class="dp-seg" id="scMode"><button data-m="quick">מהיר</button><button data-m="sectors">מלא</button><button data-m="mine">הרשימות שלי</button><button data-m="custom">הדבק מניות</button></div>' +
      '<div id="scCustomW" style="display:none"><textarea id="scTxt" class="sm-txt" rows="3" dir="ltr" placeholder="NVDA MU AMD   או   NASDAQ:NVDA NYSE:BA"></textarea></div>' +
      '<label id="scSpecW" class="sc-spec"><input type="checkbox" id="scSpec" checked> כולל מניות עד $5</label>' +
      '<div class="sc-diag"><button class="btn ghost small" id="scDiagGo">בדיקת חיבורים</button><div id="scDiag"></div></div></div></details></div><div id="scLive"></div><div id="scOut"></div>';
    document.querySelector('main').appendChild(sec);
    document.querySelectorAll('#scMode button').forEach(function (b) { b.onclick = function () { ST.mode = b.dataset.m; paint(); }; });
    $q('#scGo').onclick = function () { if (ST.busy) { ST.stop = true; return; } if (ST.mode === 'custom') { var c = parseSyms($q('#scTxt').value); if (!c.length) return toast('הדבק לפחות סימול אחד'); run({ custom: c }); } else run({ mode: ST.mode }); };
    $q('#scSpec').onchange = function () { ST.spec = this.checked; };
    $q('#scDiagGo').onclick = diagnose;
  }
  build();
  GROUPS.scan = GROUPS.scan.filter(function (x) { return x[0] !== 'p-smart'; }); GROUPS.scan.splice(0, 0, ['p-smart', 'סריקה']); PAGE_GROUP['p-smart'] = 'scan';
  var _e = onEnter; onEnter = function (id) { _e(id); if (id === 'p-smart') paint(); if (id === 'p-morning') renderHome(); };
  /* כרטיס בדף הבית */
  var big = document.getElementById('bigCards');
  if (big && !document.getElementById('homeScan')) big.insertAdjacentHTML('afterend', '<h2 id="hsH">הזדמנויות היום</h2><div class="card" id="homeScan"></div>');
  var wait = setInterval(function () { if (typeof D !== 'undefined' && D) { clearInterval(wait); renderHome(); } }, 400);
  window.runScan = function (custom) { goPage('p-smart'); onEnter('p-smart'); var c = custom || []; if (c.length) { $q('#scTxt').value = c.join(' '); ST.mode = 'custom'; paint(); run({ custom: c }); } };
  window.__scan = { parseSyms: parseSyms, s1row: s1row, pickPerSector: pickPerSector, composite: composite, technical: technical, ttShort: ttShort, run: run, state: ST, diagnose: diagnose, SECTORS: SECTORS, spec: spec, mkPlan: mkPlan };
})();
