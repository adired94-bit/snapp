/* מנוע ניתוח משותף עם AlphaTerminal Pro: אינדיקטורים, תבניות נרות, אזורים, שקלול רב-טווחי, לקוח נתונים ושערי הסשן */
// AlphaTerminal Pro - ליבת חישוב (שלב ראשון). בלי תלות בדפדפן, כדי שאפשר יהיה לבדוק אותה.
(function (root) {
  var MODES = {
    day:   { label: 'יומי',       interval: '5min',  mult: 1.25, riskPct: 0.5 },
    swing: { label: 'סווינג',     interval: '1day',  mult: 1.5,  riskPct: 1 },
    long:  { label: 'טווח ארוך',  interval: '1week', mult: 2.5,  riskPct: 1 }
  };

  var DEFAULTS = {
    equity: 0, dailyCapR: 2, weeklyCapR: 5, tiltMinutes: 30, revengeMinutes: 2,
    groupLimitPct: 1.5, totalLimitPct: 3, minRR: 2
  };

  // נכסים שזזים יחד נחשבים כקבוצה אחת לחשיפה מצטברת
  var GROUPS = { 'ביטקוין': ['MSTR', 'COIN', 'MARA', 'IBIT', 'RIOT', 'CLSK', 'FBTC', 'GBTC', 'BTC', 'BTC/USD'] };

  function groupOf(sym) {
    sym = String(sym || '').toUpperCase().trim();
    for (var g in GROUPS) { if (GROUPS[g].indexOf(sym) >= 0) return g; }
    return sym;
  }

  // bars: מהישן לחדש, כל אחד {h,l,c}. החלקת וילדר.
  function atr(bars, p) {
    p = p || 14;
    if (!bars || bars.length < p + 1) return null;
    var tr = [];
    for (var i = 1; i < bars.length; i++) {
      var b = bars[i], pc = bars[i - 1].c;
      tr.push(Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)));
    }
    var a = 0;
    for (var j = 0; j < p; j++) a += tr[j];
    a /= p;
    for (var k = p; k < tr.length; k++) a = (a * (p - 1) + tr[k]) / p;
    return a;
  }

  // סטופ במרחק כפולת ATR, יעד ראשון 2R ושני 3R
  function levels(dir, entry, atrV, mult) {
    var d = dir === 'short' ? -1 : 1, risk = atrV * mult;
    return { stop: entry - d * risk, t1: entry + d * 2 * risk, t2: entry + d * 3 * risk };
  }

  function size(equity, riskPct, entry, stop) {
    var per = Math.abs(entry - stop);
    if (!(equity > 0) || !(per > 0) || !(riskPct > 0)) return { qty: 0, riskUsd: 0, budget: 0, perShare: per || 0 };
    var budget = equity * riskPct / 100;
    var qty = Math.floor(budget / per);
    return { qty: qty, riskUsd: qty * per, budget: budget, perShare: per };
  }

  function rMultiple(t, exit) {
    var d = t.dir === 'short' ? -1 : 1, risk = Math.abs(t.entry - t.stop);
    return risk > 0 ? d * (exit - t.entry) / risk : 0;
  }

  function startOfDay(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function startOfWeek(ms) { // שבוע מסחר מתחיל ביום שני
    var d = new Date(startOfDay(ms)), day = d.getDay(); // 0=ראשון
    var back = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - back);
    return d.getTime();
  }

  function sumR(closed, from) {
    var s = 0;
    for (var i = 0; i < closed.length; i++) if (closed[i].closedAt >= from) s += closed[i].r || 0;
    return s;
  }

  // מצב סיכון: נעילות והתראות לפי העסקאות שנסגרו
  function riskState(trades, now, s) {
    s = Object.assign({}, DEFAULTS, s || {});
    var closed = trades.filter(function (t) { return t.closedAt; })
      .sort(function (a, b) { return a.closedAt - b.closedAt; });
    var dayStart = startOfDay(now), weekStart = startOfWeek(now);
    var dayR = sumR(closed, dayStart), weekR = sumR(closed, weekStart);
    var out = { locked: false, reason: '', until: 0, dayR: dayR, weekR: weekR, warns: [] };

    function lock(reason, until) {
      if (!out.locked || until > out.until) { out.locked = true; out.reason = reason; out.until = until; }
    }

    if (dayR <= -s.dailyCapR) lock('תקרת ההפסד היומית הושגה (' + dayR.toFixed(2) + 'R)', dayStart + 86400000);
    else if (dayR <= -0.8 * s.dailyCapR) out.warns.push('ההפסד היומי הגיע ל-80% מהתקרה');

    if (weekR <= -s.weeklyCapR) {
      var wk = new Date(weekStart); wk.setDate(wk.getDate() + 7);
      lock('תקרת ההפסד השבועית הושגה (' + weekR.toFixed(2) + 'R)', wk.getTime());
    }

    var today = closed.filter(function (t) { return t.closedAt >= dayStart; });
    var last = today[today.length - 1], prev = today[today.length - 2];
    if (last && prev && last.r < 0 && prev.r < 0) {
      var until = last.closedAt + s.tiltMinutes * 60000;
      if (now < until) lock('שני סטופים ברצף: הפסקה של ' + s.tiltMinutes + ' דקות', until);
    }
    if (last && last.r < 0) {
      var u2 = last.closedAt + s.revengeMinutes * 60000;
      if (now < u2) lock('עסקה חדשה מיד אחרי הפסד: המתן ' + s.revengeMinutes + ' דקות', u2);
    }

    var guessesToday = trades.filter(function (t) { return t.openedAt >= dayStart && t.guess; }).length;
    if (guessesToday >= 3) out.warns.push('שלוש כניסות מסומנות כניחוש היום: בדוק את הסט-אפ לפני הבאה');
    return out;
  }

  function openRisk(trades, group) {
    var s = 0;
    trades.forEach(function (t) {
      if (t.closedAt) return;
      if (group && groupOf(t.sym) !== group) return;
      s += t.riskUsd || 0;
    });
    return s;
  }

  // שערי כניסה: הכפתור נפתח רק כשכולם עוברים
  function gates(inp) {
    var s = Object.assign({}, DEFAULTS, inp.settings || {});
    var d = inp.dir === 'short' ? -1 : 1;
    var e = +inp.entry, st = +inp.stop, t1 = +inp.t1;
    var list = [];
    function add(ok, label, detail) { list.push({ ok: !!ok, label: label, detail: detail || '' }); }

    var stopOk = e > 0 && st > 0 && (e - st) * d > 0;
    add(stopOk, 'סטופ מוגדר ובצד הנכון', stopOk ? '' : (inp.dir === 'short' ? 'בשורט הסטופ מעל הכניסה' : 'בלונג הסטופ מתחת לכניסה'));
    var t1Ok = e > 0 && t1 > 0 && (t1 - e) * d > 0;
    add(t1Ok, 'יעד ראשון מוגדר ובצד הנכון', t1Ok ? '' : 'חסר יעד או שהוא בכיוון הלא נכון');
    var rr = stopOk && t1Ok ? Math.abs(t1 - e) / Math.abs(e - st) : 0;
    // עיגול לשתי ספרות, כדי שיעד של 2R שעבר עיגול מחיר לא ייחסם בטעות
    add(Math.round(rr * 100) / 100 >= s.minRR, 'יחס סיכוי לסיכון לפחות ' + s.minRR, 'כרגע ' + rr.toFixed(2));
    add(inp.guess || (inp.setup && inp.setup.length > 0), 'נבחר סט-אפ או סומן ניחוש', inp.guess ? 'הכניסה תיספר כניחוש ביומן' : '');
    add(inp.emotion >= 1 && inp.emotion <= 5, 'דורג מצב רגשי');
    var sz = size(s.equity, inp.riskPct, e, st);
    add(s.equity > 0 && sz.qty >= 1, 'הוזן הון והכמות המחושבת לפחות 1', s.equity > 0 ? (sz.qty < 1 ? 'הסטופ רחוק מדי לתקציב הסיכון' : '') : 'הזן הון בהגדרות');

    var rs = inp.risk;
    add(!rs.locked, 'אין נעילת סיכון פעילה', rs.locked ? rs.reason : '');

    var grp = groupOf(inp.sym);
    var gRisk = openRisk(inp.trades || [], grp) + sz.riskUsd;
    var tRisk = openRisk(inp.trades || [], null) + sz.riskUsd;
    var gMax = s.equity * s.groupLimitPct / 100, tMax = s.equity * s.totalLimitPct / 100;
    add(s.equity > 0 && gRisk <= gMax + 1e-9, 'חשיפה לקבוצה "' + grp + '" בגבול ' + s.groupLimitPct + '%', 'סיכון מצטבר ' + gRisk.toFixed(0) + ' מתוך ' + gMax.toFixed(0));
    add(s.equity > 0 && tRisk <= tMax + 1e-9, 'סיכון פתוח כולל בגבול ' + s.totalLimitPct + '%', 'סיכון מצטבר ' + tRisk.toFixed(0) + ' מתוך ' + tMax.toFixed(0));

    return { items: list, ok: list.every(function (x) { return x.ok; }), rr: rr, size: sz };
  }

  var api = { MODES: MODES, DEFAULTS: DEFAULTS, groupOf: groupOf, atr: atr, levels: levels, size: size,
    rMultiple: rMultiple, riskState: riskState, openRisk: openRisk, gates: gates, startOfDay: startOfDay, startOfWeek: startOfWeek };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AT = api;
})(typeof window !== 'undefined' ? window : globalThis);


