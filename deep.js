/* ניתוח מלא – טיקר אחד, שלושה אופקים (יומי / סווינג / ארוך).
   משלב: טכני רב-טווחי (מנוע AlphaTerminal), נרות ופעולת מחיר, אזורי נפח / פערים / נזילות,
   פונדמנטל (Finnhub), חדשות, תוכנית עסקה עם סטופ ויעדים, גודל פוזיציה מהסיכון ושערי כניסה.
   כל מספר מגיע מחישוב בקוד. ה-AI רק מסביר אותו. */
(function () {
  'use strict';
  var E = AT.engine, SES = AT.session, DATA = AT.data;
  var FETCH_TFS = ['5m', '1h', '4h', '1D', '1W', '6M']; /* בלי דקה: חוסכת קריאה ולא משנה החלטה */
  var MODES = { day: 'יומי', swing: 'סווינג', long: 'ארוך' };
  var HOLD = { day: '30 דקות עד 4 שעות, בלי החזקה לילה', swing: 'ימים עד שבועות', long: 'חודשים' };
  var TRAIL = {
    day: 'ביעד 1 (2R) סוגרים חצי כמות ומעלים סטופ לכניסה. את השאר מובילים עם טריילינג של ATR אחד בגרף 5 דקות.',
    swing: 'ב-2R מעלים סטופ לכניסה. ב-3R סוגרים חצי ומעבירים את הסטופ מתחת למבנה האחרון. סטופ זז רק בכיוון הרווח.',
    long: 'נכנסים בשלושה שלבים. הסטופ מתחת לתמיכה השבועית. יעד ביניים לפי רמות שבועיות וחצי שנתיות.'
  };
  var COMP_NAME = { trend: 'מגמה (רצועת ממוצעים)', vwap: 'VWAP', macd: 'MACD', rsi: 'RSI וסטיות', bb: 'בולינגר', volume: 'פרופיל נפח', fvg: 'פערי מחיר', ob: 'בלוקי כסף חכם', liq: 'איסוף נזילות', pattern: 'נרות ופעולת מחיר' };
  var COMP_WHY = {
    trend: ['רצועת הממוצעים סדורה כלפי מעלה', 'רצועת הממוצעים סדורה כלפי מטה'],
    vwap: ['מעל הממוצע המשוקלל בנפח', 'מתחת לממוצע המשוקלל בנפח'],
    macd: ['מומנטום חיובי', 'מומנטום שלילי'],
    rsi: ['עוצמה יחסית חיובית', 'עוצמה יחסית חלשה'],
    bb: ['בחלק העליון של הרצועות', 'בחלק התחתון של הרצועות'],
    volume: ['מעל אזור הערך של הנפח', 'מתחת לאזור הערך של הנפח'],
    fvg: ['פער פתוח תומך קרוב', 'פער פתוח מתנגד קרוב'],
    ob: ['אזור ביקוש קרוב', 'אזור היצע קרוב'],
    liq: ['נזילות נאספה מלמטה', 'נזילות נאספה מלמעלה'],
    pattern: ['תבנית נרות שורית', 'תבנית נרות דובית']
  };
  var STANCE = { long: ['LONG', 'לונג'], short: ['SHORT', 'שורט'], lean_long: ['LEAN LONG', 'נטייה ללונג'], lean_short: ['LEAN SHORT', 'נטייה לשורט'], flat: ['WAIT', 'להמתין'], nodata: ['NO DATA', 'אין נתונים'] };
  var GATE_TXT = { 'חלון זמן מתאים': 'שעת מסחר מתאימה', 'ציון מאוחד עבר סף כניסה ללא ווטו': 'הציון מספיק חזק', 'נפח יחסי לפחות 1.2': 'נפח מסחר גבוה מהרגיל', 'המחיר עד חצי ATR מאזור מסומן': 'המחיר קרוב לרמה חשובה',
    'יחס סיכוי לסיכון לפחות 2 ליעד ראשון': 'סיכוי/סיכון של לפחות 1:2', 'אין דוח או אירוע מאקרו בשעה הקרובה': 'אין דוח או אירוע בשעה הקרובה', 'טווח היום עדיין עד 2 ATR': 'המניה לא רצה כבר יותר מדי היום',
    'לא שני סטופים ברצף': 'לא נפגעת מסטופ פעמיים ברצף', 'אין ירידה של מעל 10% אתמול בלי בסיס חדש': 'לא ירדה בחדות אתמול' };
  var gl = function (t) { return GATE_TXT[t] || t; };
  var DEEP = { sym: '', mode: 'swing', busy: false, res: null, msg: '', client: null, keyFp: '', sugg: [], q: '' };
  var $q = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var num = function (n, d) { return n == null || !isFinite(n) ? '–' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); };
  var px = function (n) { return n == null || !isFinite(n) ? '–' : (Math.abs(n) >= 1000 ? num(n, 2) : Math.abs(n) >= 10 ? num(n, 2) : num(n, 3)); };
  var cap = function (m) { /* שווי שוק במיליוני דולר */
    if (m == null || !isFinite(m)) return { txt: '–', cls: '' };
    var usd = m * 1e6, t = usd >= 1e12 ? (usd / 1e12).toFixed(2) + 'T' : usd >= 1e9 ? (usd / 1e9).toFixed(1) + 'B' : (usd / 1e6).toFixed(0) + 'M';
    var cls = m >= 200e3 ? 'Mega Cap' : m >= 10e3 ? 'Large Cap' : m >= 2e3 ? 'Mid Cap' : m >= 300 ? 'Small Cap' : 'Micro Cap';
    return { txt: '$' + t, cls: cls };
  };

  /* ---------- נתונים ---------- */
  DATA.Client.prototype.fundamentals = function (sym) {
    if (!this.fhKey) return Promise.resolve(null);
    var b = this.fhBase, t = '&token=' + encodeURIComponent(this.fhKey), lim = this.fhLimiter, self = this, s = encodeURIComponent(sym);
    var get = function (u) { return self._json(u, lim).catch(function () { return null; }); };
    return Promise.all([get(b + '/stock/profile2?symbol=' + s + t), get(b + '/stock/metric?symbol=' + s + '&metric=all' + t), get(b + '/stock/recommendation?symbol=' + s + t)])
      .then(function (r) { return { profile: r[0] || {}, metric: (r[1] && r[1].metric) || {}, rec: Array.isArray(r[2]) && r[2].length ? r[2][0] : null }; });
  };
  function client() {
    var fp = (S.td || '') + '|' + (S.fh || '');
    if (!DEEP.client || DEEP.keyFp !== fp) { DEEP.client = new DATA.Client({ twelveKey: S.td, finnhubKey: S.fh }); DEEP.keyFp = fp; }
    return DEEP.client;
  }
  var hasData = function () { return !!(S.td || S.fh); };

  /* ---------- פונדמנטל: ציון שקוף ---------- */
  function fundScore(f, price) {
    if (!f) return null;
    var m = f.metric || {}, notes = [], pts = 0, max = 0;
    var pick = function () { for (var i = 0; i < arguments.length; i++) { var v = m[arguments[i]]; if (v != null && isFinite(v)) return v; } return null; };
    var add = function (cond, w, yes, no) { max += w; if (cond === true) { pts += w; notes.push({ ok: true, t: yes }); } else if (cond === false) notes.push({ ok: false, t: no }); else max -= w; };
    var rg = pick('revenueGrowthTTMYoy', 'revenueGrowth3Y'), eg = pick('epsGrowthTTMYoy', 'epsGrowth3Y'), nm = pick('netProfitMarginTTM', 'netProfitMarginAnnual');
    var pe = pick('peTTM', 'peBasicExclExtraTTM', 'peNormalizedAnnual'), de = pick('totalDebt/totalEquityQuarterly', 'totalDebt/totalEquityAnnual');
    var hi = pick('52WeekHigh'), lo = pick('52WeekLow');
    add(rg == null ? null : rg > 10, 20, 'צמיחת הכנסות ' + num(rg, 1) + '%', 'צמיחת הכנסות חלשה (' + num(rg, 1) + '%)');
    add(eg == null ? null : eg > 10, 20, 'צמיחת רווח למניה ' + num(eg, 1) + '%', 'צמיחת רווח למניה חלשה (' + num(eg, 1) + '%)');
    add(nm == null ? null : nm > 10, 15, 'שולי רווח נקי ' + num(nm, 1) + '%', 'שולי רווח נקי נמוכים (' + num(nm, 1) + '%)');
    add(pe == null ? (nm != null && nm < 0 ? false : null) : (pe > 0 && pe < 40), 15, 'מכפיל רווח סביר (' + num(pe, 1) + ')', pe == null ? 'אין רווח, אין מכפיל' : 'מכפיל רווח גבוה (' + num(pe, 1) + ')');
    add(de == null ? null : de < 1.5, 10, 'חוב להון נמוך (' + num(de, 2) + ')', 'חוב להון גבוה (' + num(de, 2) + ')');
    var rec = f.rec, buyShare = null;
    if (rec) { var tot = (rec.strongBuy || 0) + (rec.buy || 0) + (rec.hold || 0) + (rec.sell || 0) + (rec.strongSell || 0); if (tot) buyShare = ((rec.strongBuy || 0) + (rec.buy || 0)) / tot; }
    add(buyShare == null ? null : buyShare >= 0.55, 20, 'רוב האנליסטים ממליצים לקנות (' + Math.round(buyShare * 100) + '%)', 'פחות ממחצית האנליסטים ממליצים לקנות');
    var pos = hi != null && lo != null && hi > lo && price ? (price - lo) / (hi - lo) : null;
    return { score: max ? Math.round(pts / max * 100) : null, notes: notes, buyShare: buyShare, pos52: pos, hi: hi, lo: lo, pe: pe, rg: rg, eg: eg, nm: nm, de: de };
  }

  /* ---------- סווינג: Trend Template (Minervini), חוזק יחסי ומצב שוק ---------- */
  function sma(a, p, i) { if (i < p - 1 || i >= a.length) return null; var t = 0; for (var k = i - p + 1; k <= i; k++) t += a[k]; return t / p; }
  function retOver(bars, n) { var i = bars.length - 1; return bars.length > n ? bars[i].c / bars[i - n].c - 1 : null; }
  function trendTemplate(bars, spy) {
    if (!bars || bars.length < 210) return { ok: false, msg: 'צריך לפחות 210 נרות יומיים לבדיקה' };
    var c = bars.map(function (b) { return b.c; }), i = c.length - 1, px = c[i];
    var s50 = sma(c, 50, i), s150 = sma(c, 150, i), s200 = sma(c, 200, i), s200p = sma(c, 200, i - 22);
    var look = Math.min(252, bars.length), hi = -Infinity, lo = Infinity;
    bars.slice(-look).forEach(function (b) { if (b.h > hi) hi = b.h; if (b.l < lo) lo = b.l; });
    var it = [], add = function (ok, label, detail) { it.push({ ok: ok, label: label, detail: detail }); };
    add(px > s150 && px > s200, 'המחיר מעל ממוצע 150 וממוצע 200', 'מחיר ' + px.toFixed(2) + ' מול ' + s150.toFixed(2) + ' / ' + s200.toFixed(2));
    add(s150 > s200, 'ממוצע 150 מעל ממוצע 200', '');
    add(s200p != null && s200 > s200p, 'ממוצע 200 עולה מזה חודש לפחות', s200p ? (((s200 / s200p - 1) * 100).toFixed(1) + '% בחודש האחרון') : '');
    add(s50 > s150 && s50 > s200, 'ממוצע 50 מעל 150 ו-200', '');
    add(px > s50, 'המחיר מעל ממוצע 50', '');
    add(px >= lo * 1.3, 'לפחות 30% מעל השפל של 52 שבועות', '+' + ((px / lo - 1) * 100).toFixed(0) + '%');
    add(px >= hi * 0.75, 'עד 25% מתחת לשיא של 52 שבועות', '−' + ((1 - px / hi) * 100).toFixed(0) + '% מהשיא');
    var rs = null;
    if (spy && spy.length > 130) {
      var a6 = retOver(bars, 126), b6 = retOver(spy, 126), a3 = retOver(bars, 63), b3 = retOver(spy, 63);
      if (a6 != null && b6 != null) { rs = { r6: (a6 - b6) * 100, r3: a3 != null && b3 != null ? (a3 - b3) * 100 : null }; add(rs.r6 > 0, 'חזק מ-SPY ב-6 חודשים', (rs.r6 >= 0 ? '+' : '') + rs.r6.toFixed(1) + ' נק\' מול SPY' + (rs.r3 != null ? ' (3 חודשים: ' + (rs.r3 >= 0 ? '+' : '') + rs.r3.toFixed(1) + ')' : '')); }
    }
    if (!rs) add(null, 'חוזק יחסי מול SPY', 'אין נתוני SPY');
    var known = it.filter(function (x) { return x.ok !== null; }), pass = known.filter(function (x) { return x.ok; }).length;
    return { ok: true, items: it, pass: pass, total: known.length, rs: rs, hi: hi, lo: lo, s50: s50, s150: s150, s200: s200, verdict: pass >= 7 ? 'ready' : pass >= 5 ? 'partial' : 'no' };
  }
  function regimeOf(spy) {
    if (!spy || spy.length < 210) return null;
    var c = spy.map(function (b) { return b.c; }), i = c.length - 1, px = c[i], s50 = sma(c, 50, i), s200 = sma(c, 200, i), s200p = sma(c, 200, i - 22);
    var dist = (px / s200 - 1) * 100, rising = s200 > s200p;
    /* פס של 3% סביב ממוצע 200 מפחית איתותי שווא (הצלבות סרק) */
    var st = px > s200 * 1.03 && s50 > s200 && rising ? 'on' : px < s200 * 0.97 ? 'off' : 'mixed';
    return { state: st, dist: dist, px: px, s50: s50, s200: s200, rising: rising, label: st === 'on' ? 'שוק תומך' : st === 'off' ? 'שוק חלש' : 'שוק מעורב' };
  }

  /* ---------- יומי: מפת היום (גאפ, PDH/PDL, טווח פתיחה, RVOL לפי שעה) ---------- */
  var nyFmt = null;
  function nyMin(t) { if (!nyFmt) nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' }); var p = {}; nyFmt.formatToParts(new Date(t)).forEach(function (x) { p[x.type] = x.value; }); return (+p.hour % 24) * 60 + (+p.minute); }
  function dayLevels(b5) {
    if (!b5 || b5.length < 30) return null;
    var days = {}, order = [];
    b5.forEach(function (b) { var m = nyMin(b.t); if (m < 570 || m >= 960) return; var d = AT.ind.nyDay(b.t); if (!days[d]) { days[d] = []; order.push(d); } days[d].push({ b: b, m: m }); });
    var ref = null; for (var k = order.length - 1; k >= 0; k--) { if (days[order[k]].some(function (x) { return x.m >= 570 && x.m < 600; })) { ref = k; break; } }
    if (ref == null) return null;
    var T = days[order[ref]], P = ref > 0 ? days[order[ref - 1]] : null;
    var or = T.filter(function (x) { return x.m < 600; }).map(function (x) { return x.b; });
    if (or.length < 4) return null;
    var orh = Math.max.apply(null, or.map(function (b) { return b.h; })), orl = Math.min.apply(null, or.map(function (b) { return b.l; }));
    var last = T[T.length - 1], res = { date: order[ref], orh: orh, orl: orl, orMid: (orh + orl) / 2, last: last.b.c, lastMin: last.m, complete: last.m >= 955 };
    if (P) { res.pdh = Math.max.apply(null, P.map(function (x) { return x.b.h; })); res.pdl = Math.min.apply(null, P.map(function (x) { return x.b.l; })); res.pdc = P[P.length - 1].b.c; res.gapPct = (T[0].b.o / res.pdc - 1) * 100; }
    /* RVOL לפי שעה: נפח מצטבר עד אותה דקה מול ימים קודמים */
    var cum = function (arr, m) { return arr.reduce(function (a, x) { return x.m <= m ? a + (x.b.v || 0) : a; }, 0); };
    var prior = order.slice(0, ref).map(function (d) { return cum(days[d], last.m); }).filter(function (v) { return v > 0; });
    if (prior.length) { var avg = prior.reduce(function (a, b) { return a + b; }, 0) / prior.length, now = cum(T, last.m); res.rvol = avg > 0 ? now / avg : null; res.rvolN = prior.length; }
    var tp = 0, vv = 0; T.forEach(function (x) { var v = x.b.v > 0 ? x.b.v : 1; tp += (x.b.h + x.b.l + x.b.c) / 3 * v; vv += v; }); res.vwap = vv ? tp / vv : null;
    return res;
  }
  function orbPlan(d) {
    if (!d) return null; var rg = d.orh - d.orl; if (!(rg > 0)) return null;
    var long = d.last >= d.orMid, e = long ? d.orh : d.orl, st = long ? d.orl : d.orh;
    var qty = S.risk > 0 ? Math.floor(S.risk / rg) : 0;
    return { dir: long ? 'long' : 'short', entry: e, stop: st, t1: long ? e + rg : e - rg, t2: long ? e + 2 * rg : e - 2 * rg, risk: rg, qty: qty };
  }

  /* ---------- ארוך: בדיקת איכות (ROIC / שולי רווח / FCF / PEG) ---------- */
  function quality(f) {
    if (!f || !f.metric) return null; var m = f.metric, it = [];
    var g = function () { for (var i = 0; i < arguments.length; i++) { var v = m[arguments[i]]; if (v != null && isFinite(v)) return v; } return null; };
    var add = function (v, ok, label, fmt) { it.push({ ok: v == null ? null : ok(v), label: label, detail: v == null ? 'אין נתון' : fmt(v) }); };
    var pct = function (v) { return v.toFixed(1) + '%'; };
    add(g('roiTTM', 'roeTTM'), function (v) { return v >= 15; }, 'תשואה על הון (ROI/ROE) מעל 15%', pct);
    add(g('operatingMarginTTM'), function (v) { return v >= 15; }, 'שולי רווח תפעולי מעל 15%', pct);
    add(g('netProfitMarginTTM'), function (v) { return v >= 10; }, 'שולי רווח נקי מעל 10%', pct);
    var pf = g('pfcfShareTTM'); add(pf != null && pf > 0 ? 100 / pf : null, function (v) { return v >= 4; }, 'תשואת תזרים חופשי (FCF yield) מעל 4%', pct);
    var pe = g('peTTM', 'peBasicExclExtraTTM'), gr = g('epsGrowth5Y'); add(pe != null && gr != null && gr > 0 && pe > 0 ? pe / gr : null, function (v) { return v <= 1.5; }, 'PEG מתחת ל-1.5', function (v) { return v.toFixed(2); });
    add(g('totalDebt/totalEquityQuarterly', 'totalDebt/totalEquityAnnual'), function (v) { return v <= 1.5; }, 'חוב להון מתחת ל-1.5', function (v) { return v.toFixed(2); });
    add(g('revenueGrowth5Y'), function (v) { return v >= 8; }, 'צמיחת הכנסות ב-5 שנים מעל 8% בשנה', pct);
    var known = it.filter(function (x) { return x.ok !== null; }), pass = known.filter(function (x) { return x.ok; }).length;
    return { items: it, pass: pass, total: known.length };
  }

  /* ---------- בניית תוכנית ופירוק לאופק ---------- */
  /* תוכנית עסקה לכיוון נתון: סטופ ויעדים לפי ATR של טווח הבסיס, כמות מהסיכון, תקרת גודל ומכשולים */
  function mkPlan(base, mode, dir, sf, hyp) {
    var lv = AT.levels(dir, base.price, base.atr, AT.MODES[mode].mult), entry = base.price, long = dir === 'long', risk = Math.abs(entry - lv.stop);
    var riskUsd = (S.risk || 0) * sf.factor, qty = risk > 0 && riskUsd > 0 ? Math.floor(riskUsd / risk) : 0;
    /* תקרת גודל: לא מציעים פוזיציה גדולה מהתיק (כפול המינוף המקסימלי שהגדרת, ברירת מחדל 1) */
    var maxLev = +S.maxLev > 0 ? +S.maxLev : 1, capped = false;
    if (S.acct > 0 && entry > 0) { var maxQ = Math.floor(S.acct * maxLev / entry); if (qty > maxQ) { qty = maxQ; capped = true; } }
    /* מכשולים בדרך ליעד השני: רמות תמיכה והתנגדות שבין הכניסה ליעד */
    var lo = Math.min(entry, lv.t2), hi = Math.max(entry, lv.t2);
    var obst = (base.zones.sr || []).filter(function (z) { return z.level > lo && z.level < hi && (long ? z.type === 'resistance' : z.type === 'support'); });
    return { dir: dir, side: long ? 'לונג' : 'שורט', entry: entry, zoneLo: entry - 0.25 * base.atr, zoneHi: entry + 0.25 * base.atr, stop: lv.stop, t1: lv.t1, t2: lv.t2, atr: base.atr, tf: E.BASE_TF[mode],
      rr1: risk > 0 ? Math.abs(lv.t1 - entry) / risk : null, rr2: risk > 0 ? Math.abs(lv.t2 - entry) / risk : null, riskPerShare: risk, riskPct: risk / entry * 100,
      qty: qty, riskUsd: qty * risk, posUsd: qty * entry, sizeFactor: sf, capped: capped, maxLev: maxLev, hypothetical: !!hyp, obstacles: obst.slice(0, 3), hold: HOLD[mode], trail: TRAIL[mode] };
  }
  function buildMode(bars, mode, ctx) {
    var an = E.analyzeAll(bars, mode, 70);
    var base = an.results[E.BASE_TF[mode]];
    var sf = SES.sizeFactor({ daysToEarnings: ctx.days, atrPct: base && base.ok ? base.atr / base.price * 100 : null, sentiment: ctx.news ? ctx.news.avg : null, dir: an.combined.lean === 'short' ? 'short' : 'long' });
    var ex = E.explain(an, mode, { news: ctx.news, earnings: ctx.days != null ? { days: ctx.days } : null, sizeFactor: sf });
    /* סימנים במחיר: מסווגים לפי כיוון, כך שסימן דובי לא יופיע כתומך בלונג */
    if (base && base.ok && (ex.stance === 'long' || ex.stance === 'short' || ex.stance === 'lean_long' || ex.stance === 'lean_short')) {
      var sg = ex.stance.indexOf('short') >= 0 ? -1 : 1, pd = {};
      (base.patterns || []).forEach(function (q) { pd[q.name] = q.dir === 'bull' ? 1 : q.dir === 'bear' ? -1 : 0; });
      ex.pros = ex.pros.filter(function (t) { return t.indexOf('סימן במחיר:') !== 0; });
      (base.notes || []).forEach(function (n) {
        var d = pd[n] != null ? pd[n] : /שורית|מלמטה|H2|כלפי מטה/.test(n) ? 1 : /דובית|מלמעלה|L2|כלפי מעלה/.test(n) ? -1 : 0;
        if (!d) return;
        if (d * sg > 0) ex.pros.push('סימן במחיר: ' + n); else ex.risks.push('נגד התרחיש: ' + n);
      });
    }
    var plan = ex.plan && base && base.ok ? mkPlan(base, mode, ex.plan.dir, sf, ex.plan.hypothetical) : null;
    return { mode: mode, an: an, ex: ex, base: base, plan: plan, sf: sf };
  }
  /* ---------- ציון כניסה משולב ----------
     טכני + חדשות החברה + מאקרו + סקטור + פוליטיקה ורגולציה + אנליסטים + יסודות + מצב השוק.
     כל רכיב מ-100- (שורט) עד 100+ (לונג). המשקלות תלויים באופק: ביומי הטכני והחדשות מובילים, בארוך היסודות והאנליסטים. */
  var UW = {
    day:   { tech: 0.40, headlines: 0.12, company: 0.12, macro: 0.10, sector: 0.10, politics: 0.05, analysts: 0.05, fund: 0.05, regime: 0.05 },
    swing: { tech: 0.28, headlines: 0.10, company: 0.10, macro: 0.12, sector: 0.10, politics: 0.06, analysts: 0.12, fund: 0.12, regime: 0.06 },
    long:  { tech: 0.20, headlines: 0.05, company: 0.07, macro: 0.12, sector: 0.10, politics: 0.05, analysts: 0.15, fund: 0.24, regime: 0.06 } };
  var UL = { tech: 'טכני', headlines: 'כותרות אחרונות', company: 'חדשות החברה', macro: 'מאקרו', sector: 'הסקטור', politics: 'פוליטיקה ורגולציה', analysts: 'אנליסטים', fund: 'יסודות החברה', regime: 'מצב השוק' };
  var ENTRY = 40, LEAN = 18, GATE_OLD = 'ציון מאוחד עבר סף כניסה ללא ווטו', GATE_NEW = 'הציון המשולב מספיק חזק';
  var cv = function (x) { return Math.max(-100, Math.min(100, x)); };
  /* כותרות אחרונות על המניה: מ-Finnhub ומזרם החדשות של האתר (48 שעות), עם ניקוד גם לעברית */
  var HPOS = ['זינוק', 'זינק', 'מזנק', 'מזנקת', 'שיא', 'שדרוג', 'משדרג', 'מעלה', 'עולה', 'עלייה', 'צמיחה', 'רווח', 'חיובי', 'הסכם', 'אישור', 'מאשר', 'חוזה', 'יעד מחיר', 'ממליץ לקנות', 'מכה את התחזיות', 'חזק'];
  var HNEG = ['צונח', 'צנח', 'קריסה', 'קורס', 'הורדת', 'מוריד', 'הפסד', 'תביעה', 'חקירה', 'אזהרה', 'שלילי', 'פיטורים', 'עיכוב', 'יורד', 'ירידה', 'חלש', 'מפספס', 'מכירה', 'סיכון'];
  function headSent(text) {
    var sc = AT.data.sentiment(text), t = String(text || ''), p = 0, n = 0;
    HPOS.forEach(function (w) { if (t.indexOf(w) >= 0) p++; }); HNEG.forEach(function (w) { if (t.indexOf(w) >= 0) n++; });
    if (p + n) sc = sc !== 0 ? (sc + (p - n) / (p + n)) / 2 : (p - n) / (p + n);
    return sc;
  }
  function headlines(res) {
    var cut = Date.now() - 2 * 864e5, out = [], seen = {}, sym = res.sym.replace('/USD', ''), prof = res.fund && res.fund.profile || {}, nm = (prof.name || '').split(/[ ,.]/)[0] || '';
    var add = function (title, src, url, t, summary) { if (!title || seen[title]) return; if (t && t < cut) return; seen[title] = 1; out.push({ title: title, src: src || '', url: url || '', t: t || 0, s: headSent(title + ' ' + (summary || '')) }); };
    ((res.news && res.news.items) || []).forEach(function (i) { add(i.headline, i.source, i.url, i.t || (i.datetime ? i.datetime * 1000 : 0), i.summary); });
    var re = sym.length >= 3 ? new RegExp('(^|[^A-Za-z])' + sym + '([^A-Za-z]|$)') : null, nre = nm.length >= 4 ? new RegExp(nm, 'i') : null;
    ((window.__wire && window.__wire.state && window.__wire.state.items) || []).forEach(function (i) { var t = i.title || ''; if ((re && re.test(t)) || (nre && nre.test(t))) add(t, i.src, i.link, i.t); });
    return out.sort(function (a, b) { return b.t - a.t; }).slice(0, 12);
  }
  function uniParts(res, m, k) {
    var W = UW[k], P = [], ai = res.ctx && res.ctx.ai && !res.ctx.ai.err ? res.ctx.ai : null, sc = (ai && ai.scores) || {};
    var add = function (key, v, detail) { if (v == null || !isFinite(v)) return; P.push({ k: key, label: UL[key], w: W[key], v: Math.round(cv(v)), detail: detail || '' }); };
    add('tech', m.ex.score, m.ex.headline);
    var hl = headlines(res); if (hl.length >= 2) { var pos = hl.filter(function (x) { return x.s > 0.2; }).length, neg = hl.filter(function (x) { return x.s < -0.2; }).length, avg = hl.reduce(function (a, x) { return a + x.s; }, 0) / hl.length; add('headlines', avg * 100 * Math.min(1, hl.length / 3), hl.length + ' כותרות ב-48 שעות: ' + pos + ' חיוביות, ' + neg + ' שליליות'); }
    ['company', 'macro', 'sector', 'politics'].forEach(function (c) { if (ai && sc[c] != null) add(c, sc[c] * 50, ai[c] && ai[c][0] ? ai[c][0].point : ''); });
    var rec = res.fund && res.fund.rec, share = null;
    if (rec) { var tot = (rec.strongBuy || 0) + (rec.buy || 0) + (rec.hold || 0) + (rec.sell || 0) + (rec.strongSell || 0); if (tot) share = ((rec.strongBuy || 0) + (rec.buy || 0)) / tot; }
    var av = []; if (share != null) av.push((share - 0.5) * 200); if (ai && sc.analysts != null) av.push(sc.analysts * 50);
    if (av.length) add('analysts', av.reduce(function (a, b) { return a + b; }, 0) / av.length, (share != null ? Math.round(share * 100) + '% ממליצים לקנות' : '') + (ai && ai.analysts && ai.analysts[0] ? (share != null ? ' · ' : '') + ai.analysts[0].point : ''));
    if (res.fs && res.fs.score != null) add('fund', (res.fs.score - 50) * 2, 'ציון יסוד ' + res.fs.score + ' מתוך 100');
    if (res.regime) add('regime', res.regime.state === 'on' ? 60 : res.regime.state === 'off' ? -60 : 0, res.regime.label);
    return P;
  }
  function uniFor(res, m, k) {
    var P = uniParts(res, m, k), sw = 0, sv = 0, totW = Object.keys(UW[k]).reduce(function (a, x) { return a + UW[k][x]; }, 0); P.forEach(function (p) { sw += p.w; sv += p.w * p.v; });
    var cov = sw / totW, S0 = sw ? sv / sw : 0, dir = S0 >= 0 ? 'long' : 'short', sg = S0 >= 0 ? 1 : -1, agreeW = 0;
    P.forEach(function (p) { if (p.v * sg >= 15) agreeW += p.w; });
    var agree = sw ? agreeW / sw : 0, tech = P.filter(function (p) { return p.k === 'tech'; })[0], nw = 0, nv = 0;
    P.forEach(function (p) { if (['headlines', 'company', 'macro', 'sector', 'politics'].indexOf(p.k) >= 0) { nw += p.w; nv += p.w * p.v; } });
    var ctxV = nw ? nv / nw : null, conflict = !!(tech && ctxV != null && tech.v * ctxV < 0 && Math.abs(tech.v) >= 30 && Math.abs(ctxV) >= 30);
    var vet = m.an.combined.vetoes.length > 0, side = dir === 'long' ? 'לונג' : 'שורט', loading = !!(res.ctx && res.ctx.status === 'loading'), hasCtx = !!(res.ctx && res.ctx.ai && !res.ctx.ai.err);
    var stance = 'flat', headline;
    if (Math.abs(S0) >= ENTRY && agree >= 0.6 && !conflict && cov >= 0.8 && !vet && !loading) { stance = dir; headline = 'כניסה ל' + side + ': רוב הרכיבים מצביעים לאותו כיוון'; }
    else if (Math.abs(S0) >= LEAN) {
      stance = 'lean_' + dir;
      headline = 'נטייה ל' + side + ', אבל ' + (loading ? 'עדיין מחפשים חדשות ומאקרו' : conflict ? 'יש סתירה בין הניתוח הטכני לחדשות והמאקרו' : vet ? 'טווח זמן גבוה מתנגד' : agree < 0.6 ? 'לא מספיק רכיבים מסכימים' : cov < 0.8 ? 'חסר מידע (' + (hasCtx ? 'יסודות ואנליסטים' : 'חדשות ומאקרו') + ')' : 'הציון עוד לא מספיק חזק לכניסה');
    } else headline = loading ? 'עדיין מחפשים חדשות ומאקרו' : 'אין כיוון ברור: להמתין';
    return { score: Math.round(S0), entry: Math.round(Math.abs(S0)), dir: dir, stance: stance, headline: headline, parts: P, agree: agree, agreeN: P.filter(function (p) { return p.v * sg >= 15; }).length, n: P.length, coverage: cov, conflict: conflict, loading: loading };
  }
  function unify(res) {
    ['day', 'swing', 'long'].forEach(function (k) {
      var m = res.modes[k]; m.uni = uniFor(res, m, k); var u = m.uni;
      if (m.base && m.base.ok) { if (!m.plan || m.plan.dir !== u.dir) m.plan = mkPlan(m.base, k, u.dir, m.sf, true); m.plan.hypothetical = !(u.stance === 'long' || u.stance === 'short'); }
      var g = m.gates.items.filter(function (x) { return x.label === GATE_OLD || x.label === GATE_NEW; })[0];
      if (g) { g.label = GATE_NEW; g.ok = u.stance === 'long' || u.stance === 'short'; g.detail = 'ציון ' + u.entry + ' (נדרש ' + ENTRY + ')'; }
      var it = m.gates.items; m.gates.failed = it.filter(function (x) { return x.ok === false; }).length; m.gates.unknown = it.filter(function (x) { return x.ok === null; }).length;
      m.gates.ok = !m.gates.failed && !m.gates.unknown; m.gates.status = m.gates.failed ? 'blocked' : m.gates.unknown ? 'unverified' : 'ready';
    });
  }
  /* תצוגת הכרעה: משולבת אם יש, אחרת טכנית */
  function verdictOf(m) { var u = m.uni; return u ? { stance: u.stance, score: u.score, entry: u.entry, headline: u.headline } : { stance: m.ex.stance, score: m.ex.score, entry: Math.abs(m.ex.score), headline: m.ex.headline }; }
  function nearestZoneAtr(base) {
    if (!base || !base.ok) return null;
    var best = null, price = base.price;
    var zs = (base.zones.fvg || []).concat(base.zones.ob || []);
    zs.forEach(function (z) { var d = price >= z.lo && price <= z.hi ? 0 : Math.min(Math.abs(price - z.lo), Math.abs(price - z.hi)) / base.atr; if (best == null || d < best) best = d; });
    [base.poc, base.vah, base.val].forEach(function (l) { if (l != null) { var d = Math.abs(price - l) / base.atr; if (best == null || d < best) best = d; } });
    return best;
  }
  function gatesFor(r, m, bars) {
    var base = m.base, plan = m.plan;
    var d1 = bars['1D'] && bars['1D'].length ? bars['1D'][bars['1D'].length - 1] : null, a1 = m.an.results['1D'];
    var dayRange = d1 && a1 && a1.ok ? (d1.h - d1.l) / a1.atr : null;
    var ctx = { phase: SES.phase(Date.now()), rvol: base && base.ok ? base.rvol : null, zoneDistAtr: nearestZoneAtr(base), rr: plan ? plan.rr1 : null,
      eventSoonMin: r.days != null && r.days <= 0 ? 0 : null, dayRangeAtr: m.mode === 'day' ? dayRange : null, stopsInRow: null, prevDayDropPct: bars['1D'] && bars['1D'].length > 1 ? (bars['1D'][bars['1D'].length - 1].c / bars['1D'][bars['1D'].length - 2].c - 1) * 100 : null };
    var ss = SES.superSetup(m.an.combined, ctx);
    /* חשיפה מצטברת לקבוצה מתואמת מול הסיכון הפתוח ביומן */
    var grp = AT.groupOf(r.sym), open = 0, tot = 0;
    (D.trades || []).forEach(function (t) { if (t.status === 'open' || t.status === 'active') { var rk = (t.sizing && t.sizing.risk) || 0; tot += rk; if (AT.groupOf(t.ticker) === grp) open += rk; } });
    var add = plan ? plan.riskUsd : 0, gl = +S.heatGroup > 0 ? +S.heatGroup : 3, tl = +S.heatTotal > 0 ? +S.heatTotal : 6, lim = (S.acct || 0) * gl / 100, tlim = (S.acct || 0) * tl / 100;
    if (S.acct > 0 && grp !== r.sym) ss.items.push({ ok: open + add <= lim + 1e-9, label: 'חשיפה לקבוצה "' + grp + '" בגבול ' + gl + '% מההון', detail: 'סיכון מצטבר $' + Math.round(open + add) + ' מתוך $' + Math.round(lim) });
    if (S.acct > 0) ss.items.push({ ok: tot + add <= tlim + 1e-9, label: 'סך הסיכון הפתוח בגבול ' + tl + '% (חום תיק)', detail: 'מצטבר $' + Math.round(tot + add) + ' מתוך $' + Math.round(tlim) });
    var rg = r.regime, tt = r.tt;
    if (m.mode !== 'day') ss.items.push({ ok: rg ? (rg.state === 'on' ? true : rg.state === 'off' ? false : null) : null, label: 'מצב השוק תומך (SPY מעל ממוצע 200)', detail: rg ? rg.label + ' · ' + (rg.dist >= 0 ? '+' : '') + rg.dist.toFixed(1) + '% מממוצע 200' : 'אין נתוני SPY' });
    if (m.mode === 'swing') ss.items.push({ ok: tt && tt.ok ? (tt.verdict === 'ready' ? true : tt.verdict === 'no' ? false : null) : null, label: 'תבנית מגמה 7/8 ומעלה', detail: tt && tt.ok ? tt.pass + ' מתוך ' + tt.total : '' });
    if (m.mode === 'day' && r.day) ss.items.push({ ok: r.day.rvol != null ? r.day.rvol >= 1.5 : null, label: 'נפח יחסי לפי שעה לפחות פי 1.5', detail: r.day.rvol != null ? 'פי ' + r.day.rvol.toFixed(2) + ' (' + r.day.rvolN + ' ימים קודמים)' : 'אין מספיק ימים להשוואה' });
    ss.failed = ss.items.filter(function (x) { return x.ok === false; }).length; ss.unknown = ss.items.filter(function (x) { return x.ok === null; }).length;
    ss.ok = ss.failed === 0 && ss.unknown === 0; ss.status = ss.failed ? 'blocked' : ss.unknown ? 'unverified' : 'ready';
    return ss;
  }

  /* ---------- הפעלה ---------- */
  function setMsg(t, pct) {
    DEEP.msg = t; var n = $q('#dpMsg'); if (n) n.textContent = t;
    var b = $q('#dpBar i'); if (b && pct != null) b.style.width = pct + '%';
  }
  function run(raw) {
    if (DEEP.busy) return Promise.resolve();
    var q = String(raw || '').trim();
    if (!q) { setMsg('הקלד טיקר'); return Promise.resolve(); }
    if (!S.td) { setMsg('צריך מפתח Twelve Data בהגדרות (⚙️), בשביל הנרות.'); return Promise.resolve(); }
    DEEP.busy = true; DEEP.sugg = [];
    var go = $q('#dpGo'); if (go) go.disabled = true;
    var c = client(), looks = /^[A-Za-z.\/-]{1,8}$/.test(q);
    setMsg('מאתר את הנכס…', 3);
    var resolve = looks ? Promise.resolve(q.toUpperCase()) : c.search(q).then(function (r) { if (!r.length) throw new Error('לא נמצא נכס בשם "' + q + '"'); return r[0].symbol; });
    var sym, bars = {}, errors = {};
    return resolve.then(function (s) {
      sym = s === 'BTC' ? 'BTC/USD' : s; DEEP.sym = sym;
      var crypto = sym.indexOf('/') >= 0;
      var newsP = !crypto && S.fh ? c.newsAny(sym).catch(function () { return null; }) : Promise.resolve(null);
      var earnP = !crypto && S.fh ? c.earningsAny(sym).catch(function () { return null; }) : Promise.resolve(null);
      var fundP = !crypto && S.fh ? c.fundamentals(sym).catch(function () { return null; }) : Promise.resolve(null);
      var quoteP = !crypto && S.fh ? c.quote(sym).catch(function () { return null; }) : Promise.resolve(null);
      var i = 0;
      return FETCH_TFS.reduce(function (chain, tf) {
        return chain.then(function () {
          setMsg('טוען ' + sym + ' · ' + E.TF_LABEL[tf] + ' (' + (i + 1) + '/' + FETCH_TFS.length + ')', 8 + Math.round(i / FETCH_TFS.length * 70));
          return c.series(sym, E.TF_INTERVAL[tf], tf === '6M' ? 600 : 300).then(function (b) { bars[tf] = tf === '6M' ? E.halfYear(b) : b; }).catch(function (e) { errors[tf] = e.message; }).then(function () { i++; });
        });
      }, Promise.resolve()).then(function () {
        if (!Object.keys(bars).length) { var u = Object.keys(errors).map(function (k) { return errors[k]; }).filter(function (x, j, a) { return a.indexOf(x) === j; }); throw new Error(u.length ? u.slice(0, 2).join(' | ') : 'לא התקבלו נתונים עבור ' + sym); }
        setMsg('בודק את מצב השוק (SPY)…', 84);
        var spyP = sym === 'SPY' ? Promise.resolve(bars['1D'] || null) : c.series('SPY', '1day', 300).catch(function () { return null; });
        setMsg('מחשב ניתוח…', 90);
        return Promise.all([newsP, earnP, fundP, quoteP, spyP]);
      });
    }).then(function (x) {
      var news = x[0], earn = x[1], fund = x[2], quote = x[3], days = null;
      if (earn && earn.date) { var d = Math.round((Date.parse(earn.date) - Date.now()) / 864e5); if (isFinite(d)) days = d; }
      var price = quote && quote.price ? quote.price : (bars['5m'] && bars['5m'].length ? bars['5m'][bars['5m'].length - 1].c : bars['1D'] && bars['1D'].length ? bars['1D'][bars['1D'].length - 1].c : null);
      var spy = x[4];
      var res = { sym: sym, bars: bars, errors: errors, news: news, earn: earn, days: days, fund: fund, fs: fundScore(fund, price), quote: quote, price: price, modes: {}, at: Date.now(), ai: {} };
      res.spy = spy; res.regime = regimeOf(spy); res.tt = trendTemplate(bars['1D'], spy); res.day = dayLevels(bars['5m']); res.orb = orbPlan(res.day); res.q = quality(fund);
      ['day', 'swing', 'long'].forEach(function (m) { var r = buildMode(bars, m, { news: news, days: days }); r.gates = gatesFor(res, r, bars); res.modes[m] = r; });
      unify(res);
      try { if (bars['1D'] && bars['1D'].length >= 140) res.bt = E.backtest(bars['1D'], { window: 120, start: 90, horizon: 20, mult: 1.5, rr: 2, cooldown: 3 }); } catch (e) { res.bt = null; }
      DEEP.res = res; setMsg(''); if (window.DeepCtx) DeepCtx.start(res);
    }).catch(function (e) { DEEP.res = null; setMsg('שגיאה: ' + e.message); })
      .then(function () { DEEP.busy = false; paint(); });
  }

  /* ---------- ציור גרף עם התוכנית ---------- */
  function drawChart(cv, bars, plan, base) {
    var dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 340, H = 230;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
    var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    var n = Math.min(70, bars.length), sl = bars.slice(-n);
    var vals = [];
    sl.forEach(function (b) { vals.push(b.h, b.l); });
    if (plan) vals.push(plan.stop, plan.t2, plan.entry);
    var mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals), pad = (mx - mn) * 0.06; mx += pad; mn -= pad;
    var padL = 6, padR = 58, cw = (W - padL - padR) / n, y = function (v) { return 8 + (mx - v) / (mx - mn) * (H - 16); };
    g.font = '10px "JetBrains Mono",monospace'; g.textBaseline = 'middle';
    if (base && base.poc) { g.strokeStyle = 'rgba(88,196,255,.35)'; g.setLineDash([2, 4]); g.beginPath(); g.moveTo(padL, y(base.poc)); g.lineTo(W - padR, y(base.poc)); g.stroke(); g.setLineDash([]); g.fillStyle = 'rgba(88,196,255,.8)'; g.fillText('POC', W - padR + 4, y(base.poc)); }
    sl.forEach(function (b, i) {
      var x = padL + i * cw + cw / 2, up = b.c >= b.o, col = up ? '#19D68A' : '#FF4D5E';
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y(b.h)); g.lineTo(x, y(b.l)); g.stroke();
      var top = y(Math.max(b.o, b.c)), bot = y(Math.min(b.o, b.c)); g.fillRect(x - cw * 0.32, top, cw * 0.64, Math.max(1, bot - top));
    });
    /* EMA21 */
    var closes = bars.map(function (b) { return b.c; }), e21 = AT.ind.ema(closes, 21).slice(-n);
    g.strokeStyle = 'rgba(255,176,32,.85)'; g.lineWidth = 1.4; g.beginPath(); var st = false;
    e21.forEach(function (v, i) { if (v == null) return; var x = padL + i * cw + cw / 2; if (!st) { g.moveTo(x, y(v)); st = true; } else g.lineTo(x, y(v)); }); g.stroke();
    if (plan) {
      var line = function (v, col, lbl, dash) { g.strokeStyle = col; g.lineWidth = 1.2; g.setLineDash(dash ? [5, 4] : []); g.beginPath(); g.moveTo(padL, y(v)); g.lineTo(W - padR, y(v)); g.stroke(); g.setLineDash([]); g.fillStyle = col; g.fillText(lbl + ' ' + px(v), W - padR + 4, y(v)); };
      line(plan.t2, '#19D68A', 'TP2', true); line(plan.t1, '#19D68A', 'TP1', true); line(plan.entry, '#E8ECF2', 'ENT', false); line(plan.stop, '#FF4D5E', 'SL', false);
    }
  }

  /* ---------- תצוגה ---------- */
  function gauge(score) {
    var s = Math.max(-100, Math.min(100, score)), ang = s * 0.9; /* -90..90 מעלות */
    return '<div class="dp-gauge" style="--ang:' + ang + 'deg" role="img" aria-label="ציון ' + s + ' מתוך 100">' +
      '<svg viewBox="0 0 200 110"><defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#FF4D5E"/><stop offset=".5" stop-color="#FFB020"/><stop offset="1" stop-color="#19D68A"/></linearGradient></defs>' +
      '<path d="M15 100 A85 85 0 0 1 185 100" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="14" stroke-linecap="round"/>' +
      '<path d="M15 100 A85 85 0 0 1 185 100" fill="none" stroke="url(#gg)" stroke-width="14" stroke-linecap="round" class="arc"/>' +
      '<g class="needle"><line x1="100" y1="100" x2="100" y2="34" stroke="#E8ECF2" stroke-width="3" stroke-linecap="round"/><circle cx="100" cy="100" r="7" fill="#E8ECF2"/></g></svg>' +
      '<div class="dp-score"><b data-count="' + s + '">' + s + '</b><span>ציון</span></div></div>';
  }
  function tile(k, v, cls, sub) { return '<div class="dp-tile ' + (cls || '') + '"><span>' + k + '</span><b>' + v + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; }
  function bar(v) { var p = Math.round(Math.abs(v) * 50); return '<div class="dp-bar"><i class="' + (v >= 0 ? 'pos' : 'neg') + '" style="' + (v >= 0 ? 'right:50%;' : 'left:50%;') + 'width:' + p + '%"></i></div>'; }

  function heroHtml(r, m) {
    var V = verdictOf(m), st = STANCE[V.stance] || STANCE.flat, side = V.stance.indexOf('long') >= 0 ? 'long' : V.stance.indexOf('short') >= 0 ? 'short' : 'flat';
    var q = r.quote, chg = q && q.changePct != null ? q.changePct : null, c = cap(r.fund && r.fund.profile ? r.fund.profile.marketCapitalization : null);
    var conf = V.entry >= 55 ? 'חזק' : V.entry >= 40 ? 'בינוני' : V.entry >= 18 ? 'חלש' : 'ניטרלי';
    var chips = ['day', 'swing', 'long'].map(function (k) {
      var x = verdictOf(r.modes[k]), s = x.stance, t = (STANCE[s] || STANCE.flat)[1], cl = s.indexOf('long') >= 0 ? 'long' : s.indexOf('short') >= 0 ? 'short' : 'flat';
      return '<button class="dp-chip ' + cl + (k === DEEP.mode ? ' on' : '') + '" data-mode="' + k + '"><small>' + MODES[k] + '</small><b>' + t + '</b><em>' + x.entry + '</em></button>';
    }).join('');
    var u = m.uni, sub = u ? '<small>' + u.agreeN + ' מתוך ' + u.n + ' רכיבים מצביעים ל' + (u.dir === 'long' ? 'לונג' : 'שורט') + (u.loading ? ' · מעדכן עם חדשות ומאקרו…' : '') + '</small>' : '';
    return '<section class="dp-hero ' + side + '">' +
      '<div class="dp-top"><div class="dp-id"><b class="dp-sym">' + esc(r.sym) + '</b><span>' + esc((r.fund && r.fund.profile && r.fund.profile.name) || '') + (r.fund && r.fund.profile && r.fund.profile.finnhubIndustry ? ' · ' + esc(r.fund.profile.finnhubIndustry) : '') + '</span>' +
      (c.cls ? '<em class="dp-cap">' + c.cls + ' · ' + c.txt + '</em>' : '') + '</div>' +
      '<div class="dp-px"><b>$' + px(r.price) + '</b>' + (chg != null ? '<span class="' + (chg >= 0 ? 'up' : 'down') + '">' + (chg >= 0 ? '+' : '') + num(chg, 2) + '%</span>' : '') + '</div></div>' +
      '<div class="dp-mid">' + gauge(V.score) + '<div class="dp-verdict"><div class="dp-stance">' + st[0] + '</div><div class="dp-conf">' + MODES[m.mode] + ' · ' + conf + ' · ציון כניסה ' + V.entry + '</div><p>' + esc(V.headline) + '</p>' + sub +
      (m.ex.confirm && !u ? '<small>' + esc(m.ex.confirm) + '</small>' : '') + '</div></div>' +
      '<div class="dp-chips">' + chips + '</div></section>';
  }
  function uniHtml(m) {
    var u = m.uni; if (!u) return '';
    var rows = u.parts.map(function (p) { return '<div class="dp-comp"><span>' + p.label + ' <small>' + Math.round(p.w * 100) + '%</small></span>' + bar(p.v / 100) + '<em>' + (p.v >= 0 ? '+' : '') + p.v + (p.detail ? ' · ' + esc(String(p.detail).slice(0, 110)) : '') + '</em></div>'; }).join('');
    var missing = Object.keys(UL).filter(function (k) { return !u.parts.some(function (p) { return p.k === k; }); }).map(function (k) { return UL[k]; });
    return '<section class="dp-card"><h3>ממה מורכב ציון הכניסה <small>' + u.agreeN + ' מתוך ' + u.n + ' מסכימים</small></h3>' + (u.conflict ? '<div class="dp-flag warn">יש סתירה: הניתוח הטכני והחדשות והמאקרו מצביעים לכיוונים הפוכים. בדרך כלל ממתינים.</div>' : '') + rows +
      (missing.length ? '<div class="dp-foot" style="text-align:right;margin-top:8px">לא נכלל (אין נתון): ' + esc(missing.join(', ')) + '. המשקל מתחלק מחדש בין הרכיבים הקיימים.</div>' : '') + '</section>';
  }
  function planHtml(r, m) {
    var p = m.plan;
    if (!p) return '<section class="dp-card"><h3>תוכנית עסקה</h3><div class="dp-empty">הציון המשולב ניטרלי (' + verdictOf(m).score + '). אין כיוון מספיק ברור לתוכנית. מחכים לאישור.</div></section>';
    var long = p.dir === 'long', cls = long ? 'long' : 'short';
    var hyp = p.hypothetical ? '<div class="dp-flag">תרחיש מותנה: התנאים לכניסה עוד לא התקיימו. זה מה שיקרה אם יתקיימו.</div>' : '';
    var capNote = p.capped ? '<div class="dp-flag">הכמות הוגבלה לגודל התיק (מינוף מקסימלי ' + p.maxLev + 'x). הסטופ צפוף, ולכן הסיכון בפועל נמוך מהסיכון שהגדרת. אפשר לשנות מינוף בחום תיק › הגדרת תקרות.</div>' : '';
    var sz = S.risk > 0 ? tile('כמות', p.qty ? p.qty + ' מניות' : '0', 'big', p.sizeFactor.factor < 1 ? 'הוקטן פי ' + p.sizeFactor.factor : '') + tile('סיכון בעסקה', '$' + num(p.riskUsd, 0), 'neg', num(p.riskPct, 2) + '% מהמחיר') + tile('גודל פוזיציה', '$' + num(p.posUsd, 0)) : '<div class="dp-flag">הגדר "סיכון $ לעסקה" בהגדרות כדי לקבל כמות.</div>';
    var obst = p.obstacles.length ? '<div class="dp-obst"><b>מכשולים בדרך ליעד:</b> ' + p.obstacles.map(function (z) { return '$' + px(z.level) + ' (' + (z.type === 'resistance' ? 'התנגדות' : 'תמיכה') + ', ' + z.touches + ' מגעים)'; }).join(' · ') + '</div>' : '';
    return '<section class="dp-card dp-plan ' + cls + '"><h3>תוכנית עסקה · ' + p.side + ' <small>' + MODES[m.mode] + ' · בסיס ' + E.TF_LABEL[p.tf] + ' · ATR $' + px(p.atr) + '</small></h3>' + hyp +
      '<canvas id="dpChart" class="dp-canvas"></canvas>' +
      '<div class="dp-tiles">' + tile('כניסה', '$' + px(p.entry), 'ent', 'אזור $' + px(Math.min(p.zoneLo, p.zoneHi)) + ' – $' + px(Math.max(p.zoneLo, p.zoneHi))) + tile('סטופ לוס', '$' + px(p.stop), 'neg', '−' + num(p.riskPct, 2) + '%') +
      tile('יעד 1 · 2R', '$' + px(p.t1), 'pos', 'R:R 1:' + num(p.rr1, 1)) + tile('יעד 2 · 3R', '$' + px(p.t2), 'pos', 'R:R 1:' + num(p.rr2, 1)) + sz + '</div>' + capNote + obst +
      '<div class="dp-rules"><div><b>משך החזקה</b><span>' + p.hold + '</span></div><div><b>ניהול העסקה</b><span>' + p.trail + '</span></div><div><b>ביטול התרחיש</b><span>' + (long ? 'סגירה מתחת ל-$' + px(p.stop) : 'סגירה מעל $' + px(p.stop)) + ', או שהציון מתהפך לכיוון ההפוך.</span></div></div>' +
      '<div class="dp-actions"><button class="btn" id="dpSave">שמור ליומן</button><button class="btn ghost" id="dpCopy">העתק</button><button class="btn ghost" id="dpCalcBtn">מחשבון</button><button class="btn ghost" id="dpChartBtn">גרף</button></div></section>';
  }
  function gatesHtml(m) {
    var g = m.gates;
    var head = g.status === 'ready' ? ['ok', 'כל השערים עברו'] : g.status === 'blocked' ? ['no', 'חסום: ' + g.failed + ' שערים נכשלו'] : ['wait', g.unknown + ' שערים לא נבדקו'];
    return '<section class="dp-card"><h3>בדיקות לפני כניסה <small class="dp-st ' + head[0] + '">' + head[1] + '</small></h3><ul class="dp-gates">' + g.items.map(function (x) {
      return '<li class="' + (x.ok === true ? 'ok' : x.ok === false ? 'no' : 'un') + '"><i>' + (x.ok === true ? '✓' : x.ok === false ? '✕' : '?') + '</i><div>' + esc(gl(x.label)) + (x.detail ? '<small>' + esc(x.detail) + '</small>' : '') + '</div></li>';
    }).join('') + '</ul></section>';
  }
  function mtfHtml(m) {
    var rows = FETCH_TFS.map(function (tf) {
      var a = m.an.results[tf];
      if (!a || !a.ok) return '<div class="dp-mtf"><span>' + E.TF_LABEL[tf] + '</span><div class="dp-bar"></div><b>–</b><em>' + esc((a && a.reason) || 'אין נתונים') + '</em></div>';
      var w = E.WEIGHTS[m.mode][tf];
      return '<div class="dp-mtf' + (w ? '' : ' dim') + '"><span>' + E.TF_LABEL[tf] + (w ? ' <small>' + w + '%</small>' : '') + '</span>' + bar(a.score / 100) + '<b class="' + (a.score >= 0 ? 'up' : 'down') + '">' + a.score + '</b><em>' + (a.state === 'trend_up' ? 'מגמת עלייה' : a.state === 'trend_down' ? 'מגמת ירידה' : 'טווח') + ' · RSI ' + (a.rsi != null ? Math.round(a.rsi) : '–') + '</em></div>';
    }).join('');
    return '<section class="dp-card"><h3>ציון לפי טווח זמן <small>משקל הטווח באופק ' + MODES[m.mode] + '</small></h3>' + rows + '</section>';
  }
  function compHtml(m) {
    var b = m.base; if (!b || !b.ok) return '';
    var rows = Object.keys(COMP_NAME).map(function (k) {
      var v = b.comp[k] || 0, why = Math.abs(v) < 0.15 ? 'ניטרלי' : COMP_WHY[k][v > 0 ? 0 : 1];
      return '<div class="dp-comp"><span>' + COMP_NAME[k] + ' <small>' + E.COMP_W[k] + '</small></span>' + bar(v) + '<em>' + why + '</em></div>';
    }).join('');
    var pats = (b.patterns || []).map(function (p) { return '<span class="dp-pat ' + p.dir + '">' + esc(p.name) + '</span>'; }).join('');
    return '<section class="dp-card"><h3>פירוט הניתוח הטכני <small>טווח בסיס ' + E.TF_LABEL[E.BASE_TF[m.mode]] + '</small></h3>' + rows +
      (pats ? '<div class="dp-pats"><b>תבניות נרות כרגע:</b> ' + pats + '</div>' : '') +
      '<div class="dp-kv">' + [['RSI', b.rsi != null ? Math.round(b.rsi) : '–'], ['נפח יחסי', b.rvol != null ? 'x' + num(b.rvol, 2) : '–'], ['VWAP', b.vwap != null ? '$' + px(b.vwap) : '–'], ['POC', b.poc != null ? '$' + px(b.poc) : '–'], ['שוק', b.state === 'trend_up' ? 'מגמת עלייה' : b.state === 'trend_down' ? 'מגמת ירידה' : 'טווח']].map(function (x) { return '<div><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('') + '</div></section>';
  }
  function prosRisksHtml(m) {
    var p = m.ex.pros.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join(''), r = m.ex.risks.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    return '<section class="dp-card dp-two"><div><h3>מה תומך</h3><ul class="dp-list pos">' + (p || '<li>אין סימנים תומכים משמעותיים</li>') + '</ul></div><div><h3>מה מסכן</h3><ul class="dp-list neg">' + (r || '<li>לא זוהו סיכונים בולטים</li>') + '</ul></div></section>';
  }
  function levelsHtml(m) {
    var b = m.base; if (!b || !b.ok) return '';
    var price = b.price, L = [];
    (b.zones.sr || []).forEach(function (z) { L.push({ p: z.level, t: z.type === 'resistance' ? 'התנגדות' : 'תמיכה', n: z.touches + ' מגעים', c: z.type }); });
    [['POC', b.poc], ['VAH', b.vah], ['VAL', b.val]].forEach(function (x) { if (x[1] != null) L.push({ p: x[1], t: x[0], n: 'פרופיל נפח', c: 'vp' }); });
    (b.zones.fvg || []).slice(-3).forEach(function (z) { L.push({ p: (z.lo + z.hi) / 2, t: 'פער ' + (z.dir === 'bull' ? 'שורי' : 'דובי'), n: '$' + px(z.lo) + '–$' + px(z.hi), c: 'zone' }); });
    (b.zones.ob || []).slice(-3).forEach(function (z) { L.push({ p: (z.lo + z.hi) / 2, t: 'בלוק ' + (z.dir === 'bull' ? 'ביקוש' : 'היצע'), n: '$' + px(z.lo) + '–$' + px(z.hi), c: 'zone' }); });
    L.sort(function (a, c) { return Math.abs(a.p - price) - Math.abs(c.p - price); });
    var kept = [];
    L.forEach(function (x) { var d = kept.filter(function (k) { return Math.abs(k.p - x.p) < 0.12 * b.atr; })[0]; if (d) { if (d.t.indexOf(x.t) < 0) d.t += ' · ' + x.t; } else kept.push(x); });
    var up = kept.filter(function (x) { return x.p >= price; }).slice(0, 5), dn = kept.filter(function (x) { return x.p < price; }).slice(0, 5);
    L = up.concat(dn); L.push({ p: price, t: 'מחיר עכשיו', n: '', c: 'now' });
    L.sort(function (a, c) { return c.p - a.p; });
    var rows = L.map(function (x) { var d = (x.p - price) / price * 100; return '<div class="dp-lvl ' + x.c + '"><b>$' + px(x.p) + '</b><span>' + x.t + '</span><em>' + x.n + '</em><small>' + (x.c === 'now' ? '' : (d >= 0 ? '+' : '') + num(d, 1) + '% · ' + num(Math.abs(x.p - price) / b.atr, 1) + ' ATR') + '</small></div>'; }).join('');
    return '<section class="dp-card"><h3>רמות מחיר <small>מעל ומתחת למחיר</small></h3><div class="dp-lvls">' + rows + '</div><div class="dp-actions" style="grid-template-columns:1fr;margin-top:10px"><button class="btn ghost" id="dpLvl">עקוב אחרי הרמות</button></div></section>';
  }
  function btHtml(r) {
    var b = r.bt; if (!b || !b.total) return '';
    var order = ['70+', '50-69', '30-49'], rows = order.filter(function (k) { return b.buckets[k]; }).map(function (k) {
      var x = b.buckets[k], wr = Math.round(x.winRate * 100);
      return '<div class="bt-r"><b>ציון ' + k + '</b><div class="dp-bar"><i class="' + (x.avgR >= 0 ? 'pos' : 'neg') + '" style="' + (x.avgR >= 0 ? 'right:50%;' : 'left:50%;') + 'width:' + Math.min(50, Math.abs(x.avgR) * 25) + '%"></i></div><span>' + x.n + ' עסקאות · ' + wr + '% הצלחה · ' + (x.avgR >= 0 ? '+' : '') + num(x.avgR, 2) + 'R' + (x.enough ? '' : ' <em>מדגם קטן</em>') + '</span></div>';
    }).join('');
    return '<section class="dp-card"><h3>כמה הציון עבד בעבר <small>' + esc(r.sym) + ' · יומי</small></h3>' + (rows || '<div class="dp-empty">לא היו מספיק איתותים בהיסטוריה.</div>') +
      '<div class="dp-foot" style="text-align:right;margin-top:8px">בדיקה על ההיסטוריה של הטיקר הזה בלבד: כניסה לפי הציון, סטופ 1.5 ATR, יעד 2R, עד 20 ימים, בלי עמלות. מדגם מתחת ל-30 עסקאות לא מוכיח כלום. זו לא הבטחה.</div></section>';
  }
  function regimeHtml(r) {
    var g = r.regime; if (!g) return '';
    return '<div class="dp-regime ' + g.state + '"><i></i><b>' + g.label + '</b><span>SPY ' + (g.dist >= 0 ? '+' : '') + g.dist.toFixed(1) + '% מממוצע 200' + (g.rising ? ' · ממוצע 200 עולה' : ' · ממוצע 200 לא עולה') + '</span></div>';
  }
  function trendHtml(r) {
    var t = r.tt; if (!t) return '';
    if (!t.ok) return '<section class="dp-card"><h3>תבנית מגמה לסווינג</h3><div class="dp-empty">' + esc(t.msg) + '</div></section>';
    var v = t.verdict === 'ready' ? ['ok', 'עומד בתבנית'] : t.verdict === 'partial' ? ['wait', 'עומד חלקית'] : ['no', 'לא עומד'];
    return '<section class="dp-card"><h3>תבנית מגמה לסווינג <small class="dp-st ' + v[0] + '">' + t.pass + '/' + t.total + ' · ' + v[1] + '</small></h3><ul class="dp-gates">' + t.items.map(function (x) {
      return '<li class="' + (x.ok === true ? 'ok' : x.ok === false ? 'no' : 'un') + '"><i>' + (x.ok === true ? '✓' : x.ok === false ? '✕' : '?') + '</i><div>' + esc(x.label) + (x.detail ? '<small>' + esc(x.detail) + '</small>' : '') + '</div></li>'; }).join('') + '</ul>' +
      '<div class="dp-foot" style="text-align:right;margin-top:8px">על פי תבנית המגמה של Minervini כפי שמתוארת במקורות משניים. הסף משתנה בין מקורות. מניות שעברו אותה הן מועמדות, לא הבטחה.</div></section>';
  }
  function dayHtml(r) {
    var d = r.day;
    if (!d) return '<section class="dp-card"><h3>מפת היום</h3><div class="dp-empty">אין מספיק נרות של 5 דקות מתוך שעות המסחר (9:30 עד 16:00 שעון ניו יורק). כנראה שהשוק סגור או שאין נתוני תוך-יום.</div></section>';
    var o = r.orb, fm = function (n) { return n == null ? '–' : '$' + px(n); };
    var tiles = tile('גאפ', d.gapPct != null ? (d.gapPct >= 0 ? '+' : '') + num(d.gapPct, 2) + '%' : '–', d.gapPct != null && Math.abs(d.gapPct) >= 4 ? 'big' : '', Math.abs(d.gapPct || 0) >= 4 ? 'גאפ משמעותי' : '') + tile('נפח יחסי לפי שעה', d.rvol != null ? 'x' + num(d.rvol, 2) : '–', d.rvol >= 2 ? 'pos' : '', d.rvol != null ? 'מול ' + d.rvolN + ' ימים' : 'אין השוואה') +
      tile('גבוה אתמול (PDH)', fm(d.pdh)) + tile('נמוך אתמול (PDL)', fm(d.pdl)) + tile('טווח פתיחה גבוה', fm(d.orh), 'pos', '30 דקות ראשונות') + tile('טווח פתיחה נמוך', fm(d.orl), 'neg') + tile('VWAP של היום', fm(d.vwap), '', d.last > d.vwap ? 'המחיר מעליו' : 'המחיר מתחתיו');
    var plan = o ? '<div class="dp-rules"><div><b>תוכנית פריצה בפתיחה · ' + (o.dir === 'long' ? 'לונג' : 'שורט') + '</b><span>כניסה ' + (o.dir === 'long' ? 'מעל ' : 'מתחת ל-') + fm(o.entry) + ' · סטופ ' + fm(o.stop) + ' · יעד 1 (1R) ' + fm(o.t1) + ' · יעד 2 (2R) ' + fm(o.t2) + (o.qty ? ' · כמות ' + o.qty : '') + '</span></div>' +
      '<div><b>תנאים לפני כניסה</b><span>אחרי 10:00 שעון ניו יורק · נר סוגר מעבר לטווח, לא רק נוגע · המחיר ' + (o.dir === 'long' ? 'מעל' : 'מתחת ל') + '-VWAP · נפח יחסי לפחות 1.5 · יש סיבה לתנועה (חדשות או דוח). בלי סיבה, מוותרים.</span></div></div>' : '';
    return '<section class="dp-card"><h3>מפת היום <small>' + esc(d.date) + (d.complete ? ' · יום שלם' : ' · עד ' + Math.floor(d.lastMin / 60) + ':' + ('0' + d.lastMin % 60).slice(-2) + ' ניו יורק') + '</small></h3><div class="dp-tiles">' + tiles + '</div>' + plan + '</section>';
  }
  function qualityHtml(r) {
    var q = r.q; if (!q) return '';
    return '<section class="dp-card"><h3>בדיקת איכות לטווח ארוך <small class="dp-st ' + (q.pass >= q.total - 1 ? 'ok' : q.pass >= Math.ceil(q.total / 2) ? 'wait' : 'no') + '">' + q.pass + '/' + q.total + '</small></h3><ul class="dp-gates">' + q.items.map(function (x) {
      return '<li class="' + (x.ok === true ? 'ok' : x.ok === false ? 'no' : 'un') + '"><i>' + (x.ok === true ? '✓' : x.ok === false ? '✕' : '?') + '</i><div>' + esc(x.label) + '<small>' + esc(x.detail) + '</small></div></li>'; }).join('') + '</ul>' +
      '<div class="dp-foot" style="text-align:right;margin-top:8px">הספים הם היוריסטיקות נפוצות. מקורות שונים חלוקים לגביהם, והם משתנים לפי ענף וריבית. מרווח ביטחון של 30% ומעלה מהערך הפנימי נשאר שיקול שלך.</div></section>';
  }
  function fundHtml(r) {
    var f = r.fund, s = r.fs;
    if (r.sym.indexOf('/') >= 0) return '<section class="dp-card"><h3>נתוני החברה</h3><div class="dp-empty">נכס קריפטו: אין דוחות כספיים. הניתוח כאן טכני בלבד.</div></section>';
    if (!f) return '<section class="dp-card"><h3>נתוני החברה</h3><div class="dp-empty">' + (S.fh ? 'לא התקבלו נתוני יסוד מ-Finnhub לנכס הזה.' : 'הוסף מפתח Finnhub בהגדרות כדי לקבל שווי שוק, מכפילים, צמיחה והמלצות אנליסטים.') + '</div></section>';
    var m = f.metric, p = f.profile, c = cap(p.marketCapitalization), rec = f.rec;
    var g = function () { for (var i = 0; i < arguments.length; i++) { var v = m[arguments[i]]; if (v != null && isFinite(v)) return v; } return null; };
    var tiles = [['שווי שוק', c.txt, c.cls], ['מכפיל רווח', num(g('peTTM', 'peBasicExclExtraTTM', 'peNormalizedAnnual'), 1)], ['צמיחת הכנסות', num(g('revenueGrowthTTMYoy'), 1) + '%'], ['צמיחת רווח למניה', num(g('epsGrowthTTMYoy'), 1) + '%'],
      ['שולי רווח נקי', num(g('netProfitMarginTTM'), 1) + '%'], ['ROE', num(g('roeTTM'), 1) + '%'], ['חוב להון', num(g('totalDebt/totalEquityQuarterly', 'totalDebt/totalEquityAnnual'), 2)], ['בטא', num(g('beta'), 2)], ['דיבידנד', num(g('dividendYieldIndicatedAnnual'), 2) + '%']]
      .map(function (x) { return '<div class="dp-fv"><span>' + x[0] + '</span><b>' + x[1] + '</b>' + (x[2] ? '<small>' + x[2] + '</small>' : '') + '</div>'; }).join('');
    var pos = s && s.pos52 != null ? '<div class="dp-range"><span>$' + px(s.lo) + '</span><div><i style="right:' + Math.round((1 - s.pos52) * 100) + '%"></i></div><span>$' + px(s.hi) + '</span><small>טווח 52 שבועות: המחיר ב-' + Math.round(s.pos52 * 100) + '% מהטווח</small></div>' : '';
    var recH = rec ? '<div class="dp-rec"><b>המלצות אנליסטים (' + esc(rec.period || '') + ')</b><div class="dp-recbar">' + [['strongBuy', 'קנייה חזקה', '#0FA36A'], ['buy', 'קנייה', '#19D68A'], ['hold', 'החזק', '#FFB020'], ['sell', 'מכירה', '#FF7A85'], ['strongSell', 'מכירה חזקה', '#FF4D5E']].map(function (x) { return '<i style="flex:' + (rec[x[0]] || 0) + ';background:' + x[2] + '" title="' + x[1] + ': ' + (rec[x[0]] || 0) + '"></i>'; }).join('') + '</div><small>' + (rec.strongBuy || 0) + ' קנייה חזקה · ' + (rec.buy || 0) + ' קנייה · ' + (rec.hold || 0) + ' החזק · ' + (rec.sell || 0) + ' מכירה · ' + (rec.strongSell || 0) + ' מכירה חזקה</small></div>' : '';
    var notes = s && s.notes.length ? '<ul class="dp-gates">' + s.notes.map(function (n) { return '<li class="' + (n.ok ? 'ok' : 'no') + '"><i>' + (n.ok ? '✓' : '✕') + '</i><div>' + esc(n.t) + '</div></li>'; }).join('') + '</ul>' : '';
    var ed = r.days != null ? '<div class="dp-flag ' + (r.days <= 7 ? 'warn' : '') + '">דוחות רבעוניים בעוד ' + r.days + ' ימים (' + esc(r.earn.date) + ')</div>' : '';
    return '<section class="dp-card"><h3>נתוני החברה <small>' + (s && s.score != null ? 'ציון יסוד ' + s.score + '/100' : '') + '</small></h3>' + ed + '<div class="dp-fgrid">' + tiles + '</div>' + pos + recH + notes + '</section>';
  }
  function newsHtml(r) {
    var n = r.news; if (!n || !n.items || !n.items.length) return '';
    var items = n.items.slice(0, 6).map(function (it) {
      return '<a class="dp-news" href="' + esc(it.url || '#') + '" target="_blank" rel="noopener"><i class="' + (it.sentiment > 0.2 ? 'pos' : it.sentiment < -0.2 ? 'neg' : '') + '"></i><div><b>' + esc(it.headline) + '</b><small>' + esc(it.source || '') + (it.t ? ' · ' + new Date(it.t).toLocaleDateString('he-IL') : '') + '</small></div></a>';
    }).join('');
    return '<section class="dp-card"><h3>חדשות <small>אווירה: ' + n.label + '</small></h3>' + items + '</section>';
  }
  function aiHtml(r, m) {
    var t = r.ai[m.mode];
    return '<section class="dp-card"><h3>הסבר בעברית</h3>' + (t ? '<div class="dp-ai">' + esc(t).replace(/\n/g, '<br>') + '</div>' : '<button class="btn ghost" id="dpAi">סיכום בעברית</button>') + '</section>';
  }

  function paint() {
    var host = $q('#dpOut'); if (!host) return;
    var bar = $q('#dpBar'); if (bar) bar.style.display = DEEP.busy ? '' : 'none';
    var go = $q('#dpGo'); if (go) { go.disabled = DEEP.busy; go.textContent = DEEP.busy ? 'מנתח…' : 'נתח'; }
    var msg = $q('#dpMsg'); if (msg) msg.textContent = DEEP.msg || (DEEP.res ? '' : (hasData() ? 'הקלד טיקר ולחץ נתח. הניתוח הראשון לוקח כדקה, בגלל מגבלת קצב של ספק הנתונים.' : 'חסרים מפתחות. פתח הגדרות (⚙️) והוסף Twelve Data ו-Finnhub.'));
    var r = DEEP.res;
    if (!r) { host.innerHTML = DEEP.busy ? '<div class="dp-skel"><i></i><i></i><i></i></div>' : ''; return; }
    var m = r.modes[DEEP.mode];
    host.innerHTML = heroHtml(r, m) + regimeHtml(r) + uniHtml(m) + planHtml(r, m) + gatesHtml(m) + (window.DeepCtx ? DeepCtx.html(r) : '') + (DEEP.mode === 'day' ? dayHtml(r) : trendHtml(r) + (DEEP.mode === 'long' ? qualityHtml(r) : '')) + prosRisksHtml(m) + mtfHtml(m) + btHtml(r) + compHtml(m) + levelsHtml(m) + fundHtml(r) + newsHtml(r) + aiHtml(r, m) +
      '<div class="dp-foot">נוצר ' + new Date(r.at).toLocaleTimeString('he-IL') + '. כלי עזר אישי ולא ייעוץ השקעות. כל החלטה וכל הוראה באחריותך.</div>';
    $q('#dpOut').querySelectorAll('.dp-card,.dp-hero').forEach(function (el, i) { el.style.animationDelay = (i * 55) + 'ms'; });
    host.querySelectorAll('.dp-chip').forEach(function (b) { b.onclick = function () { DEEP.mode = b.dataset.mode; paint(); }; });
    var cv = $q('#dpChart'); if (cv && m.plan) { var tf = m.plan.tf; drawChart(cv, r.bars[tf] || [], m.plan, m.base); }
    var sv = $q('#dpSave'); if (sv) sv.onclick = function () { saveTrade(r, m); };
    var cp = $q('#dpCopy'); if (cp) cp.onclick = function () { copyPlan(r, m); };
    var cb = $q('#dpChartBtn'); if (cb) cb.onclick = function () { goPage('p-today'); onEnter('p-today'); loadChart(r.sym === 'BTC/USD' ? 'BTC' : r.sym); };
    if (window.DeepCtx) DeepCtx.bind();
    var cc = $q('#dpCalcBtn'); if (cc) cc.onclick = function () { var pl = m.plan; openCalc({ sym: r.sym.replace('/USD', ''), entry: pl.entry, stop: pl.stop, atr: pl.atr, type: r.sym.indexOf('/') >= 0 ? 'crypto' : 'stock' }); };
    var lb = $q('#dpLvl'); if (lb) lb.onclick = function () { addLevelsFromAnalysis(r, DEEP.mode); };
    var ab = $q('#dpAi'); if (ab) ab.onclick = function () { aiSummary(r, m); };
    host.querySelectorAll('[data-count]').forEach(function (el) { countUp(el, +el.dataset.count); });
  }
  function countUp(el, to) { var t0 = performance.now(), d = 900; (function f(t) { var k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e); if (k < 1) requestAnimationFrame(f); })(t0); }

  /* ---------- פעולות ---------- */
  function planText(r, m) {
    var p = m.plan; if (!p) return '';
    return r.sym + ' · ' + MODES[m.mode] + ' · ' + p.side + '\nכניסה $' + px(p.entry) + '\nסטופ $' + px(p.stop) + '\nיעד 1 $' + px(p.t1) + ' (2R)\nיעד 2 $' + px(p.t2) + ' (3R)\nכמות ' + p.qty + ' · סיכון $' + num(p.riskUsd, 0) + '\nציון כניסה ' + verdictOf(m).entry + '. ' + verdictOf(m).headline;
  }
  function copyPlan(r, m) { var t = planText(r, m); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('התוכנית הועתקה'); }).catch(function () { toast('לא ניתן להעתיק'); }); }
  async function saveTrade(r, m) {
    var p = m.plan; if (!p) return;
    if (!p.qty) return toast('הכמות 0. הגדר סיכון $ בהגדרות או הדק סטופ');
    var tk = r.sym.replace('/USD', ''), dir = p.dir, why = m.ex.pros.slice(0, 4);
    var tr = { id: 't' + Date.now(), mode: MODE, ticker: tk, dir: dir, status: 'planned', created: Date.now(), horizon: m.mode,
      plan: { entry: p.entry, stop: p.stop, tp: [p.t1, p.t2], condition: verdictOf(m).headline, reasons: why, pattern: verdictOf(m).headline, bias: m.ex.stance, invalidation: (dir === 'long' ? 'סגירה מתחת ל-' : 'סגירה מעל ') + px(p.stop), analysts: null, news_context: r.news ? r.news.label : null },
      sizing: { entry: p.entry, stop: p.stop, qty: p.qty, risk: Math.round(p.riskUsd), riskPct: S.acct > 0 ? p.riskUsd / S.acct * 100 : 0, pos: Math.round(p.posUsd) }, imgs: { chart: null }, qty: p.qty, entryPrice: null,
      log: [{ t: Date.now(), type: 'ניתוח מלא', note: planText(r, m) }] };
    D.trades.push(tr);
    var pl = D.plans.find(function (x) { return x.ticker === tk; });
    if (!pl) { pl = { id: tk.toLowerCase() + Date.now(), ticker: tk, cls: '', checks: [['סטופ מוגדר לפני כניסה', false], ['גודל פוזיציה חושב לפי סיכון', true]] }; D.plans.push(pl); }
    Object.assign(pl, { status: (dir === 'long' ? 'לונג' : 'שורט') + ' – מתוכנן', qty: p.qty, entry: p.entry, stop: p.stop, tp1: p.t1, tp2: p.t2, tp3: 0, rules: m.ex.headline + '\nביטול: ' + tr.plan.invalidation });
    await save(); renderPlans(); renderTrades(); goPage('p-journal'); onEnter('p-journal'); showSub('trades'); toast('נשמר ביומן כעסקה מתוכננת');
  }
  async function aiSummary(r, m) {
    var b = $q('#dpAi'); if (b) { b.disabled = true; b.textContent = 'מסכם…'; }
    var data = { symbol: r.sym, horizon: MODES[m.mode], score: verdictOf(m).entry, stance: verdictOf(m).stance, headline: verdictOf(m).headline, unified: m.uni && m.uni.parts.map(function (p) { return { part: p.label, value: p.v, weight: p.w }; }), plan: m.plan && { side: m.plan.side, entry: m.plan.entry, stop: m.plan.stop, tp1: m.plan.t1, tp2: m.plan.t2, rr1: m.plan.rr1, qty: m.plan.qty, hypothetical: m.plan.hypothetical },
      pros: m.ex.pros, risks: m.ex.risks, gates: m.gates.items.map(function (x) { return { label: x.label, ok: x.ok }; }), fundamentals: r.fs && { score: r.fs.score, notes: r.fs.notes.map(function (n) { return n.t; }) }, daysToEarnings: r.days, newsMood: r.news && r.news.label, context: r.ctx && r.ctx.ai && !r.ctx.ai.err ? { bias: r.ctx.ai.bias, reason: r.ctx.ai.bias_reason, macro: (r.ctx.ai.macro || []).map(function (x) { return x.point; }), sector: (r.ctx.ai.sector || []).map(function (x) { return x.point; }), company: (r.ctx.ai.company || []).map(function (x) { return x.point; }), analysts: (r.ctx.ai.analysts || []).map(function (x) { return x.point; }), events: (r.ctx.ai.events || []).map(function (x) { return x.point; }) } : null };
    try {
      var out = await claude([{ role: 'user', content: 'נתוני הניתוח (JSON):\n' + JSON.stringify(data) }], { tier: 'cheap', max_tokens: 700,
        system: 'אתה מסביר ניתוח מסחר בעברית פשוטה וקצרה. השתמש רק במספרים ובעובדות שבנתונים. אם יש שדה context, הזכר בקצרה את המאקרו, הסקטור והחדשות שבו. אסור להמציא מחירים, יעדים או עובדות. מבנה: משפט פתיחה עם ההחלטה, אחר כך "למה" ב-3 נקודות, אחר כך "מה יבטל את התרחיש", ובסוף "מה לעשות עכשיו". בלי סימני עיצוב מיוחדים ובלי כותרות.' });
      r.ai[m.mode] = out;
    } catch (e) { toast('הסיכום נכשל: ' + e.message); }
    paint();
  }

  /* ---------- מסך ---------- */
  function build() {
    if ($q('#p-deep')) return;
    var sec = document.createElement('section'); sec.className = 'page'; sec.id = 'p-deep';
    sec.innerHTML = '<div class="dp-search"><div class="dp-inp"><span>🔍</span><input id="dpQ" list="dpList" placeholder="טיקר או שם חברה: MU, MSTR, NVDA…" autocomplete="off" autocapitalize="characters"><datalist id="dpList"></datalist></div>' +
      '<div class="dp-seg" id="dpSeg">' + Object.keys(MODES).map(function (k) { return '<button data-m="' + k + '" class="' + (k === DEEP.mode ? 'on' : '') + '">' + MODES[k] + '</button>'; }).join('') + '</div>' +
      '<button class="btn" id="dpGo">נתח</button></div><div id="dpSug" class="dp-sug"></div><div class="dp-prog" id="dpBar" style="display:none"><i></i></div><div class="dp-msg" id="dpMsg"></div><div id="dpOut"></div>';
    document.querySelector('main').appendChild(sec);
    var q = $q('#dpQ');
    $q('#dpGo').onclick = function () { run(q.value); };
    q.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); run(q.value); } };
    $q('#dpSeg').querySelectorAll('button').forEach(function (b) { b.onclick = function () { DEEP.mode = b.dataset.m; $q('#dpSeg').querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); if (DEEP.res) paint(); }; });
    var tm = null;
    q.oninput = function () {
      clearTimeout(tm); var v = q.value.trim(); DEEP.q = v; if (v.length < 2 || DEEP.busy || !S.td || /^[A-Za-z.\/-]{1,5}$/.test(v)) { $q('#dpSug').innerHTML = ''; return; }
      tm = setTimeout(function () { client().search(v).then(function (list) { if (q.value.trim() !== v) return; $q('#dpSug').innerHTML = list.slice(0, 5).map(function (x) { return '<button data-pick="' + esc(x.symbol) + '">' + esc(x.symbol) + ' · ' + esc((x.name || '').slice(0, 26)) + '</button>'; }).join(''); $q('#dpSug').querySelectorAll('button').forEach(function (b) { b.onclick = function () { q.value = b.dataset.pick; $q('#dpSug').innerHTML = ''; run(b.dataset.pick); }; }); }).catch(function () { }); }, 450);
    };
    paint();
  }
  function fillList() {
    var dl = $q('#dpList'); if (!dl || !D || !D.watch) return; var seen = {}, h = '';
    D.watch.forEach(function (w) { w.items.forEach(function (t) { if (!seen[t]) { seen[t] = 1; h += '<option value="' + esc(t) + '">'; } }); }); dl.innerHTML = h;
  }
  window.openDeep = function (sym) { build(); goPage('p-deep'); onEnter('p-deep'); var q = $q('#dpQ'); if (sym) { q.value = sym; run(sym); } };

  /* חיבור לניווט הקיים */
  GROUPS.trade.splice(1, 0, ['p-deep', 'ניתוח']); PAGE_GROUP['p-deep'] = 'trade';
  var _enter = onEnter;
  onEnter = function (id) { _enter(id); if (id === 'p-deep') { build(); var q = $q('#dpQ'); if (q && !q.value) q.value = curSym === 'BTC' ? 'BTC/USD' : curSym; fillList(); paint(); } };
  /* כפתור "ניתוח מלא" בסרגל הגרף */
  var snap = document.getElementById('snap');
  if (snap && !document.getElementById('deepBtn')) { var b = document.createElement('button'); b.className = 'btn small'; b.id = 'deepBtn'; b.textContent = 'ניתוח'; b.onclick = function () { openDeep(curSym === 'BTC' ? 'BTC/USD' : curSym); }; snap.parentNode.insertBefore(b, snap); }
  build();
  window.__deep = { headlines: headlines, unify: unify, mkPlan: mkPlan, uniFor: uniFor, verdictOf: verdictOf, repaint: function () { paint(); }, getClient: client, trendTemplate: trendTemplate, regimeOf: regimeOf, dayLevels: dayLevels, orbPlan: orbPlan, quality: quality, E: E, buildMode: buildMode, fundScore: fundScore, state: DEEP, run: run };
})();
