/* שקלול פוזיציה: בלחיצה אחת על פוזיציה מקבלים סקירה קצרה וקולעת: ציונים לפי טכני, חדשות, מאקרו, בתי השקעות ויסודות,
   דירוגי בתי השקעות וברוקרים, תוצאות דוחות, טכני ופונדמנטלי בקצרה, והמלצה לפוזיציה (להחזיק, להדק סטופ, לצמצם או לצאת). */
(function () {
  'use strict';
  var DP = window.__deep, $q = function (s) { return document.querySelector(s); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var num = function (n, d) { return n == null || !isFinite(n) ? '–' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); };
  var fh = function (p) { var c = DP.getClient(); return c._json(c.fhBase + p + (p.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(S.fh), c.fhLimiter); };
  var CACHE = {}, TTL = 10 * 60e3;
  var STATE = { uptrend: 'מגמת עלייה', up: 'מגמת עלייה', bull: 'מגמת עלייה', downtrend: 'מגמת ירידה', down: 'מגמת ירידה', bear: 'מגמת ירידה', range: 'מסחר בטווח', sideways: 'מסחר בטווח' };

  async function analyze(t, msg, force) {
    var sym = t.ticker, hit = CACHE[sym]; if (!force && hit && Date.now() - hit.t < TTL) return hit;
    var c = DP.getClient(), out = { sym: sym, t: Date.now() }, now = new Date(), d = function (x) { return x.toISOString().slice(0, 10); };
    msg('טוען נרות וחישוב טכני…'); var bars = null; try { bars = await c.series(sym, '1day', 300); } catch (e) { out.barsErr = e.message; }
    var tech = bars ? AT.engine.analyzeTF(bars, '1D') : null; if (tech && !tech.ok) tech = null;
    msg('מושך נתוני חברה, דירוגי אנליסטים ודוחות…');
    var P = await Promise.all([S.fh ? c.fundamentals(sym).catch(function () { return null; }) : null, S.fh ? c.newsAny(sym).catch(function () { return null; }) : null, S.fh ? c.earningsAny(sym).catch(function () { return null; }) : null,
      S.fh ? fh('/stock/earnings?symbol=' + sym).catch(function () { return null; }) : null, S.fh ? fh('/stock/price-target?symbol=' + sym).catch(function () { return null; }) : null,
      S.fh ? fh('/calendar/earnings?symbol=' + sym + '&from=' + d(now) + '&to=' + d(new Date(Date.now() + 120 * 864e5))).catch(function () { return null; }) : null]);
    var fund = P[0], news = P[1], earn = P[2]; out.hist = Array.isArray(P[3]) ? P[3].slice(0, 4) : []; out.pt = P[4] && P[4].targetMean ? P[4] : null; out.next = P[5] && P[5].earningsCalendar && P[5].earningsCalendar[0] || null;
    var live = (typeof LIVE !== 'undefined' && LIVE[sym] && LIVE[sym].price) || null, price = live || (tech && tech.price) || (bars && bars[bars.length - 1].c) || t.entryPrice || t.plan.entry; out.price = price; out.tech = tech;
    var fs = fund ? DP.fundScore(fund, price) : null; out.fs = fs; out.fund = fund;
    var stub = function () { return { mode: 'swing', ex: { score: tech ? tech.score : null, headline: '', pros: [], risks: [] }, an: { combined: { vetoes: [] } }, base: null, plan: null, sf: 1, gates: { items: [], failed: 0, unknown: 0, ok: true, status: 'ready' } }; };
    var res = { sym: sym, bars: bars ? { '1D': bars } : {}, price: price, fund: fund, fs: fs, news: news, earn: earn, days: earn && earn.date ? Math.round((Date.parse(earn.date) - Date.now()) / 864e5) : null, ctx: null, regime: null, modes: { day: stub(), swing: stub(), long: stub() }, at: Date.now(), ai: {} };
    if (typeof aiKey === 'function' && aiKey() && window.DeepCtx) { msg('מחפש ברשת חדשות, מאקרו ודירוגי בתי השקעות וברוקרים (עד חצי דקה)…'); try { await DeepCtx.start(res); } catch (e) { out.ctxErr = e.message; } } else out.noAi = true;
    out.res = res; out.uni = DP.uniFor(res, res.modes.swing, 'swing'); out.ai = res.ctx && res.ctx.ai && !res.ctx.ai.err ? res.ctx.ai : null; out.t = Date.now(); CACHE[sym] = out; return out;
  }

  /* ---------- המלצה לפוזיציה ---------- */
  function advise(t, o) {
    var sg = t.dir === 'long' ? 1 : -1, S0 = o.uni.score * sg, px = o.price, entry = t.entryPrice || t.plan.entry, stop = t.plan.stop, risk = Math.abs(entry - stop) || 0, Rnow = risk ? ((px - entry) * sg) / risk : 0;
    var nearStop = px > 0 && Math.abs(px - stop) / px < 0.02, atr = o.tech && o.tech.atr, ed = o.next && o.next.date ? Math.round((Date.parse(o.next.date) - Date.now()) / 864e5) : (o.res.days != null ? o.res.days : null);
    var k, txt, why;
    if (S0 <= -40 || (S0 <= -18 && nearStop)) { k = 'exit'; txt = 'לשקול לצאת'; why = 'המכלול (' + o.uni.score + ') מצביע נגד הפוזיציה' + (nearStop ? ' והמחיר קרוב לסטופ' : '') + '.'; }
    else if (S0 <= -18) { k = 'reduce'; txt = 'לשקול לצמצם'; why = 'רוב הרכיבים עברו לכיוון ההפוך לפוזיציה.'; }
    else if (S0 < 18) { k = 'tight'; txt = 'להחזיק בזהירות ולהדק סטופ'; why = 'אין כיוון ברור: הפוזיציה לא נתמכת ולא נסתרת.'; }
    else if (S0 >= 40) { k = 'hold'; txt = 'להחזיק'; why = 'רוב הרכיבים תומכים בכיוון הפוזיציה.'; }
    else { k = 'hold'; txt = 'להחזיק, בלי להוסיף'; why = 'יש תמיכה מתונה בכיוון הפוזיציה.'; }
    var sugg = null; if (k !== 'exit') { var cand = []; if (Rnow >= 2) cand.push(entry + sg * risk); else if (Rnow >= 1) cand.push(entry); if (atr && S0 >= 18) cand.push(px - sg * 2 * atr); cand = cand.filter(function (v) { return sg > 0 ? v > stop && v < px : v < stop && v > px; }); if (cand.length) sugg = sg > 0 ? Math.max.apply(null, cand) : Math.min.apply(null, cand); }
    var warn = []; if (ed != null && ed >= 0 && ed <= 7) warn.push('דוח רבעוני בעוד ' + ed + ' ימים: פער מחיר אפשרי. כדאי לצמצם או להבטיח סטופ.');
    if (o.uni.conflict) warn.push('סתירה בין הניתוח הטכני לחדשות והמאקרו.');
    return { k: k, txt: txt, why: why, Rnow: Rnow, sugg: sugg, warn: warn, S0: S0, ed: ed };
  }

  /* ---------- תצוגה ---------- */
  var tone = function (v) { return v == null ? '' : v >= 18 ? 'up' : v <= -18 ? 'down' : ''; };
  var word = function (v) { return v == null ? 'אין מידע' : v >= 40 ? 'חיובי מאוד' : v >= 18 ? 'חיובי' : v > -18 ? 'ניטרלי' : v > -40 ? 'שלילי' : 'שלילי מאוד'; };
  function part(o, keys) { var P = o.uni.parts.filter(function (p) { return keys.indexOf(p.k) >= 0; }); if (!P.length) return null; var w = 0, s = 0; P.forEach(function (p) { w += p.w; s += p.w * p.v; }); return Math.round(s / w); }
  function render(t, o) {
    var a = advise(t, o), res = o.res, ai = o.ai, f = o.fund || {}, rec = f.rec, h = '';
    var tiles = [['טכני', part(o, ['tech'])], ['חדשות', part(o, ['headlines', 'company'])], ['מאקרו', part(o, ['macro', 'politics', 'sector'])], ['בתי השקעות', part(o, ['analysts'])], ['יסודות', part(o, ['fund'])]];
    h += '<div class="pw-v ' + a.k + '"><div><small>המלצה לפוזיציה ' + esc(t.ticker) + ' (' + (t.dir === 'long' ? 'לונג' : 'שורט') + ')</small><b>' + esc(a.txt) + '</b><span>' + esc(a.why) + '</span></div><div class="pw-sc"><b dir="ltr">' + (o.uni.score >= 0 ? '+' : '') + o.uni.score + '</b><small>ציון משולב</small></div></div>';
    h += '<div class="pw-tl">' + tiles.map(function (x) { return '<div class="' + tone(x[1]) + '"><small>' + x[0] + '</small><b dir="ltr">' + (x[1] == null ? '–' : (x[1] > 0 ? '+' : '') + x[1]) + '</b><span>' + word(x[1]) + '</span></div>'; }).join('') + '</div>';
    h += '<div class="pw-pos"><div><span>מחיר עכשיו</span><b dir="ltr">' + num(o.price) + '</b></div><div><span>תוצאה</span><b dir="ltr" class="' + (a.Rnow >= 0 ? 'up' : 'down') + '">' + (a.Rnow >= 0 ? '+' : '') + a.Rnow.toFixed(2) + 'R</b></div><div><span>סטופ נוכחי</span><b dir="ltr" class="down">' + num(t.plan.stop) + '</b></div>' + (a.sugg ? '<div><span>סטופ מוצע</span><b dir="ltr" class="up">' + num(a.sugg) + '</b></div>' : '') + '</div>';
    a.warn.forEach(function (w) { h += '<div class="dp-flag warn">' + esc(w) + '</div>'; });
    /* בתי השקעות וברוקרים */
    h += '<h4 class="cx-h">בתי השקעות וברוקרים</h4>';
    if (rec) { var tot = (rec.strongBuy || 0) + (rec.buy || 0) + (rec.hold || 0) + (rec.sell || 0) + (rec.strongSell || 0); h += '<div class="pw-rec"><span class="up">קנייה ' + ((rec.strongBuy || 0) + (rec.buy || 0)) + '</span><span>החזק ' + (rec.hold || 0) + '</span><span class="down">מכירה ' + ((rec.sell || 0) + (rec.strongSell || 0)) + '</span><small>מתוך ' + tot + ' אנליסטים</small></div>'; }
    if (o.pt) h += '<div class="dp-foot" style="text-align:right">יעד מחיר ממוצע <b>$' + num(o.pt.targetMean, 0) + '</b> (' + (o.pt.targetMean / o.price >= 1 ? '+' : '') + num((o.pt.targetMean / o.price - 1) * 100, 0) + '% מהמחיר), טווח $' + num(o.pt.targetLow, 0) + ' עד $' + num(o.pt.targetHigh, 0) + '</div>';
    if (ai && ai.analysts && ai.analysts.length) h += ai.analysts.slice(0, 4).map(function (i) { return '<div class="cx-i"><b>' + esc(i.point) + '</b>' + (i.why ? '<p>' + esc(i.why) + '</p>' : '') + '<a href="' + esc(i.url) + '" target="_blank" rel="noopener">' + esc(i.source || 'מקור') + (i.date ? ' · ' + esc(i.date) : '') + ' ↗</a></div>'; }).join('');
    else if (!rec && !o.pt) h += '<div class="dp-empty">' + (o.noAi ? 'לדירוגי בתי השקעות צריך מפתח Finnhub ומפתח בינה בהגדרות.' : 'לא נמצאו דירוגים.') + '</div>';
    /* חדשות ומאקרו */
    h += '<h4 class="cx-h">חדשות ומאקרו</h4>';
    if (ai) { h += '<div class="dp-regime ' + (ai.bias === 'bullish' ? 'on' : ai.bias === 'bearish' ? 'off' : '') + '"><i></i><b>' + (ai.bias === 'bullish' ? 'הקשר חיובי' : ai.bias === 'bearish' ? 'הקשר שלילי' : 'הקשר מעורב') + '</b><span>' + esc(ai.bias_reason || '') + '</span></div>'; h += ['macro', 'company', 'politics'].map(function (k) { return (ai[k] || []).slice(0, 1).map(function (i) { return '<div class="cx-i"><b>' + esc(i.point) + '</b><a href="' + esc(i.url) + '" target="_blank" rel="noopener">' + esc(i.source || 'מקור') + ' ↗</a></div>'; }).join(''); }).join(''); }
    else h += '<div class="dp-empty">' + (o.noAi ? 'לחדשות ומאקרו צריך מפתח בינה בהגדרות.' : (o.ctxErr ? 'החיפוש ברשת נכשל: ' + esc(o.ctxErr) : 'לא נמצא מידע.')) + '</div>';
    /* דוחות */
    h += '<h4 class="cx-h">תוצאות דוחות</h4>';
    if (o.next && o.next.date) h += '<div class="dp-foot" style="text-align:right">הדוח הבא: <b>' + esc(o.next.date) + '</b>' + (a.ed != null ? ' (בעוד ' + a.ed + ' ימים)' : '') + (o.next.hour === 'bmo' ? ' · לפני הפתיחה' : o.next.hour === 'amc' ? ' · אחרי הסגירה' : '') + (o.next.epsEstimate != null ? ' · צפי רווח למניה $' + num(o.next.epsEstimate) : '') + '</div>';
    if (o.hist.length) h += '<div class="cx-t">' + o.hist.map(function (x) { var s = x.surprisePercent; return '<div class="cx-r" style="grid-template-columns:1.1fr 1fr 1fr 1.2fr"><span>' + esc(x.period || '') + '</span><span>בפועל ' + num(x.actual) + '</span><span>צפי ' + num(x.estimate) + '</span><span class="' + (s > 0 ? 'up' : s < 0 ? 'down' : '') + '">' + (s != null ? (s > 0 ? 'הפתיעה +' : 'פספסה ') + num(Math.abs(s), 1) + '%' : '–') + '</span></div>'; }).join('') + '</div>';
    else if (!o.next) h += '<div class="dp-empty">אין נתוני דוחות.</div>';
    /* טכני ופונדמנטלי בקצרה */
    var tb = [], tc = o.tech; if (tc) { tb.push(STATE[tc.state] || ('מצב: ' + tc.state)); if (tc.rsi != null) tb.push('RSI ' + Math.round(tc.rsi) + (tc.rsi > 70 ? ' (קנוי יתר)' : tc.rsi < 30 ? ' (מכור יתר)' : '')); if (tc.ema && tc.ema.e21) tb.push('המחיר ' + (o.price >= tc.ema.e21 ? 'מעל' : 'מתחת ל') + '-EMA21 (' + num(tc.ema.e21) + ')'); var sr = (tc.zones && tc.zones.sr || []).map(function (z) { return { l: z.level, d: Math.abs(z.level - o.price) }; }).sort(function (x, y) { return x.d - y.d; }).slice(0, 2); if (sr.length) tb.push('רמות קרובות: ' + sr.map(function (z) { return num(z.l); }).join(' ו-')); if (tc.atr) tb.push('תנודתיות יומית ממוצעת ' + num(tc.atr / o.price * 100, 1) + '%'); (tc.patterns || []).slice(0, 1).forEach(function (p) { tb.push('תבנית נרות: ' + p.name); }); }
    var fb = []; if (o.fs) { fb.push('ציון יסוד ' + o.fs.score + ' מתוך 100'); (o.fs.notes || []).slice(0, 3).forEach(function (n) { fb.push(n.t); }); }
    h += '<div class="pw-two"><div><h4 class="cx-h">טכני בקצרה</h4>' + (tb.length ? '<ul class="dp-list pos">' + tb.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<div class="dp-empty">' + (o.barsErr ? 'אין נרות: ' + esc(o.barsErr) : 'אין נתונים') + '</div>') + '</div><div><h4 class="cx-h">פונדמנטלי בקצרה</h4>' + (fb.length ? '<ul class="dp-list pos">' + fb.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<div class="dp-empty">אין נתוני יסוד</div>') + '</div></div>';
    h += '<div class="dp-actions" style="grid-template-columns:1fr 1fr 1fr"><button class="btn ghost" id="pwSave">שמור ביומן</button><button class="btn ghost" id="pwFull">סקירה מלאה</button><button class="btn ghost" id="pwAgain">רענן</button></div><div class="dp-foot" style="text-align:right">נכון ל-' + new Date(o.t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) + '. החדשות והדירוגים ממחקר ברשת ועלולים לטעות, כל פריט עם מקור. ההמלצה היא כלי עזר לפי נתונים, ולא ייעוץ השקעות. ההחלטה שלך.</div>';
    return { html: h, a: a };
  }

  /* ---------- חלון ---------- */
  function sheet() {
    var el = $q('#pwOv'); if (el) return el; el = document.createElement('div'); el.id = 'pwOv'; el.className = 'pw-ov'; el.style.display = 'none';
    el.innerHTML = '<div class="pw-sh" role="dialog" aria-label="שקלול פוזיציה"><div class="pw-hd"><b id="pwT"></b><button id="pwX" aria-label="סגור">✕</button></div><div id="pwB"></div></div>'; document.body.appendChild(el);
    el.onclick = function (e) { if (e.target === el) el.style.display = 'none'; }; el.querySelector('#pwX').onclick = function () { el.style.display = 'none'; }; return el;
  }
  async function open(t, force) {
    var el = sheet(), B = el.querySelector('#pwB'); el.style.display = ''; el.querySelector('#pwT').textContent = 'שקלול פוזיציה · ' + t.ticker; B.innerHTML = '<div class="dp-skel"><i style="height:90px"></i><i style="height:90px"></i></div><div class="dp-foot" id="pwMsg" style="text-align:center">מתחיל…</div>';
    var msg = function (m) { var x = $q('#pwMsg'); if (x) x.textContent = m; };
    try {
      var o = await analyze(t, msg, force), r = render(t, o); B.innerHTML = r.html;
      B.querySelector('#pwAgain').onclick = function () { open(t, true); }; B.querySelector('#pwFull').onclick = function () { el.style.display = 'none'; window.openDeep(t.ticker); };
      B.querySelector('#pwSave').onclick = function () { t.log.push({ t: Date.now(), type: 'עדכון', note: 'שקלול פוזיציה: ' + r.a.txt + ' (ציון ' + o.uni.score + ', ' + (r.a.Rnow >= 0 ? '+' : '') + r.a.Rnow.toFixed(1) + 'R)' + (r.a.sugg ? ', סטופ מוצע ' + num(r.a.sugg) : '') }); save(); renderTrades(); toast('נשמר ביומן'); };
    } catch (e) { B.innerHTML = '<div class="dp-empty">השקלול נכשל: ' + esc(e.message) + (/429/.test(e.message) ? '. מגבלת הקצב של ספק הנתונים, נסה בעוד דקה.' : '') + '</div><button class="btn ghost" id="pwAgain">נסה שוב</button>'; B.querySelector('#pwAgain').onclick = function () { open(t, true); }; }
  }
  window.__pw = { open: open, analyze: analyze, advise: advise };
})();