// אינדיקטורים. נרות: {t,o,h,l,c,v}. כל הפונקציות מחזירות מערכים באורך הקלט, עם null בתחילה.
(function (root) {
  var AT = root.AT = root.AT || {};

  function sma(a, p) {
    var out = new Array(a.length).fill(null), s = 0;
    for (var i = 0; i < a.length; i++) { s += a[i]; if (i >= p) s -= a[i - p]; if (i >= p - 1) out[i] = s / p; }
    return out;
  }
  function ema(a, p) {
    var out = new Array(a.length).fill(null);
    if (a.length < p) return out;
    var k = 2 / (p + 1), e = 0, i;
    for (i = 0; i < p; i++) e += a[i];
    e /= p; out[p - 1] = e;
    for (i = p; i < a.length; i++) { e = a[i] * k + e * (1 - k); out[i] = e; }
    return out;
  }
  function rsi(c, p) {
    p = p || 14;
    var out = new Array(c.length).fill(null);
    if (c.length <= p) return out;
    var g = 0, l = 0, i, d;
    for (i = 1; i <= p; i++) { d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
    g /= p; l /= p;
    out[p] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (i = p + 1; i < c.length; i++) {
      d = c[i] - c[i - 1];
      g = (g * (p - 1) + (d > 0 ? d : 0)) / p;
      l = (l * (p - 1) + (d < 0 ? -d : 0)) / p;
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return out;
  }
  function macd(c, f, s, sg) {
    f = f || 12; s = s || 26; sg = sg || 9;
    var ef = ema(c, f), es = ema(c, s), n = c.length;
    var line = new Array(n).fill(null), signal = new Array(n).fill(null), hist = new Array(n).fill(null);
    var first = -1, i;
    for (i = 0; i < n; i++) if (ef[i] != null && es[i] != null) { line[i] = ef[i] - es[i]; if (first < 0) first = i; }
    if (first >= 0) {
      var comp = line.slice(first), es2 = ema(comp, sg);
      for (i = 0; i < comp.length; i++) if (es2[i] != null) { signal[first + i] = es2[i]; hist[first + i] = line[first + i] - es2[i]; }
    }
    return { macd: line, signal: signal, hist: hist };
  }
  function bollinger(c, p, k) {
    p = p || 20; k = k || 2;
    var n = c.length, up = new Array(n).fill(null), lo = up.slice(), mid = up.slice(), pctB = up.slice(), bw = up.slice();
    for (var i = p - 1; i < n; i++) {
      var m = 0, j;
      for (j = i - p + 1; j <= i; j++) m += c[j];
      m /= p;
      var v = 0;
      for (j = i - p + 1; j <= i; j++) v += (c[j] - m) * (c[j] - m);
      var sd = Math.sqrt(v / p);
      mid[i] = m; up[i] = m + k * sd; lo[i] = m - k * sd;
      pctB[i] = up[i] === lo[i] ? 0.5 : (c[i] - lo[i]) / (up[i] - lo[i]);
      bw[i] = m ? (up[i] - lo[i]) / m : null;
    }
    return { mid: mid, upper: up, lower: lo, pctB: pctB, bw: bw };
  }
  // ATR בהחלקת וילדר. האינדקס p הוא הראשון עם ערך.
  function atrSeries(bars, p) {
    p = p || 14;
    var n = bars.length, out = new Array(n).fill(null);
    if (n < p + 1) return out;
    var tr = [0], i;
    for (i = 1; i < n; i++) {
      var b = bars[i], pc = bars[i - 1].c;
      tr.push(Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)));
    }
    var a = 0;
    for (i = 1; i <= p; i++) a += tr[i];
    a /= p; out[p] = a;
    for (i = p + 1; i < n; i++) { a = (a * (p - 1) + tr[i]) / p; out[i] = a; }
    return out;
  }
  function lastAtr(bars, p) { var s = atrSeries(bars, p); return s.length ? s[s.length - 1] : null; }

  var _fmt = null;
  function nyDay(t) {
    if (!_fmt) _fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
    return _fmt.format(new Date(t));
  }
  // VWAP מעוגן מאינדקס מסוים
  function vwapAnchored(bars, from) {
    var out = new Array(bars.length).fill(null), pv = 0, vv = 0;
    for (var i = Math.max(0, from || 0); i < bars.length; i++) {
      var b = bars[i], tp = (b.h + b.l + b.c) / 3, v = b.v > 0 ? b.v : 1;
      pv += tp * v; vv += v; out[i] = pv / vv;
    }
    return out;
  }
  // VWAP יומי שמתאפס בכל יום מסחר (לטווחים תוך-יומיים)
  function vwapSession(bars) {
    var out = new Array(bars.length).fill(null), pv = 0, vv = 0, day = null;
    for (var i = 0; i < bars.length; i++) {
      var b = bars[i], d = nyDay(b.t);
      if (d !== day) { day = d; pv = 0; vv = 0; }
      var tp = (b.h + b.l + b.c) / 3, v = b.v > 0 ? b.v : 1;
      pv += tp * v; vv += v; out[i] = pv / vv;
    }
    return out;
  }
  var RIBBON = [8, 13, 21, 34, 55, 89];
  function ribbon(c, periods) {
    periods = periods || RIBBON;
    return periods.map(function (p) { return { p: p, v: ema(c, p) }; });
  }
  // סדר הרצועה: +1 כשהמהירים מעל האיטיים, -1 להפך, 0 מעורב
  function ribbonState(rb, i) {
    var vals = rb.map(function (r) { return r.v[i]; });
    if (vals.some(function (x) { return x == null; })) {
      vals = vals.filter(function (x) { return x != null; });
      if (vals.length < 3) return { order: 0, width: 0, n: vals.length };
    }
    var bull = 0, bear = 0;
    for (var k = 0; k < vals.length - 1; k++) { if (vals[k] > vals[k + 1]) bull++; else if (vals[k] < vals[k + 1]) bear++; }
    var pairs = vals.length - 1;
    return { order: (bull - bear) / pairs, width: (Math.max.apply(null, vals) - Math.min.apply(null, vals)), n: vals.length };
  }
  function rvol(bars, i, p) {
    p = p || 20;
    if (i < p) return null;
    var s = 0;
    for (var j = i - p; j < i; j++) s += bars[j].v || 0;
    s /= p;
    return s > 0 ? (bars[i].v || 0) / s : null;
  }
  // פיבוטים: שיא מקומי גבוה מ-k נרות בכל צד
  function pivots(bars, k) {
    k = k || 3;
    var highs = [], lows = [];
    for (var i = k; i < bars.length - k; i++) {
      var hi = true, lo = true;
      for (var j = 1; j <= k; j++) {
        if (!(bars[i].h > bars[i - j].h) || !(bars[i].h >= bars[i + j].h)) hi = false;
        if (!(bars[i].l < bars[i - j].l) || !(bars[i].l <= bars[i + j].l)) lo = false;
      }
      if (hi) highs.push(i);
      if (lo) lows.push(i);
    }
    return { highs: highs, lows: lows };
  }
  // סטיית RSI: מחיר עושה שיא/שפל חדש וה-RSI לא
  function divergence(bars, rsiArr, k, lookback) {
    k = k || 3; lookback = lookback || 60;
    var n = bars.length, from = Math.max(0, n - lookback);
    var pv = pivots(bars, k), res = null;
    var hs = pv.highs.filter(function (i) { return i >= from && rsiArr[i] != null; });
    var ls = pv.lows.filter(function (i) { return i >= from && rsiArr[i] != null; });
    if (hs.length >= 2) {
      var h1 = hs[hs.length - 2], h2 = hs[hs.length - 1];
      if (bars[h2].h > bars[h1].h && rsiArr[h2] < rsiArr[h1] - 1) res = { type: 'bear', idx: h2, from: h1 };
    }
    if (ls.length >= 2) {
      var l1 = ls[ls.length - 2], l2 = ls[ls.length - 1];
      if (bars[l2].l < bars[l1].l && rsiArr[l2] > rsiArr[l1] + 1) {
        if (!res || l2 > res.idx) res = { type: 'bull', idx: l2, from: l1 };
      }
    }
    if (res && n - 1 - res.idx > 25) return null;
    return res;
  }

  AT.ind = { sma: sma, ema: ema, rsi: rsi, macd: macd, bollinger: bollinger, atrSeries: atrSeries, lastAtr: lastAtr, vwapAnchored: vwapAnchored,
    vwapSession: vwapSession, ribbon: ribbon, ribbonState: ribbonState, rvol: rvol, pivots: pivots, divergence: divergence, nyDay: nyDay, RIBBON: RIBBON };
  if (typeof module !== 'undefined' && module.exports) module.exports = AT.ind;
})(typeof window !== 'undefined' ? window : globalThis);

// תבניות נרות (סטיב ניסון) ופעולת מחיר (אל ברוקס)
(function (root) {
  var AT = root.AT = root.AT || {};
  var ind = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./indicators.js') : AT.ind;

  function body(b) { return Math.abs(b.c - b.o); }
  function rng(b) { return b.h - b.l; }
  function top(b) { return Math.max(b.o, b.c); }
  function bot(b) { return Math.min(b.o, b.c); }
  function upSh(b) { return b.h - top(b); }
  function loSh(b) { return bot(b) - b.l; }
  function bull(b) { return b.c > b.o; }
  function bear(b) { return b.c < b.o; }
  // הקשר מגמה קצר: סגירה מול 5 נרות אחורה
  function ctx(bars, i) { if (i < 5) return 0; var d = bars[i].c - bars[i - 5].c; return d > 0 ? 1 : d < 0 ? -1 : 0; }

  // תבניות נרות בנר i (ובנרות הקודמים לו). strength 1 עד 3.
  function candles(bars, i) {
    if (i == null) i = bars.length - 1;
    var out = [];
    if (i < 2) return out;
    var b = bars[i], p = bars[i - 1], pp = bars[i - 2], t = ctx(bars, i - 1), R = rng(b);
    function add(key, name, dir, strength) { out.push({ key: key, name: name, dir: dir, strength: strength, idx: i }); }
    if (R > 0 && body(b) <= 0.1 * R) add('doji', 'דוג\'י', 'neutral', 1);
    if (R > 0 && body(b) > 0) {
      if (loSh(b) >= 2 * body(b) && upSh(b) <= 0.15 * R) {
        if (t < 0) add('hammer', 'פטיש', 'bull', 2); else if (t > 0) add('hanging', 'איש תלוי', 'bear', 1);
      }
      if (upSh(b) >= 2 * body(b) && loSh(b) <= 0.15 * R) {
        if (t > 0) add('star', 'כוכב נופל', 'bear', 2); else if (t < 0) add('invhammer', 'פטיש הפוך', 'bull', 1);
      }
    }
    if (bear(p) && bull(b) && b.o <= p.c && b.c >= p.o && body(b) > body(p)) add('bullengulf', 'בליעה שורית', 'bull', t < 0 ? 3 : 2);
    if (bull(p) && bear(b) && b.o >= p.c && b.c <= p.o && body(b) > body(p)) add('bearengulf', 'בליעה דובית', 'bear', t > 0 ? 3 : 2);
    if (body(p) > 0 && bot(b) >= bot(p) && top(b) <= top(p) && body(b) < body(p) * 0.6) {
      if (bear(p) && bull(b) && t < 0) add('bullharami', 'הרמי שורי', 'bull', 1);
      if (bull(p) && bear(b) && t > 0) add('bearharami', 'הרמי דובי', 'bear', 1);
    }
    if (bear(p) && bull(b) && b.o < p.c && b.c > (p.o + p.c) / 2 && b.c < p.o) add('piercing', 'קו חודר', 'bull', 2);
    if (bull(p) && bear(b) && b.o > p.c && b.c < (p.o + p.c) / 2 && b.c > p.o) add('darkcloud', 'ענן שחור', 'bear', 2);
    var smallMid = body(p) <= 0.35 * Math.max(1e-9, body(pp));
    if (bear(pp) && body(pp) > 0 && smallMid && bull(b) && b.c > (pp.o + pp.c) / 2) add('morningstar', 'כוכב בוקר', 'bull', 3);
    if (bull(pp) && body(pp) > 0 && smallMid && bear(b) && b.c < (pp.o + pp.c) / 2) add('eveningstar', 'כוכב ערב', 'bear', 3);
    if (bull(b) && bull(p) && bull(pp) && b.c > p.c && p.c > pp.c && b.o > p.o && p.o > pp.o && b.o < p.c && p.o < pp.c) add('soldiers', 'שלושה חיילים לבנים', 'bull', 3);
    if (bear(b) && bear(p) && bear(pp) && b.c < p.c && p.c < pp.c && b.o < p.o && p.o < pp.o && b.o > p.c && p.o > pp.c) add('crows', 'שלושה עורבים שחורים', 'bear', 3);
    return out;
  }

  // אל ברוקס: נר אות. נר שורי סוגר בשליש העליון, בלי זנב עליון גדול
  function signalBar(bars, i) {
    if (i == null) i = bars.length - 1;
    var b = bars[i], R = rng(b);
    if (!(R > 0)) return null;
    var pos = (b.c - b.l) / R;
    if (bull(b) && pos >= 0.7 && body(b) >= 0.4 * R) return { dir: 'bull', quality: +(body(b) / R).toFixed(2) };
    if (bear(b) && pos <= 0.3 && body(b) >= 0.4 * R) return { dir: 'bear', quality: +(body(b) / R).toFixed(2) };
    return null;
  }
  // מצב שוק: מגמה או טווח. חפיפה גבוהה בין נרות סמוכים מעידה על טווח.
  function marketState(bars, i, atrV) {
    if (i == null) i = bars.length - 1;
    if (i < 25) return { state: 'range', slope: 0 };
    var c = bars.map(function (b) { return b.c; }), e = ind.ema(c, 21);
    var slope = (e[i] != null && e[i - 5] != null && atrV > 0) ? (e[i] - e[i - 5]) / (5 * atrV) : 0;
    var ov = 0;
    for (var j = i - 9; j <= i; j++) {
      var a = bars[j], q = bars[j - 1];
      var inter = Math.min(a.h, q.h) - Math.max(a.l, q.l);
      if (inter > 0.5 * Math.min(rng(a), rng(q))) ov++;
    }
    var state = 'range';
    if (slope > 0.12 && ov <= 6) state = 'trend_up'; else if (slope < -0.12 && ov <= 6) state = 'trend_down';
    return { state: state, slope: slope, overlap: ov };
  }
  // תיקון בשתי רגליים (H2 בעלייה, L2 בירידה): שני שפלים/שיאים יורדים/עולים אחרי שיא/שפל מגמה
  function twoLeg(bars, state) {
    var n = bars.length;
    if (n < 30) return null;
    var pv = ind.pivots(bars.slice(Math.max(0, n - 80)), 2), off = Math.max(0, n - 80);
    var highs = pv.highs.map(function (x) { return x + off; }), lows = pv.lows.map(function (x) { return x + off; });
    if (state === 'trend_up' && highs.length) {
      var H = highs[highs.length - 1];
      var after = lows.filter(function (x) { return x > H; });
      if (after.length >= 2 && bars[after[after.length - 1]].l < bars[after[0]].l && n - 1 - after[after.length - 1] <= 8) return { type: 'H2', legs: after.length, idx: after[after.length - 1] };
    }
    if (state === 'trend_down' && lows.length) {
      var L = lows[lows.length - 1];
      var aft = highs.filter(function (x) { return x > L; });
      if (aft.length >= 2 && bars[aft[aft.length - 1]].h > bars[aft[0]].h && n - 1 - aft[aft.length - 1] <= 8) return { type: 'L2', legs: aft.length, idx: aft[aft.length - 1] };
    }
    return null;
  }
  // פריצה כושלת: פרץ מעל שיא/מתחת לשפל של look נרות וחזר פנימה תוך עד 3 נרות
  function failedBreakout(bars, look) {
    look = look || 20;
    var n = bars.length;
    if (n < look + 5) return null;
    var base = bars.slice(n - 4 - look, n - 3), hi = -Infinity, lo = Infinity, i;
    for (i = 0; i < base.length; i++) { if (base[i].h > hi) hi = base[i].h; if (base[i].l < lo) lo = base[i].l; }
    var last = bars[n - 1], recent = bars.slice(n - 3);
    if (recent.some(function (b) { return b.h > hi; }) && last.c < hi) return { dir: 'bear', level: hi };
    if (recent.some(function (b) { return b.l < lo; }) && last.c > lo) return { dir: 'bull', level: lo };
    return null;
  }

  AT.pat = { candles: candles, signalBar: signalBar, marketState: marketState, twoLeg: twoLeg, failedBreakout: failedBreakout };
  if (typeof module !== 'undefined' && module.exports) module.exports = AT.pat;
})(typeof window !== 'undefined' ? window : globalThis);

// אזורים: פרופיל נפח, פערי מחיר, בלוקים של הכסף החכם, נזילות ורמות תמיכה והתנגדות
(function (root) {
  var AT = root.AT = root.AT || {};
  var ind = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./indicators.js') : AT.ind;

  // פרופיל נפח: הנפח של כל נר מתחלק בין רמות המחיר שהוא נגע בהן
  function volumeProfile(bars, bins, lookback) {
    bins = bins || 24; lookback = lookback || 120;
    var sl = bars.slice(Math.max(0, bars.length - lookback));
    if (sl.length < 5) return null;
    var lo = Infinity, hi = -Infinity, i, j;
    for (i = 0; i < sl.length; i++) { if (sl[i].l < lo) lo = sl[i].l; if (sl[i].h > hi) hi = sl[i].h; }
    if (!(hi > lo)) return null;
    var step = (hi - lo) / bins, vol = new Array(bins).fill(0);
    for (i = 0; i < sl.length; i++) {
      var b = sl[i], v = b.v > 0 ? b.v : 1, r = b.h - b.l;
      var a = Math.max(0, Math.min(bins - 1, Math.floor((b.l - lo) / step)));
      var z = Math.max(0, Math.min(bins - 1, Math.floor((b.h - lo) / step)));
      if (r <= 0 || a === z) { vol[a] += v; continue; }
      for (j = a; j <= z; j++) {
        var bl = lo + j * step, bh = bl + step;
        var ov = Math.min(b.h, bh) - Math.max(b.l, bl);
        if (ov > 0) vol[j] += v * ov / r;
      }
    }
    var tot = vol.reduce(function (x, y) { return x + y; }, 0);
    var pocI = 0;
    for (j = 1; j < bins; j++) if (vol[j] > vol[pocI]) pocI = j;
    // אזור ערך: 70% מהנפח סביב ה-POC
    var inc = vol[pocI], L = pocI, H = pocI;
    while (inc < 0.7 * tot && (L > 0 || H < bins - 1)) {
      var dn = L > 0 ? vol[L - 1] : -1, up = H < bins - 1 ? vol[H + 1] : -1;
      if (up >= dn) { H++; inc += vol[H]; } else { L--; inc += vol[L]; }
    }
    var mean = tot / bins, lvns = [];
    for (j = 1; j < bins - 1; j++) if (vol[j] < 0.5 * mean && vol[j] <= vol[j - 1] && vol[j] <= vol[j + 1]) lvns.push(lo + (j + 0.5) * step);
    return { lo: lo, hi: hi, step: step, vol: vol, poc: lo + (pocI + 0.5) * step, val: lo + L * step, vah: lo + (H + 1) * step, lvns: lvns, max: Math.max.apply(null, vol) };
  }

  // פערי מחיר פתוחים (FVG): שלושה נרות שבהם הנר הראשון והשלישי לא חופפים
  function fvg(bars, atrArr, maxAge) {
    maxAge = maxAge || 80;
    var out = [], n = bars.length;
    for (var i = Math.max(2, n - maxAge); i < n; i++) {
      var a = atrArr && atrArr[i] ? atrArr[i] : null;
      var minSize = a ? 0.1 * a : 0;
      var z = null;
      if (bars[i].l > bars[i - 2].h && bars[i].l - bars[i - 2].h >= minSize) z = { dir: 'bull', lo: bars[i - 2].h, hi: bars[i].l, idx: i, kind: 'fvg' };
      else if (bars[i].h < bars[i - 2].l && bars[i - 2].l - bars[i].h >= minSize) z = { dir: 'bear', lo: bars[i].h, hi: bars[i - 2].l, idx: i, kind: 'fvg' };
      if (!z) continue;
      var filled = false;
      for (var j = i + 1; j < n; j++) {
        if (z.dir === 'bull' && bars[j].l <= z.lo) { filled = true; break; }
        if (z.dir === 'bear' && bars[j].h >= z.hi) { filled = true; break; }
      }
      if (!filled) out.push(z);
    }
    return out;
  }

  // בלוקים של הכסף החכם: הנר ההפוך האחרון לפני תנועה חזקה ששוברת מבנה
  function orderBlocks(bars, atrArr, maxAge) {
    maxAge = maxAge || 100;
    var out = [], n = bars.length;
    for (var i = Math.max(11, n - maxAge); i < n; i++) {
      var a = atrArr && atrArr[i];
      if (!a) continue;
      var b = bars[i], bodyB = Math.abs(b.c - b.o), z = null, j, k;
      if (b.c > b.o && bodyB >= 1.5 * a) {
        var ph = -Infinity;
        for (j = i - 10; j < i; j++) if (bars[j].h > ph) ph = bars[j].h;
        if (b.c > ph) {
          for (k = i - 1; k >= Math.max(0, i - 6); k--) if (bars[k].c < bars[k].o) { z = { dir: 'bull', lo: bars[k].l, hi: bars[k].h, idx: k, kind: 'ob' }; break; }
        }
      } else if (b.c < b.o && bodyB >= 1.5 * a) {
        var pl = Infinity;
        for (j = i - 10; j < i; j++) if (bars[j].l < pl) pl = bars[j].l;
        if (b.c < pl) {
          for (k = i - 1; k >= Math.max(0, i - 6); k--) if (bars[k].c > bars[k].o) { z = { dir: 'bear', lo: bars[k].l, hi: bars[k].h, idx: k, kind: 'ob' }; break; }
        }
      }
      if (!z) continue;
      var mitigated = false;
      for (j = i + 1; j < n; j++) {
        if (z.dir === 'bull' && bars[j].c < z.lo) { mitigated = true; break; }
        if (z.dir === 'bear' && bars[j].c > z.hi) { mitigated = true; break; }
      }
      if (!mitigated) out.push(z);
    }
    return out;
  }

  // נזילות: שיאים/שפלים שווים, ואיסוף נזילות (פריצה וחזרה פנימה)
  function liquidity(bars, atrV, tol) {
    tol = tol == null ? 0.1 : tol;
    var n = bars.length, res = { pools: [], sweeps: [] };
    if (n < 15 || !(atrV > 0)) return res;
    var pv = ind.pivots(bars, 2), from = Math.max(0, n - 100);
    function cluster(idxs, key, type) {
      var lv = idxs.filter(function (i) { return i >= from; }).map(function (i) { return { i: i, p: bars[i][key] }; });
      var used = {};
      for (var a = 0; a < lv.length; a++) {
        if (used[a]) continue;
        var grp = [lv[a]];
        for (var c = a + 1; c < lv.length; c++) if (!used[c] && Math.abs(lv[c].p - lv[a].p) <= tol * atrV) { grp.push(lv[c]); used[c] = true; }
        if (grp.length >= 2) {
          var level = type === 'high' ? Math.max.apply(null, grp.map(function (g) { return g.p; })) : Math.min.apply(null, grp.map(function (g) { return g.p; }));
          res.pools.push({ type: type, level: level, count: grp.length, idx: grp[grp.length - 1].i });
        }
      }
    }
    cluster(pv.highs, 'h', 'high'); cluster(pv.lows, 'l', 'low');
    res.pools.forEach(function (pl) {
      for (var j = pl.idx + 1; j < n; j++) {
        var b = bars[j];
        if (pl.type === 'high' && b.h > pl.level + 0.02 * atrV) {
          for (var k = j; k <= Math.min(n - 1, j + 2); k++) if (bars[k].c < pl.level) { res.sweeps.push({ dir: 'bear', level: pl.level, idx: k }); break; }
          break;
        }
        if (pl.type === 'low' && b.l < pl.level - 0.02 * atrV) {
          for (var q = j; q <= Math.min(n - 1, j + 2); q++) if (bars[q].c > pl.level) { res.sweeps.push({ dir: 'bull', level: pl.level, idx: q }); break; }
          break;
        }
      }
    });
    return res;
  }

  // רמות תמיכה והתנגדות: צבירת פיבוטים, בתוספת POC/VAH/VAL
  function srLevels(bars, atrV, vp) {
    var out = [];
    if (bars.length < 15 || !(atrV > 0)) return out;
    var price = bars[bars.length - 1].c, pv = ind.pivots(bars, 3), pts = [], i;
    pv.highs.forEach(function (x) { pts.push(bars[x].h); });
    pv.lows.forEach(function (x) { pts.push(bars[x].l); });
    pts.sort(function (a, b) { return a - b; });
    var cl = [];
    pts.forEach(function (p) {
      var last = cl[cl.length - 1];
      if (last && Math.abs(p - last.sum / last.n) <= 0.5 * atrV) { last.sum += p; last.n++; } else cl.push({ sum: p, n: 1 });
    });
    cl.forEach(function (c) { if (c.n >= 2) out.push({ level: c.sum / c.n, touches: c.n, src: 'pivots' }); });
    if (vp) {
      out.push({ level: vp.poc, touches: 3, src: 'POC' });
      out.push({ level: vp.vah, touches: 2, src: 'VAH' });
      out.push({ level: vp.val, touches: 2, src: 'VAL' });
    }
    out.forEach(function (o) { o.type = o.level < price ? 'support' : 'resistance'; o.dist = Math.abs(o.level - price) / atrV; });
    out.sort(function (a, b) { return a.dist - b.dist; });
    return out.slice(0, 10);
  }

  AT.zones = { volumeProfile: volumeProfile, fvg: fvg, orderBlocks: orderBlocks, liquidity: liquidity, srLevels: srLevels };
  if (typeof module !== 'undefined' && module.exports) module.exports = AT.zones;
})(typeof window !== 'undefined' ? window : globalThis);

// מנוע ניתוח: ציון לכל טווח, שקלול שבעה טווחים, סטאפ ובדיקה היסטורית לפי דליי ציון
(function (root) {
  var AT = root.AT = root.AT || {};
  var isNode = typeof require !== 'undefined' && typeof module !== 'undefined';
  var ind = isNode ? require('./indicators.js') : AT.ind;
  var pat = isNode ? require('./patterns.js') : AT.pat;
  var zn = isNode ? require('./zones.js') : AT.zones;
  var core = isNode ? require('../core.js') : AT;

  var TFS = ['1m', '5m', '1h', '4h', '1D', '1W', '6M'];
  var TF_LABEL = { '1m': 'דקה', '5m': '5 דקות', '1h': 'שעה', '4h': '4 שעות', '1D': 'יומי', '1W': 'שבועי', '6M': 'חצי שנה' };
  var TF_INTERVAL = { '1m': '1min', '5m': '5min', '1h': '1h', '4h': '4h', '1D': '1day', '1W': '1week', '6M': '1month' };
  var WEIGHTS = {
    day:   { '1m': 15, '5m': 25, '1h': 25, '4h': 15, '1D': 10, '1W': 5,  '6M': 5 },
    swing: { '1m': 0,  '5m': 5,  '1h': 15, '4h': 25, '1D': 30, '1W': 20, '6M': 5 },
    long:  { '1m': 0,  '5m': 0,  '1h': 0,  '4h': 5,  '1D': 20, '1W': 40, '6M': 35 }
  };
  // טווח ייחוס לווטו: אם הוא נגד הכיוון בחוזקה, אין כניסה
  var VETO_TF = { day: ['1h', '1D'], swing: ['1W'], long: [] };
  var VETO_LEVEL = 25;
  var ENTRY_SCORE = 70;
  // משקל כל רכיב בציון הטווח, מתוך 100
  var EVENT_COMPS = ['fvg', 'ob', 'liq', 'pattern'], BASE_SCALE = 85, EVENT_MAX = 20, EVENT_FULL = 20;
  var COMP_W = { trend: 20, vwap: 10, macd: 12, rsi: 10, bb: 6, volume: 8, fvg: 6, ob: 8, liq: 8, pattern: 12 };

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function sgn(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }

  // ניתוח טווח אחד. מחזיר ציון -100..100 והסברים
  function analyzeTF(bars, tf) {
    var n = bars.length;
    if (n < (tf === '6M' ? 15 : 40)) return { tf: tf, ok: false, score: 0, reason: 'מעט מדי נרות' };
    var c = bars.map(function (b) { return b.c; });
    var last = bars[n - 1], price = last.c, i = n - 1;
    var atrArr = ind.atrSeries(bars, 14), atrV = atrArr[i];
    if (!(atrV > 0)) return { tf: tf, ok: false, score: 0, reason: 'ATR לא זמין' };
    var rb = ind.ribbon(c), rbs = ind.ribbonState(rb, i);
    var ema21 = rb[2].v[i];
    var rsiArr = ind.rsi(c, 14), rsiV = rsiArr[i];
    var m = ind.macd(c), bb = ind.bollinger(c, 20, 2);
    var intraday = tf === '1m' || tf === '5m' || tf === '1h' || tf === '4h';
    var vw = intraday ? ind.vwapSession(bars)[i] : ind.vwapAnchored(bars, Math.max(0, n - 60))[i];
    var vp = zn.volumeProfile(bars, 24, 120);
    var fv = zn.fvg(bars, atrArr, 60), ob = zn.orderBlocks(bars, atrArr, 80), lq = zn.liquidity(bars, atrV, 0.1);
    var sr = zn.srLevels(bars, atrV, vp);
    var cp = pat.candles(bars, i), state = pat.marketState(bars, i, atrV), dv = ind.divergence(bars, rsiArr, 3, 60);
    var comp = {}, notes = [];

    // מגמה: סדר רצועת הממוצעים ומרחק מ-EMA21
    var tr = rbs.order;
    if (ema21 != null) {
      var dist = (price - ema21) / atrV;
      if (Math.abs(dist) > 3) tr *= 0.5; // מתוח מדי
    }
    comp.trend = clamp(tr, -1, 1);
    if (comp.trend > 0.5) notes.push('רצועת ממוצעים שורית'); else if (comp.trend < -0.5) notes.push('רצועת ממוצעים דובית');

    // VWAP
    comp.vwap = vw != null ? clamp((price - vw) / (1.5 * atrV), -1, 1) : 0;

    // MACD: סימן הקו והיסטוגרמה
    var h = m.hist[i], hp = m.hist[i - 1], ml = m.macd[i];
    var mc = 0;
    if (h != null && ml != null) {
      mc = 0.5 * sgn(ml) + 0.5 * sgn(h);
      if (hp != null) mc += 0.25 * sgn(h - hp);
      mc = clamp(mc, -1, 1);
    }
    comp.macd = mc;

    // RSI: מומנטום עם הסתייגות בקצוות וסטייה
    var rc = 0;
    if (rsiV != null) {
      rc = clamp((rsiV - 50) / 25, -1, 1);
      if (rsiV > 78) rc -= 0.4; else if (rsiV < 22) rc += 0.4;
      if (dv) { rc += dv.type === 'bull' ? 0.8 : -0.8; notes.push(dv.type === 'bull' ? 'סטיית RSI שורית' : 'סטיית RSI דובית'); }
      rc = clamp(rc, -1, 1);
    }
    comp.rsi = rc;

    // בולינגר: מיקום באחוזים ופריצה עם התרחבות
    var pb = bb.pctB[i], bc = 0;
    if (pb != null) {
      bc = clamp((pb - 0.5) * 2, -1, 1);
      if (pb > 1 || pb < 0) bc *= 0.5; // מתוח מעבר לרצועה
    }
    comp.bb = bc;

    // נפח: מיקום מול POC ואזור הערך, עם אישור נפח יחסי
    var vc = 0, rv = ind.rvol(bars, i, 20);
    if (vp) {
      if (price > vp.vah) vc = 0.8; else if (price < vp.val) vc = -0.8;
      else vc = clamp((price - vp.poc) / Math.max(1e-9, (vp.vah - vp.val) / 2), -1, 1) * 0.5;
      if (rv != null && rv >= 1.3) vc *= 1.25; else if (rv != null && rv < 0.7) vc *= 0.7;
      vc = clamp(vc, -1, 1);
    }
    comp.volume = vc;

    // FVG פתוח קרוב: תמיכה מתחת, התנגדות מעל
    var fc = 0;
    fv.forEach(function (z) {
      var mid = (z.lo + z.hi) / 2, d = Math.abs(price - mid) / atrV;
      if (d > 2) return;
      var w = 1 - d / 2;
      if (z.dir === 'bull' && price >= z.lo) fc += 0.6 * w;
      if (z.dir === 'bear' && price <= z.hi) fc -= 0.6 * w;
      if (z.dir === 'bull' && price < z.lo) fc -= 0.3 * w; // פער שורי מעל המחיר פועל כמגנט למעלה, אך המחיר מתחתיו
    });
    comp.fvg = clamp(fc, -1, 1);

    // בלוק הזמנות קרוב
    var oc = 0;
    ob.forEach(function (z) {
      var inside = price >= z.lo && price <= z.hi, d = inside ? 0 : Math.min(Math.abs(price - z.lo), Math.abs(price - z.hi)) / atrV;
      if (d > 1.5) return;
      var w = 1 - d / 1.5;
      oc += (z.dir === 'bull' ? 1 : -1) * 0.7 * w;
    });
    comp.ob = clamp(oc, -1, 1);

    // איסוף נזילות אחרון (עד 5 נרות)
    var lc = 0;
    lq.sweeps.forEach(function (s) { if (n - 1 - s.idx <= 5) lc += s.dir === 'bull' ? 0.9 : -0.9; });
    if (lc) notes.push(lc > 0 ? 'איסוף נזילות מלמטה' : 'איסוף נזילות מלמעלה');
    comp.liq = clamp(lc, -1, 1);

    // תבניות נרות ופעולת מחיר
    var pc = 0;
    cp.forEach(function (p) {
      var v = (p.dir === 'bull' ? 1 : p.dir === 'bear' ? -1 : 0) * (p.strength / 3);
      pc += v;
      if (p.dir !== 'neutral') notes.push(p.name);
    });
    var sb = pat.signalBar(bars, i);
    if (sb) pc += sb.dir === 'bull' ? 0.3 : -0.3;
    var tl = pat.twoLeg(bars, state.state);
    if (tl) { pc += tl.type === 'H2' ? 0.5 : -0.5; notes.push(tl.type === 'H2' ? 'תיקון H2 במגמת עלייה' : 'תיקון L2 במגמת ירידה'); }
    var fb = pat.failedBreakout(bars, 20);
    if (fb) { pc += fb.dir === 'bull' ? 0.6 : -0.6; notes.push('פריצה כושלת ' + (fb.dir === 'bull' ? 'כלפי מטה' : 'כלפי מעלה')); }
    comp.pattern = clamp(pc, -1, 1);

    // רכיבים רציפים נותנים את הבסיס. רכיבי אירוע (פער, בלוק, נזילות, תבנית) מוסיפים בונוס ולא מדללים כשאין אירוע
    var base = 0, bw = 0, ev = 0, k;
    for (k in COMP_W) {
      if (EVENT_COMPS.indexOf(k) >= 0) ev += COMP_W[k] * (comp[k] || 0);
      else { base += COMP_W[k] * (comp[k] || 0); bw += COMP_W[k]; }
    }
    var score = Math.round(clamp(base / bw * BASE_SCALE + EVENT_MAX * clamp(ev / EVENT_FULL, -1, 1), -100, 100));
    // מגמה חזקה מגבירה, טווח מדכא
    if (state.state === 'range') score = Math.round(score * 0.75);

    return {
      tf: tf, ok: true, score: score, comp: comp, notes: notes, price: price, atr: atrV, state: state.state,
      rsi: rsiV, rvol: rv, vwap: vw, poc: vp ? vp.poc : null, vah: vp ? vp.vah : null, val: vp ? vp.val : null,
      zones: { fvg: fv, ob: ob, liq: lq, sr: sr }, patterns: cp, divergence: dv, bb: { pctB: pb }, ema: { e21: ema21 }
    };
  }

  // שקלול טווחים. results: {tf: analyzeTF result}
  function combine(results, mode, thr) {
    thr = thr >= 40 && thr <= 95 ? thr : ENTRY_SCORE;
    var w = WEIGHTS[mode];
    if (!w) throw new Error('מצב לא מוכר: ' + mode);
    var sum = 0, wt = 0, used = [], missing = [];
    TFS.forEach(function (tf) {
      if (!w[tf]) return;
      var r = results[tf];
      if (r && r.ok) { sum += r.score * w[tf]; wt += w[tf]; used.push(tf); } else missing.push(tf);
    });
    var coverage = 0;
    TFS.forEach(function (tf) { coverage += w[tf] || 0; });
    var covered = wt / coverage;
    var score = wt > 0 ? Math.round(sum / wt) : 0;
    var dir = score >= thr ? 'long' : score <= -thr ? 'short' : null;
    var vetoes = [];
    if (dir) {
      VETO_TF[mode].forEach(function (tf) {
        var r = results[tf];
        if (!r || !r.ok) return;
        if ((dir === 'long' && r.score <= -VETO_LEVEL) || (dir === 'short' && r.score >= VETO_LEVEL)) vetoes.push({ tf: tf, score: r.score });
      });
    }
    var verdict = 'wait';
    if (dir && !vetoes.length && covered >= 0.6) verdict = dir;
    var lean = score > 15 ? 'long' : score < -15 ? 'short' : 'flat';
    return { mode: mode, thr: thr, score: score, dir: dir, verdict: verdict, lean: lean, vetoes: vetoes, used: used, missing: missing, coverage: covered };
  }

  // סטאפ עם סטופ ויעדים מבוססי ATR של טווח הביצוע
  function setup(results, comb, mode) {
    if (comb.verdict !== 'long' && comb.verdict !== 'short') return null;
    var m = core.MODES[mode], tfMap = { day: '5m', swing: '1D', long: '1W' };
    var r = results[tfMap[mode]];
    if (!r || !r.ok) return null;
    var lv = core.levels(comb.verdict, r.price, r.atr, m.mult);
    // סטופ מגובה בנקודה מבנית אם קרובה: מתחת לשפל/מעל לשיא האחרון של 5 נרות פחות 0.1 ATR
    return { dir: comb.verdict, mode: mode, entry: r.price, atr: r.atr, mult: m.mult, stop: lv.stop, t1: lv.t1, t2: lv.t2, riskPct: m.riskPct, basis: tfMap[mode] };
  }

  // בדיקה היסטורית לפי דליי ציון על סדרה אחת. אין ידע עתידי: הציון מחושב רק מנרות עד i.
  function backtest(bars, opts) {
    opts = opts || {};
    var win = opts.window || 150, horizon = opts.horizon || 30, mult = opts.mult || 1.5, rr = opts.rr || 2, step = opts.step || 1;
    var start = opts.start || 80, tf = opts.tf || '1D';
    var buckets = {}, trades = [];
    function key(s) { var a = Math.abs(s); return a >= 70 ? '70+' : a >= 50 ? '50-69' : a >= 30 ? '30-49' : null; }
    for (var i = start; i < bars.length - 1; i += step) {
      var sl = bars.slice(Math.max(0, i - win + 1), i + 1);
      var r = analyzeTF(sl, tf);
      if (!r.ok) continue;
      var kb = key(r.score);
      if (!kb) continue;
      var dir = r.score > 0 ? 1 : -1, entry = bars[i].c, risk = r.atr * mult;
      var stop = entry - dir * risk, tgt = entry + dir * rr * risk, out = null, j;
      for (j = i + 1; j < Math.min(bars.length, i + 1 + horizon); j++) {
        var b = bars[j];
        var hitS = dir > 0 ? b.l <= stop : b.h >= stop, hitT = dir > 0 ? b.h >= tgt : b.l <= tgt;
        if (hitS) { out = -1; break; } // כשהנר נוגע בשניהם נניח הפסד
        if (hitT) { out = rr; break; }
      }
      if (out == null) {
        var endI = Math.min(bars.length - 1, i + horizon);
        out = clamp(dir * (bars[endI].c - entry) / risk, -1, rr);
      }
      trades.push({ i: i, score: r.score, R: out });
      var bk = buckets[kb] || (buckets[kb] = { n: 0, wins: 0, sumR: 0 });
      bk.n++; bk.sumR += out; if (out > 0) bk.wins++;
      if (step === 1) i += Math.max(0, opts.cooldown == null ? 3 : opts.cooldown); // מניעת חפיפה
    }
    var res = {};
    Object.keys(buckets).forEach(function (k) {
      var b = buckets[k];
      res[k] = { n: b.n, winRate: b.n ? b.wins / b.n : 0, avgR: b.n ? b.sumR / b.n : 0, enough: b.n >= 30 };
    });
    return { buckets: res, trades: trades, total: trades.length };
  }

  // מחלק מערך נרות 1 דקה/חודש להצגה: איחוד נרות לפי מפתח
  function aggregate(bars, keyFn) {
    var out = [], cur = null, ck = null;
    bars.forEach(function (b) {
      var k = keyFn(b);
      if (k !== ck) { if (cur) out.push(cur); cur = { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 }; ck = k; }
      else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v || 0; }
    });
    if (cur) out.push(cur);
    return out;
  }
  // חצי שנה: H1 = ינואר עד יוני, H2 = יולי עד דצמבר. הקלט חודשי בסדר עולה.
  function halfYear(monthly) {
    return aggregate(monthly, function (b) { var d = new Date(b.t); return d.getUTCFullYear() + (d.getUTCMonth() < 6 ? 'H1' : 'H2'); });
  }
  function analyzeAll(barsByTf, mode, thr) {
    var results = {};
    TFS.forEach(function (tf) { if (barsByTf[tf] && barsByTf[tf].length) results[tf] = analyzeTF(barsByTf[tf], tf); });
    var comb = combine(results, mode, thr);
    return { results: results, combined: comb, setup: setup(results, comb, mode) };
  }

  // הסבר בעברית לכל אופק: למה הכיוון, מה מסכן אותו, ותוכנית. o: {mult, news, earnings, sizeFactor}
  var PH = {
    trend: ['רצועת הממוצעים סדורה כלפי מעלה', 'רצועת הממוצעים סדורה כלפי מטה'],
    vwap: ['המחיר מעל הממוצע המשוקלל בנפח', 'המחיר מתחת לממוצע המשוקלל בנפח'],
    macd: ['המומנטום חיובי', 'המומנטום שלילי'],
    rsi: ['מדד העוצמה היחסית חיובי', 'מדד העוצמה היחסית חלש'],
    bb: ['המחיר בחלק העליון של רצועות בולינגר', 'המחיר בחלק התחתון של רצועות בולינגר'],
    volume: ['המחיר מעל אזור הערך של הנפח', 'המחיר מתחת לאזור הערך של הנפח'],
    fvg: ['יש פער מחיר פתוח תומך בקרבת המחיר', 'יש פער מחיר פתוח מתנגד בקרבת המחיר'],
    ob: ['אזור ביקוש של כסף חכם קרוב', 'אזור היצע של כסף חכם קרוב'],
    liq: ['נאספה נזילות מלמטה והמחיר חזר', 'נאספה נזילות מלמעלה והמחיר חזר']
  };
  var HORIZON = { day: 'קצר (מסחר יומי)', swing: 'בינוני (סווינג)', long: 'ארוך (השקעה)' };
  var BASE_TF = { day: '5m', swing: '1D', long: '1W' };
  function explain(an, mode, o) {
    o = o || {};
    var res = an.results, c = an.combined, mult = o.mult || core.MODES[mode].mult;
    var out = { mode: mode, horizon: HORIZON[mode], score: c.score, thr: c.thr, verdict: c.verdict, pros: [], risks: [], plan: null, stance: 'nodata', headline: '' };
    var base = res[BASE_TF[mode]];
    if (!base || !base.ok) { out.headline = 'אין מספיק נתונים לאופק הזה'; return out; }
    var sg = c.score >= 0 ? 1 : -1, sideHe = sg > 0 ? 'לונג' : 'שורט', sideEn = sg > 0 ? 'long' : 'short';
    if (c.verdict === 'long' || c.verdict === 'short') { out.stance = c.verdict; out.headline = 'כניסה אפשרית ל' + sideHe; }
    else if (Math.abs(c.score) >= 15) { out.stance = 'lean_' + sideEn; out.headline = 'נטייה ל' + sideHe + ', אבל חסר אישור לכניסה'; }
    else { out.stance = 'flat'; out.headline = 'ניטרלי: עדיף להמתין'; }
    var w = WEIGHTS[mode], agree = 0, against = 0, tot = 0;
    TFS.forEach(function (tf) { if (!w[tf]) return; var r = res[tf]; if (!r || !r.ok) return; tot++; if (r.score * sg >= 15) agree++; else if (r.score * sg <= -15) against++; });
    if (tot) out.pros.push(agree + ' מתוך ' + tot + ' טווחי זמן תומכים בכיוון ' + sideHe + (against ? ', ' + against + ' מתנגדים' : ''));
    Object.keys(PH).forEach(function (k) {
      var v = (base.comp[k] || 0) * sg;
      if (v >= 0.5) out.pros.push(PH[k][sg > 0 ? 0 : 1]);
      else if (v <= -0.4) out.risks.push('נגד התרחיש: ' + PH[k][sg > 0 ? 1 : 0]);
    });
    (base.notes || []).forEach(function (n) { if (/איסוף|תיקון|פריצה כושלת|סטיית/.test(n) || true) out.pros.push('סימן במחיר: ' + n); });
    if (base.state === 'trend_up' || base.state === 'trend_down') out.pros.push('השוק במגמת ' + (base.state === 'trend_up' ? 'עלייה' : 'ירידה'));
    else out.risks.push('השוק בטווח צדדי: איתותי מגמה פחות אמינים');
    c.vetoes.forEach(function (v) { out.risks.push('טווח ' + TF_LABEL[v.tf] + ' מתנגד בחוזקה (ציון ' + v.score + ')'); });
    if (c.coverage < 0.6) out.risks.push('חסרים נתונים בחלק מהטווחים, ההערכה חלקית');
    if (base.rsi != null && ((sg > 0 && base.rsi > 75) || (sg < 0 && base.rsi < 25))) out.risks.push('מדד העוצמה היחסית קיצוני (' + Math.round(base.rsi) + '): סיכון להתקררות או לתיקון');
    if (base.rvol != null && base.rvol < 0.7) out.risks.push('נפח המסחר נמוך מהרגיל');
    if (o.earnings && o.earnings.days != null && o.earnings.days <= 7) out.risks.push('דוחות רבעוניים בעוד ' + o.earnings.days + ' ימים: אפשרי פער מחיר חד');
    if (o.news && ((sg > 0 && o.news.avg < -0.25) || (sg < 0 && o.news.avg > 0.25))) out.risks.push('אווירת החדשות נגד הכיוון');
    if (o.sizeFactor && o.sizeFactor.factor < 1) out.risks.push('מומלץ להקטין גודל פוזיציה פי ' + o.sizeFactor.factor);
    if (Math.abs(c.score) >= 15) {
      var lv = core.levels(sideEn, base.price, base.atr, mult);
      out.plan = { dir: sideEn, side: sideHe, entry: base.price, stop: lv.stop, t1: lv.t1, t2: lv.t2, atr: base.atr, tf: BASE_TF[mode], hypothetical: !(c.verdict === 'long' || c.verdict === 'short') };
    }
    out.confirm = c.verdict === 'wait' ? 'אישור כניסה: ציון ' + c.thr + ' ומעלה (לונג) או מינוס ' + c.thr + ' ומטה (שורט), בלי התנגדות מטווח גבוה.' : '';
    return out;
  }

  AT.engine = { TFS: TFS, TF_LABEL: TF_LABEL, TF_INTERVAL: TF_INTERVAL, WEIGHTS: WEIGHTS, ENTRY_SCORE: ENTRY_SCORE, VETO_LEVEL: VETO_LEVEL, COMP_W: COMP_W,
    analyzeTF: analyzeTF, combine: combine, setup: setup, backtest: backtest, aggregate: aggregate, halfYear: halfYear, analyzeAll: analyzeAll, explain: explain, HORIZON: HORIZON, BASE_TF: BASE_TF };
  if (typeof module !== 'undefined' && module.exports) module.exports = AT.engine;
})(typeof window !== 'undefined' ? window : globalThis);

// שכבת נתונים: Twelve Data ו-Finnhub, הגבלת קצב, מטמון, ניתוח חדשות
(function (root) {
  var AT = root.AT = root.AT || {};
  var isNode = typeof require !== 'undefined' && typeof module !== 'undefined';
  var E = isNode ? require('./engine.js') : AT.engine;

  // מגביל קצב: לכל היותר max קריאות בחלון של windowMs. נשען על שעון ושינה שניתנים להזרקה.
  function RateLimiter(max, windowMs, nowFn, sleepFn) {
    this.max = max; this.win = windowMs; this.q = [];
    this.now = nowFn || function () { return Date.now(); };
    this.sleep = sleepFn || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  }
  RateLimiter.prototype.acquire = function () {
    var self = this;
    return (function loop() {
      var t = self.now();
      self.q = self.q.filter(function (x) { return t - x < self.win; });
      if (self.q.length < self.max) { self.q.push(t); return Promise.resolve(); }
      var wait = self.win - (t - self.q[0]) + 5;
      return self.sleep(wait).then(loop);
    })();
  };

  function Cache(nowFn) { this.m = {}; this.now = nowFn || function () { return Date.now(); }; }
  Cache.prototype.get = function (k) { var e = this.m[k]; if (!e) return undefined; if (this.now() > e.exp) { delete this.m[k]; return undefined; } return e.v; };
  Cache.prototype.set = function (k, v, ttl) { this.m[k] = { v: v, exp: this.now() + ttl }; };

  // כמה זמן נחשב טרי לכל טווח
  var TTL = { '1min': 30e3, '5min': 60e3, '1h': 5 * 60e3, '4h': 10 * 60e3, '1day': 15 * 60e3, '1week': 60 * 60e3, '1month': 6 * 3600e3 };

  function parseTs(s) {
    if (typeof s === 'number') return s;
    var str = String(s);
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return Date.parse(str + 'T00:00:00Z');
    // חותמת עם שעה מגיעה כזמן בורסה (ניו יורק); נמיר ל-UTC לפי היסט DST בקירוב ישיר
    var m = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return Date.parse(str);
    var y = +m[1], mo = +m[2] - 1, d = +m[3], h = +m[4], mi = +m[5], se = +(m[6] || 0);
    var guess = Date.UTC(y, mo, d, h, mi, se);
    // מחפשים היסט (4 או 5 שעות) כך שהזמן בניו יורק יתאים לטקסט
    var fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    for (var off = 4; off <= 5; off++) {
      var t = guess + off * 3600e3, p = {};
      fmt.formatToParts(new Date(t)).forEach(function (x) { p[x.type] = x.value; });
      if (+p.hour % 24 === h && +p.minute === mi && +p.day === d) return t;
    }
    return guess + 5 * 3600e3;
  }

  // ממיר תשובת Twelve Data (JSON או טקסט מופרד) לנרות בסדר עולה
  function parseSeries(body) {
    var rows = [];
    if (body && typeof body === 'object') {
      if (!Array.isArray(body) && (body.status === 'error' || body.code >= 400)) throw new Error('Twelve Data: ' + (body.message || body.code));
      var arr = Array.isArray(body) ? body : [body.values, body.data, body.rows, body.result, body.time_series].filter(Array.isArray)[0];
      if (!arr) throw new Error('מבנה תשובה לא מוכר: ' + (Array.isArray(body) ? 'רשימה ריקה' : 'שדות ' + Object.keys(body).slice(0, 6).join(',')));
      rows = arr.map(function (r) { return { t: parseTs(r.datetime), o: +r.open, h: +r.high, l: +r.low, c: +r.close, v: +(r.volume || 0) }; });
    } else if (typeof body === 'string') {
      var low = body.toLowerCase();
      if (/upgrad|plan|grow or pro/.test(low) && body.indexOf('datetime') < 0) throw new Error('הנתון דורש שדרוג חבילה ב-Twelve Data');
      if (/api credits|rate limit|too many requests/.test(low) && body.indexOf('datetime') < 0) throw new Error('חריגה ממגבלת קצב ב-Twelve Data, נסה בעוד דקה');
      var lines = body.trim().split(/\r?\n/), sep = lines[0].indexOf(';') >= 0 ? ';' : ',';
      var head = lines[0].toLowerCase().split(sep).map(function (x) { return x.trim(); });
      var ix = function (n) { return head.indexOf(n); };
      if (ix('datetime') < 0 || ix('close') < 0) throw new Error('פורמט נתונים לא מוכר');
      for (var i = 1; i < lines.length; i++) {
        var f = lines[i].split(sep);
        if (f.length < head.length) continue;
        rows.push({ t: parseTs(f[ix('datetime')].trim()), o: +f[ix('open')], h: +f[ix('high')], l: +f[ix('low')], c: +f[ix('close')], v: ix('volume') >= 0 ? +f[ix('volume')] : 0 });
      }
    } else throw new Error('תשובה ריקה');
    rows = rows.filter(function (r) { return isFinite(r.t) && isFinite(r.o) && isFinite(r.h) && isFinite(r.l) && isFinite(r.c) && r.h >= r.l; });
    rows.sort(function (a, b) { return a.t - b.t; });
    var out = [];
    rows.forEach(function (r) { if (!out.length || out[out.length - 1].t !== r.t) out.push(r); });
    return out;
  }

  // מנוע חדשות: מילות מפתח בעברית ואנגלית. הציון -1..1 הוא הערכה גסה, לא ודאות.
  var POS = ['beat', 'beats', 'surge', 'surges', 'record', 'upgrade', 'upgraded', 'raises', 'raised', 'strong', 'growth', 'rally', 'soar', 'soars', 'outperform', 'bullish', 'approval', 'partnership', 'buyback', 'profit'];
  var NEG = ['miss', 'misses', 'plunge', 'plunges', 'downgrade', 'downgraded', 'cuts', 'cut', 'weak', 'lawsuit', 'probe', 'investigation', 'recall', 'bearish', 'fall', 'falls', 'drop', 'drops', 'warning', 'warns', 'loss', 'fraud', 'delay', 'sell-off', 'selloff', 'offering', 'dilution'];
  function sentiment(text) {
    var words = String(text || '').toLowerCase().match(/[a-z\-]+/g) || [], p = 0, n = 0;
    words.forEach(function (w) { if (POS.indexOf(w) >= 0) p++; else if (NEG.indexOf(w) >= 0) n++; });
    if (p + n === 0) return 0;
    return (p - n) / (p + n);
  }
  function newsSummary(items) {
    var sc = items.map(function (it) { return sentiment((it.headline || '') + ' ' + (it.summary || '')); });
    var avg = sc.length ? sc.reduce(function (a, b) { return a + b; }, 0) / sc.length : 0;
    var label = avg > 0.25 ? 'חיובי' : avg < -0.25 ? 'שלילי' : 'מעורב או נייטרלי';
    return { count: items.length, avg: avg, label: label, items: items.map(function (it, i) { return Object.assign({}, it, { sentiment: sc[i] }); }) };
  }

  // מפענח תשובת כלי MCP לאובייקט או טקסט
  function unwrap(r) {
    if (r && typeof r === 'object' && 'payload' in r) r = r.payload;
    if (r && typeof r === 'object' && Array.isArray(r.content)) r = r.content.map(function (x) { return x && x.text || ''; }).join('\n');
    if (typeof r === 'string') { var t = r.trim(); if (t.charAt(0) === '{' || t.charAt(0) === '[') { try { return JSON.parse(t); } catch (e) { } } return r; }
    return r;
  }
  function stripMd(t) { return String(t || '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_#>`]/g, '').replace(/\s+/g, ' ').trim(); }

  // לקוח. opts: {fetch, twelveKey, finnhubKey, limiter, cache, mcp}
  function Client(opts) {
    opts = opts || {};
    this.fetch = opts.fetch || (typeof fetch !== 'undefined' ? fetch.bind(root) : null);
    this.tdKey = opts.twelveKey || '';
    this.fhKey = opts.finnhubKey || '';
    this.mcp = opts.mcp || null;
    this.limiter = opts.limiter || new RateLimiter(7, 60e3);
    this.fhLimiter = opts.fhLimiter || opts.limiter || new RateLimiter(50, 60e3); // לכל ספק מגבלה משלו
    this.cache = opts.cache || new Cache();
    this.base = opts.tdBase || 'https://api.twelvedata.com';
    this.fhBase = opts.fhBase || 'https://finnhub.io/api/v1';
    this.calls = 0;
  }
  Client.prototype._json = function (url, limiter) {
    var self = this;
    if (!this.fetch) return Promise.reject(new Error('אין fetch בסביבה'));
    return (limiter || this.limiter).acquire().then(function () {
      self.calls++;
      return self.fetch(url);
    }).then(function (r) {
      if (!r.ok && r.status !== 200) {
        if (r.status === 429) throw new Error('חריגה ממגבלת קצב (429)');
        if (r.status === 401 || r.status === 403) throw new Error('מפתח API לא תקין (' + r.status + ')');
        throw new Error('שגיאת שרת ' + r.status);
      }
      return r.json();
    });
  };
  Client.prototype.series = function (symbol, interval, size) {
    var self = this, key = 'ts|' + symbol + '|' + interval + '|' + size, hit = this.cache.get(key);
    if (hit) return Promise.resolve(hit);
    var p;
    if (this.tdKey) {
      var url = this.base + '/time_series?symbol=' + encodeURIComponent(symbol) + '&interval=' + interval + '&outputsize=' + (size || 300) + '&order=asc&apikey=' + encodeURIComponent(this.tdKey);
      p = this._json(url).then(parseSeries);
    } else if (this.mcp) {
      p = this.limiter.acquire().then(function () {
        return self.mcp.callTool('Twelve Data', 'get_time_series', { symbol: symbol, interval: interval, outputsize: size || 300 });
      }).then(function (r) { return parseSeries(unwrap(r)); });
    } else return Promise.reject(new Error('אין מפתח Twelve Data ואין חיבור MCP'));
    return p.then(function (bars) {
      if (!bars.length) throw new Error('לא התקבלו נרות עבור ' + symbol);
      self.cache.set(key, bars, TTL[interval] || 60e3);
      return bars;
    });
  };
  // כל הטווחים הנדרשים: 4h נמשך מהספק, 6M מצטבר מחודשי
  Client.prototype.allTimeframes = function (symbol, tfs, size) {
    var self = this, out = {}, errors = {};
    tfs = tfs || E.TFS;
    return tfs.reduce(function (chain, tf) {
      return chain.then(function () {
        var iv = E.TF_INTERVAL[tf];
        return self.series(symbol, iv, size || (tf === '6M' ? 600 : 300)).then(function (b) {
          out[tf] = tf === '6M' ? E.halfYear(b) : b;
        }).catch(function (e) { errors[tf] = e.message; });
      });
    }, Promise.resolve()).then(function () { return { bars: out, errors: errors }; });
  };
  Client.prototype.news = function (symbol, daysBack) {
    var self = this, key = 'news|' + symbol, hit = this.cache.get(key);
    if (hit) return Promise.resolve(hit);
    if (!this.fhKey) return Promise.reject(new Error('אין מפתח Finnhub'));
    var to = new Date(), from = new Date(to.getTime() - (daysBack || 5) * 864e5);
    var d = function (x) { return x.toISOString().slice(0, 10); };
    var url = this.fhBase + '/company-news?symbol=' + encodeURIComponent(symbol) + '&from=' + d(from) + '&to=' + d(to) + '&token=' + encodeURIComponent(this.fhKey);
    return this._json(url, this.fhLimiter).then(function (arr) {
      if (!Array.isArray(arr)) throw new Error('תשובת חדשות לא צפויה');
      var items = arr.slice(0, 20).map(function (a) { return { headline: a.headline, summary: a.summary, source: a.source, url: a.url, t: (a.datetime || 0) * 1000 }; });
      var res = newsSummary(items);
      self.cache.set(key, res, 10 * 60e3);
      return res;
    });
  };
  Client.prototype.earnings = function (symbol) {
    if (!this.fhKey) return Promise.reject(new Error('אין מפתח Finnhub'));
    var to = new Date(Date.now() + 30 * 864e5), from = new Date();
    var d = function (x) { return x.toISOString().slice(0, 10); };
    var url = this.fhBase + '/calendar/earnings?from=' + d(from) + '&to=' + d(to) + '&symbol=' + encodeURIComponent(symbol) + '&token=' + encodeURIComponent(this.fhKey);
    return this._json(url, this.fhLimiter).then(function (r) {
      var list = (r && r.earningsCalendar) || [];
      return list.length ? { date: list[0].date, hour: list[0].hour } : null;
    });
  };
  Client.prototype.quote = function (symbol) {
    if (!this.fhKey) return Promise.reject(new Error('אין מפתח Finnhub'));
    return this._json(this.fhBase + '/quote?symbol=' + encodeURIComponent(symbol) + '&token=' + encodeURIComponent(this.fhKey), this.fhLimiter).then(function (q) {
      return { price: q.c, change: q.d, changePct: q.dp, high: q.h, low: q.l, open: q.o, prevClose: q.pc };
    });
  };

  // שער ונתוני יסוד זמינים: טווח 52 שבועות, נפח מול ממוצע, שינוי יומי. Finnhub אם יש מפתח, אחרת MCP
  function parseKV(txt) {
    var ls = String(txt).trim().split(/\r?\n/); if (ls.length < 2) return null;
    var h = ls[0].split(';'), v = ls[1].split(';'), o = {};
    h.forEach(function (k, i) { o[k.trim()] = v[i]; });
    return o;
  }
  Client.prototype.quoteAny = function (symbol) {
    var self = this;
    if (!this.mcp) return Promise.reject(new Error('אין מקור שערים'));
    var key = 'quotemcp|' + symbol, hit = this.cache.get(key);
    if (hit) return Promise.resolve(hit);
    return this.limiter.acquire().then(function () { return self.mcp.callTool('Twelve Data', 'get_quote', { symbol: symbol }); }).then(function (r) {
      r = unwrap(r);
      var o = typeof r === 'string' ? parseKV(r) : r;
      if (!o || o.close == null) throw new Error(typeof r === 'string' && /upgrad|plan/i.test(r) ? 'השער דורש שדרוג חבילה' : 'תשובת שער לא צפויה');
      var n = function (x) { x = parseFloat(x); return isFinite(x) ? x : null; };
      var q = { name: o.name || '', exchange: o.exchange || '', price: n(o.close), prevClose: n(o.previous_close), changePct: n(o.percent_change), volume: n(o.volume), avgVolume: n(o.average_volume), w52lo: n(o.fifty_two_week_low), w52hi: n(o.fifty_two_week_high), marketOpen: String(o.is_market_open) === 'true' };
      self.cache.set(key, q, 60e3);
      return q;
    });
  };

  // חיפוש נכס לפי שם או טיקר חלקי. מחזיר רשימה נקייה, מניות ו-ETF אמריקאיים קודם
  Client.prototype.search = function (q) {
    var self = this;
    var p;
    if (this.tdKey) p = this._json(this.base + '/symbol_search?symbol=' + encodeURIComponent(q) + '&outputsize=15&apikey=' + encodeURIComponent(this.tdKey)).then(function (j) { return j.data || []; });
    else if (this.mcp) p = this.limiter.acquire().then(function () { return self.mcp.callTool('Twelve Data', 'search_symbol', { symbol: q, outputsize: 15 }); }).then(function (r) { r = unwrap(r); return Array.isArray(r) ? r : (r && r.data) || []; });
    else return Promise.reject(new Error('אין מפתח Twelve Data ואין חיבור MCP'));
    return p.then(function (arr) {
      var seen = {}, out = [];
      arr.forEach(function (x) {
        if (!x || !x.symbol) return;
        var k = x.symbol + '|' + x.exchange; if (seen[k]) return; seen[k] = 1;
        out.push({ symbol: x.symbol, name: x.instrument_name || '', exchange: x.exchange || '', type: x.instrument_type || '', country: x.country || '' });
      });
      var us = function (x) { return /united states/i.test(x.country) ? 0 : 1; };
      out.sort(function (a, b) { return us(a) - us(b); });
      return out.slice(0, 8);
    });
  };
  // חדשות: Finnhub אם יש מפתח, אחרת Twelve Data דרך MCP
  Client.prototype.newsAny = function (symbol) {
    var self = this;
    if (this.fhKey) return this.news(symbol);
    if (!this.mcp) return Promise.reject(new Error('אין מקור חדשות'));
    var key = 'newsmcp|' + symbol, hit = this.cache.get(key);
    if (hit) return Promise.resolve(hit);
    return this.limiter.acquire().then(function () { return self.mcp.callTool('Twelve Data', 'get_company_news', { symbol: symbol, outputsize: 8 }); }).then(function (r) {
      r = unwrap(r);
      if (typeof r === 'string') throw new Error(/upgrad|plan/i.test(r) ? 'החדשות דורשות שדרוג חבילה' : 'תשובת חדשות לא צפויה');
      var items = ((r && r.press_releases) || []).map(function (a) { return { headline: stripMd(a.title), summary: stripMd(a.body).slice(0, 300), source: a.source || '', url: '', t: Date.parse(a.datetime) || 0 }; });
      var res = newsSummary(items);
      self.cache.set(key, res, 10 * 60e3);
      return res;
    });
  };
  Client.prototype.earningsAny = function (symbol) {
    if (!this.fhKey) return Promise.resolve(null);
    return this.earnings(symbol).catch(function () { return null; });
  };

  AT.data = { unwrap: unwrap, RateLimiter: RateLimiter, Cache: Cache, Client: Client, parseSeries: parseSeries, parseTs: parseTs, sentiment: sentiment, newsSummary: newsSummary, TTL: TTL };
  if (typeof module !== 'undefined' && module.exports) module.exports = AT.data;
})(typeof window !== 'undefined' ? window : globalThis);

// שלבי יום המסחר (שעון ניו יורק), שערי סופר-סטאפ והתאמת גודל פוזיציה להקשר
(function (root) {
  var AT = root.AT = root.AT || {};

  var PHASES = [
    { key: 'pre', label: 'פרה-מרקט', from: 240, to: 570, entry: 'caution', note: 'הכנה בלבד: סימון אזורים והחלטה אם זה יום פעולה' },
    { key: 'open', label: '15 דקות פתיחה', from: 570, to: 585, entry: 'no', note: 'אין כניסות. מתבוננים בלבד' },
    { key: 'morning', label: 'בוקר', from: 585, to: 690, entry: 'yes', note: 'חלון עבודה עיקרי' },
    { key: 'midday', label: 'צהריים', from: 690, to: 840, entry: 'caution', note: 'נפח נמוך ותנועות שווא, דרישות מחמירות' },
    { key: 'afternoon', label: 'אחר הצהריים', from: 840, to: 930, entry: 'yes', note: 'חלון עבודה שני' },
    { key: 'power', label: 'שעה אחרונה', from: 930, to: 960, entry: 'caution', note: 'תנודתיות סגירה, לא פותחים סווינג חדש בלי סיבה' },
    { key: 'after', label: 'אפטר-מרקט', from: 960, to: 1200, entry: 'caution', note: 'נזילות דלה ופערי מחיר רחבים' }
  ];
  var fmt = null;
  function nyParts(ts) {
    if (!fmt) fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' });
    var p = {};
    fmt.formatToParts(new Date(ts)).forEach(function (x) { p[x.type] = x.value; });
    return { dow: p.weekday, min: (+p.hour % 24) * 60 + (+p.minute) };
  }
  // ts במילישניות. מחזיר את השלב הנוכחי וכמה דקות נשארו בו
  function phase(ts) {
    var n = nyParts(ts);
    if (n.dow === 'Sat' || n.dow === 'Sun') return { key: 'closed', label: 'סוף שבוע', entry: 'no', note: 'השוק סגור', left: null };
    for (var i = 0; i < PHASES.length; i++) {
      var ph = PHASES[i];
      if (n.min >= ph.from && n.min < ph.to) return { key: ph.key, label: ph.label, entry: ph.entry, note: ph.note, left: ph.to - n.min, min: n.min };
    }
    return { key: 'closed', label: 'סגור', entry: 'no', note: 'מחוץ לשעות המסחר', left: null, min: n.min };
  }
  function minutesToOpen(ts) {
    var n = nyParts(ts);
    if (n.dow === 'Sat' || n.dow === 'Sun') return null;
    return n.min < 570 ? 570 - n.min : null;
  }

  // שער בודד: ok true/false/null (null = לא ידוע, אסור להניח שעבר)
  function g(ok, label, detail) { return { ok: ok, label: label, detail: detail || '' }; }
  // ctx: {phase, rvol, zoneDistAtr, rr, eventSoonMin, dayRangeAtr, stopsInRow, prevDayDropPct, newBase, preOk}
  function superSetup(analysis, ctx) {
    ctx = ctx || {};
    var items = [], dir = analysis && analysis.verdict;
    var sess = ctx.phase || { key: 'closed', entry: 'no' };
    items.push(g(sess.entry === 'yes' ? true : sess.entry === 'caution' ? null : false, 'חלון זמן מתאים', sess.label));
    items.push(g(dir === 'long' || dir === 'short', 'ציון מאוחד עבר סף כניסה ללא ווטו', dir === 'long' || dir === 'short' ? '' : 'ממתינים'));
    items.push(g(ctx.rvol == null ? null : ctx.rvol >= 1.2, 'נפח יחסי לפחות 1.2', ctx.rvol == null ? 'אין נתון' : 'כרגע ' + ctx.rvol.toFixed(2)));
    items.push(g(ctx.zoneDistAtr == null ? null : ctx.zoneDistAtr <= 0.5, 'המחיר עד חצי ATR מאזור מסומן', ctx.zoneDistAtr == null ? 'אין אזור' : 'מרחק ' + ctx.zoneDistAtr.toFixed(2)));
    items.push(g(ctx.rr == null ? null : Math.round(ctx.rr * 100) / 100 >= 2, 'יחס סיכוי לסיכון לפחות 2 ליעד ראשון', ctx.rr == null ? '' : 'כרגע ' + ctx.rr.toFixed(2)));
    items.push(g(ctx.eventSoonMin == null ? null : ctx.eventSoonMin > 60, 'אין דוח או אירוע מאקרו בשעה הקרובה', ctx.eventSoonMin == null ? 'לא בדקתי יומן אירועים' : 'בעוד ' + ctx.eventSoonMin + ' דקות'));
    // חוסמים
    items.push(g(ctx.dayRangeAtr == null ? null : ctx.dayRangeAtr <= 2, 'טווח היום עדיין עד 2 ATR', ctx.dayRangeAtr == null ? '' : 'כרגע ' + ctx.dayRangeAtr.toFixed(2)));
    items.push(g(ctx.stopsInRow == null ? null : ctx.stopsInRow < 2, 'לא שני סטופים ברצף', ctx.stopsInRow == null ? '' : ctx.stopsInRow + ' ברצף'));
    var dropOk = ctx.prevDayDropPct == null ? null : (ctx.prevDayDropPct > -10 || ctx.newBase === true);
    items.push(g(dropOk, 'אין ירידה של מעל 10% אתמול בלי בסיס חדש', ctx.prevDayDropPct == null ? '' : 'אתמול ' + ctx.prevDayDropPct.toFixed(1) + '%'));
    var failed = items.filter(function (x) { return x.ok === false; }).length;
    var unknown = items.filter(function (x) { return x.ok === null; }).length;
    return { items: items, failed: failed, unknown: unknown, ok: failed === 0 && unknown === 0, status: failed ? 'blocked' : unknown ? 'unverified' : 'ready' };
  }

  // התאמת גודל: מכפיל בין 0.25 ל-1, עם סיבות
  // ctx: {daysToEarnings, atrPct, sentiment (-1..1), dir}
  function sizeFactor(ctx) {
    ctx = ctx || {};
    var f = 1, why = [];
    if (ctx.daysToEarnings != null && ctx.daysToEarnings <= 2) { f *= 0.5; why.push('דוחות בתוך ' + ctx.daysToEarnings + ' ימים'); }
    if (ctx.atrPct != null && ctx.atrPct > 6) { f *= 0.75; why.push('תנודתיות גבוהה (ATR ' + ctx.atrPct.toFixed(1) + '% מהמחיר)'); }
    if (ctx.sentiment != null && ctx.dir) {
      var against = ctx.dir === 'long' ? ctx.sentiment < -0.25 : ctx.sentiment > 0.25;
      if (against) { f *= 0.75; why.push('חדשות נגד הכיוון'); }
    }
    return { factor: Math.max(0.25, Math.round(f * 100) / 100), reasons: why };
  }

  // עסקאות רצופות שהסתיימו בסטופ (הפסד) היום, מהאחרונה אחורה
  function stopsInRow(trades, sinceTs) {
    var closed = (trades || []).filter(function (t) { return t.closedAt && t.closedAt >= sinceTs; }).sort(function (a, b) { return b.closedAt - a.closedAt; });
    var n = 0;
    for (var i = 0; i < closed.length; i++) { if ((closed[i].r != null ? closed[i].r : closed[i].R) < 0) n++; else break; }
    return n;
  }

  AT.session = { PHASES: PHASES, phase: phase, minutesToOpen: minutesToOpen, superSetup: superSetup, sizeFactor: sizeFactor, stopsInRow: stopsInRow };
  if (typeof module !== 'undefined' && module.exports) module.exports = AT.session;
})(typeof window !== 'undefined' ? window : globalThis);

