/* סקירת מניה בסגנון TradingView, מנתונים שלך (Finnhub ו-Twelve Data): כותרת עם לוגו, לשוניות, תשואות לפי תקופה,
   נתוני מפתח, חברות להשוואה, פרטי חברה, מד אנליסטים ומד טכני, עונתיות, ורשימת מעקב בצד. */
(function () {
  'use strict';
  var C = window.__chart; if (!C || !window.__deep) return;
  var DP = window.__deep, ST = C.state, $q = function (s) { return document.querySelector(s); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var num = function (n, d) { return n == null || !isFinite(n) ? '–' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); };
  var big = function (m) { return m == null || !isFinite(m) ? '–' : m >= 1e6 ? '$' + num(m / 1e6, 2) + 'T' : m >= 1e3 ? '$' + num(m / 1e3, 2) + 'B' : '$' + num(m, 0) + 'M'; };
  var pc = function (v) { return v == null || !isFinite(v) ? '–' : (v >= 0 ? '+' : '') + num(v, 2) + '%'; };
  var cl = function (v) { return v > 0 ? 'up' : v < 0 ? 'down' : ''; };
  var fh = function (p) { var c = DP.getClient(); return c._json(c.fhBase + p + (p.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(S.fh), c.fhLimiter); };
  var store = {}, TIMER = null;

  /* ---------- מד (חצי עיגול) ---------- */
  function gauge(v, label) {
    var P = function (a, r) { var t = (180 - a) * Math.PI / 180; return [100 + r * Math.cos(t), 100 - r * Math.sin(t)]; };
    var seg = function (a1, a2, col) { var p1 = P(a1, 80), p2 = P(a2, 80); return '<path d="M' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + ' A80 80 0 0 1 ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1) + '" stroke="' + col + '" stroke-width="12" fill="none" stroke-linecap="round"/>'; };
    var ang = 90 + Math.max(-1, Math.min(1, v)) * 80, n = P(ang, 62);
    return '<svg viewBox="0 0 200 130" class="ov-g"><g>' + seg(8, 40, '#ef5350') + seg(48, 80, '#e57373') + seg(88, 92, '#9aa4b5') + seg(100, 132, '#4db6ac') + seg(140, 172, '#42a5f5') + '</g><line x1="100" y1="100" x2="' + n[0].toFixed(1) + '" y2="' + n[1].toFixed(1) + '" stroke="#e8edf5" stroke-width="3" stroke-linecap="round"/><circle cx="100" cy="100" r="6" fill="#e8edf5"/><text x="100" y="124" text-anchor="middle" fill="#e8edf5" font-size="15" font-weight="700">' + esc(label) + '</text></svg>';
  }
  var LBL = function (v) { return v >= 0.6 ? 'קנייה חזקה' : v >= 0.2 ? 'קנייה' : v > -0.2 ? 'ניטרלי' : v > -0.6 ? 'מכירה' : 'מכירה חזקה'; };

  /* ---------- נתונים ---------- */
  async function loadAll(sym) {
    if (store[sym] && Date.now() - store[sym].t < 10 * 60e3) return store[sym];
    var o = { t: Date.now() }, ok = sym.indexOf('/') < 0 && S.fh;
    if (ok) {
      var d = function (x) { return x.toISOString().slice(0, 10); }, now = new Date(), later = new Date(Date.now() + 150 * 864e5);
      var r = await Promise.all([fh('/stock/profile2?symbol=' + sym).catch(function () { return null; }), fh('/stock/metric?symbol=' + sym + '&metric=all').catch(function () { return null; }), fh('/stock/recommendation?symbol=' + sym).catch(function () { return null; }), fh('/stock/price-target?symbol=' + sym).catch(function () { return null; }), fh('/calendar/earnings?symbol=' + sym + '&from=' + d(now) + '&to=' + d(later)).catch(function () { return null; }), fh('/stock/peers?symbol=' + sym).catch(function () { return null; })]);
      o.prof = r[0] || {}; o.m = (r[1] && r[1].metric) || {}; o.rec = Array.isArray(r[2]) && r[2][0]; o.pt = r[3]; o.earn = r[4] && r[4].earningsCalendar && r[4].earningsCalendar[0]; var peers = (Array.isArray(r[5]) ? r[5] : []).filter(function (t) { return t !== sym && /^[A-Z.]{1,6}$/.test(t); }).slice(0, 6);
      o.peers = (await Promise.all(peers.map(async function (t) { try { var q = await fh('/quote?symbol=' + t), p = await fh('/stock/profile2?symbol=' + t); return q && q.c > 0 ? { s: t, n: (p && p.name) || '', c: q.c, dp: q.dp } : null; } catch (e) { return null; } }))).filter(Boolean);
    }
    try { o.daily = await DP.getClient().series(sym === 'BTC' ? 'BTC/USD' : sym, '1day', 300); } catch (e) { o.daily = ST.bars || []; }
    store[sym] = o; return o;
  }
  async function loadMonthly(sym) { var o = store[sym]; if (!o || o.monthly || sym.indexOf('/') >= 0) return; try { o.monthly = await DP.getClient().series(sym, '1month', 240); } catch (e) { o.monthly = []; } }

  /* ---------- חישובים ---------- */
  function periods(o, q) {
    var b = o.daily || [], n = b.length, last = n ? b[n - 1].c : null, out = [], ret = function (k) { return n > k && last ? (last / b[n - 1 - k].c - 1) * 100 : null; };
    var yr = new Date().getUTCFullYear(), ytdB = b.filter(function (x) { return new Date(x.t).getUTCFullYear() < yr; }).pop(), m = o.monthly || [];
    out.push(['1D', q && q.dp != null ? q.dp : ret(1), '5min', 78]); out.push(['5D', ret(5), '1h', 40]); out.push(['1M', ret(21), '1day', 22]); out.push(['3M', ret(63), '1day', 64]); out.push(['6M', ret(126), '1day', 127]);
    out.push(['YTD', ytdB && last ? (last / ytdB.c - 1) * 100 : null, '1day', Math.max(5, b.filter(function (x) { return new Date(x.t).getUTCFullYear() === yr; }).length + 1)]);
    out.push(['שנה', ret(252), '1day', 253]); var mr = function (k) { return m.length > k && last ? (last / m[m.length - 1 - k].c - 1) * 100 : null; };
    out.push(['5 שנים', mr(60), '1month', 62]); out.push(['10 שנים', mr(120), '1month', 122]); out.push(['הכל', m.length > 1 && last ? (last / m[0].c - 1) * 100 : null, '1month', 9999]); return out;
  }
  function seasonal(m) {
    var s = new Array(12).fill(0), n = new Array(12).fill(0); for (var i = 1; i < m.length; i++) { var mo = new Date(m[i].t).getUTCMonth(); s[mo] += (m[i].c / m[i - 1].c - 1) * 100; n[mo]++; } return s.map(function (v, i) { return n[i] ? v / n[i] : null; });
  }
  var MON = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

  /* ---------- תצוגה ---------- */
  function head(o) {
    var sym = ST.sym, p = (o && o.prof) || {}, b = o && o.daily || ST.bars || [], q = (typeof LIVE !== 'undefined' && LIVE[sym]) || null, last = b[b.length - 1], prev = b[b.length - 2];
    var price = q && q.price || (last && last.c), chg = q && q.chg != null ? q.chg : (last && prev ? (last.c / prev.c - 1) * 100 : null), abs = price && chg != null ? price - price / (1 + chg / 100) : null;
    var el = $q('#ovHead'); if (!el) return;
    el.innerHTML = '<div class="ov-id">' + (p.logo ? '<img class="ov-logo" src="' + esc(p.logo) + '" alt="" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">' : '') + '<div><div class="ov-nm">' + esc(p.name || sym) + '</div><div class="ov-sub" dir="ltr"><span>' + esc(p.exchange ? p.exchange.split(' ')[0] : '') + '</span><b>' + esc(sym) + '</b>' + (p.finnhubIndustry ? '<em>' + esc(p.finnhubIndustry) + '</em>' : '') + '</div></div></div>' +
      '<div class="ov-px" dir="ltr"><b id="ovPx">' + num(price) + '</b><small>' + esc(p.currency || 'USD') + '</small><span class="' + cl(chg) + '">' + (abs != null ? (abs >= 0 ? '+' : '') + num(abs) + ' ' : '') + pc(chg) + '</span></div>';
  }
  function overview(o) {
    var el = $q('#csOv'); if (!el) return; var sym = ST.sym, p = o.prof || {}, m = o.m || {}, q = (typeof LIVE !== 'undefined' && LIVE[sym]) || null, g = function () { for (var i = 0; i < arguments.length; i++) { var v = m[arguments[i]]; if (v != null && isFinite(v)) return v; } return null; };
    var per = periods(o, q), out = '';
    out += '<div class="ov-per" id="ovPer">' + per.map(function (x) { return '<button data-p="' + x[0] + '" data-iv="' + x[2] + '" data-n="' + x[3] + '"><span>' + esc(x[0]) + '</span><b class="' + cl(x[1]) + '">' + pc(x[1]) + '</b></button>'; }).join('') + '</div>';
    var revT = g('revenuePerShareTTM') && p.shareOutstanding ? g('revenuePerShareTTM') * p.shareOutstanding : null, nx = o.earn;
    var st = [['שווי שוק', big(p.marketCapitalization), 'ovStats'], ['מכפיל רווח (P/E)', num(g('peTTM', 'peBasicExclExtraTTM')), ''], ['רווח למניה (TTM)', g('epsTTM', 'epsBasicExclExtraItemsTTM') != null ? '$' + num(g('epsTTM', 'epsBasicExclExtraItemsTTM')) : '–', ''], ['תשואת דיבידנד', g('dividendYieldIndicatedAnnual') != null ? num(g('dividendYieldIndicatedAnnual')) + '%' : '–', ''],
      ['הכנסות (TTM)', revT ? big(revT) : '–', ''], ['מניות בהון', p.shareOutstanding ? num(p.shareOutstanding, 0) + 'M' : '–', ''], ['שיא 52 שבועות', g('52WeekHigh') != null ? '$' + num(g('52WeekHigh')) : '–', ''], ['שפל 52 שבועות', g('52WeekLow') != null ? '$' + num(g('52WeekLow')) : '–', ''],
      ['דוח קרוב', nx ? esc(nx.date) + (nx.hour === 'bmo' ? ' · לפני פתיחה' : nx.hour === 'amc' ? ' · אחרי סגירה' : '') : '–', ''], ['צפי רווח לדוח', nx && nx.epsEstimate != null ? '$' + num(nx.epsEstimate) : '–', ''], ['צפי הכנסות', nx && nx.revenueEstimate ? big(nx.revenueEstimate / 1e6) : '–', ''], ['צמיחת הכנסות (שנה)', g('revenueGrowthTTMYoy') != null ? pc(g('revenueGrowthTTMYoy')) : '–', '']];
    out += '<h3 class="ov-h" id="ovStats">נתוני מפתח</h3><div class="ov-st">' + st.map(function (x) { return '<div><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('') + '</div>';
    if (o.peers && o.peers.length) out += '<h3 class="ov-h" id="ovPeers">חברות להשוואה</h3><div class="ov-pe">' + o.peers.map(function (x) { return '<button data-sym="' + esc(x.s) + '"><b dir="ltr">' + esc(x.s) + '</b><small>' + esc(x.n.slice(0, 24)) + '</small><span dir="ltr">' + num(x.c) + '</span><em class="' + cl(x.dp) + '" dir="ltr">' + pc(x.dp) + '</em></button>'; }).join('') + '</div>';
    var rec = o.rec, rv = null, rt = ''; if (rec) { var t = (rec.strongBuy || 0) + (rec.buy || 0) + (rec.hold || 0) + (rec.sell || 0) + (rec.strongSell || 0); if (t) { rv = ((rec.strongBuy || 0) * 2 + (rec.buy || 0) - (rec.sell || 0) - (rec.strongSell || 0) * 2) / (t * 2); rt = (rec.strongBuy || 0) + ' קנייה חזקה · ' + (rec.buy || 0) + ' קנייה · ' + (rec.hold || 0) + ' החזק · ' + (rec.sell || 0) + ' מכירה · ' + (rec.strongSell || 0) + ' מכירה חזקה'; } }
    var tv = null; try { var a = AT.engine.analyzeTF((o.daily || []).map(function (b) { return b; }), '1D'); if (a && a.ok) tv = Math.max(-1, Math.min(1, a.score / 70)); } catch (e) { }
    out += '<div class="ov-gs"><div id="ovTech"><h3 class="ov-h">טכני</h3><div class="dp-foot" style="text-align:right">מסכם את מה שהאינדיקטורים מציעים (מגמה, מומנטום, נפח, תבניות).</div>' + (tv != null ? gauge(tv, LBL(tv)) : '<div class="dp-empty">אין מספיק נרות</div>') + '</div>' +
      '<div id="ovFc"><h3 class="ov-h">דירוג אנליסטים</h3><div class="dp-foot" style="text-align:right">תצוגה מצטברת של דירוגי המקצוענים.</div>' + (rv != null ? gauge(rv, LBL(rv)) + '<div class="dp-foot">' + esc(rt) + '</div>' : '<div class="dp-empty">אין דירוגים</div>') + (o.pt && o.pt.targetMean && last() ? '<div class="dp-foot" style="text-align:right">יעד ממוצע $' + num(o.pt.targetMean, 0) + ' (' + pc((o.pt.targetMean / last().c - 1) * 100) + ' מהמחיר), טווח $' + num(o.pt.targetLow, 0) + ' עד $' + num(o.pt.targetHigh, 0) + '</div>' : '') + '</div></div>';
    var sea = o.monthly && o.monthly.length > 24 ? seasonal(o.monthly) : null;
    out += '<h3 class="ov-h" id="ovSeason">עונתיות <small>תשואה חודשית ממוצעת לאורך השנים</small></h3>' + (sea ? '<div class="ov-sea">' + sea.map(function (v, i) { var h = v == null ? 0 : Math.min(100, Math.abs(v) * 6); return '<div><i class="' + (v >= 0 ? 'up' : 'down') + '" style="height:' + h + 'px;' + (v >= 0 ? 'margin-top:auto' : '') + '"></i><b class="' + cl(v) + '">' + (v == null ? '–' : num(v, 1) + '%') + '</b><small>' + MON[i] + '</small></div>'; }).join('') + '</div>' : '<div class="dp-empty">' + (o.monthly ? 'אין מספיק היסטוריה' : 'טוען היסטוריה חודשית…') + '</div>');
    out += '<h3 class="ov-h" id="ovDet">פרטי החברה</h3><div class="ov-st">' + [['תעשייה', p.finnhubIndustry], ['בורסה', p.exchange], ['מדינה', p.country], ['מטבע', p.currency], ['הנפקה (IPO)', p.ipo], ['אתר', p.weburl ? '<a href="' + esc(p.weburl) + '" target="_blank" rel="noopener" dir="ltr">' + esc(p.weburl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')) + '</a>' : '']].map(function (x) { return '<div><span>' + x[0] + '</span><b>' + (x[1] ? (x[0] === 'אתר' ? x[1] : esc(x[1])) : '–') + '</b></div>'; }).join('') + '</div>';
    el.innerHTML = out;
    function last() { var b = o.daily || []; return b[b.length - 1]; }
    el.querySelectorAll('#ovPer button').forEach(function (b) { b.onclick = function () { ST.iv = b.dataset.iv; ST.range = +b.dataset.n; el.querySelectorAll('#ovPer button').forEach(function (x) { x.classList.toggle('on', x === b); }); C.load().then(function () { if (ST.chart && ST.range) { var n = ST.bars.length, k = Math.min(ST.range, n); ST.chart.timeScale().setVisibleLogicalRange({ from: n - k, to: n + 4 }); } }); }; });
    el.querySelectorAll('[data-sym]').forEach(function (b) { b.onclick = function () { window.openSym(b.dataset.sym); }; });
    head(o);
  }
  /* רשימת מעקב בצד */
  function watch() {
    var el = $q('#csWl'); if (!el) return; var lists = (D.watch || []).filter(function (w) { return !w.closed && w.items && w.items.length; });
    el.innerHTML = '<div class="wl-hd">רשימת מעקב</div>' + (lists.length ? lists.map(function (w) { return '<div class="wl-sec">' + esc(w.name) + '</div>' + w.items.filter(function (t) { return t !== 'BTC'; }).map(function (t) { var q = (typeof LIVE !== 'undefined' && LIVE[t]) || {}; return '<button data-sym="' + esc(t) + '" class="' + (t === ST.sym ? 'on' : '') + '"><b dir="ltr">' + esc(t) + '</b><span dir="ltr">' + (q.price ? num(q.price) : '–') + '</span><em class="' + cl(q.chg) + '" dir="ltr">' + (q.chg != null ? pc(q.chg) : '') + '</em></button>'; }).join(''); }).join('') : '<div class="dp-empty">אין רשימות</div>');
    el.querySelectorAll('[data-sym]').forEach(function (b) { b.onclick = function () { window.openSym(b.dataset.sym); }; });
  }
  /* ---------- בניית העמוד ---------- */
  function build() {
    var sec = $q('#p-sym'); if (!sec || $q('#ovHead')) return;
    var col = document.createElement('div'); col.className = 'cs-col'; while (sec.firstChild) col.appendChild(sec.firstChild);
    var shell = document.createElement('div'); shell.className = 'cs-shell'; var wl = document.createElement('aside'); wl.id = 'csWl'; wl.className = 'cs-wl'; shell.appendChild(wl); shell.appendChild(col); sec.appendChild(shell);
    var hd = document.createElement('div'); hd.id = 'ovHead'; hd.className = 'ov-head'; col.insertBefore(hd, col.firstChild); var old = $q('#csHead'); if (old) old.style.display = 'none';
    var tabs = document.createElement('div'); tabs.className = 'ov-tabs'; tabs.id = 'ovTabs'; tabs.innerHTML = '<button data-t="#ovHead">סקירה כללית</button><button data-t="#csChart">גרף</button><button data-t="#ovStats">נתונים</button><button data-t="#ovTech">טכני</button><button data-t="#ovFc">תחזית אנליסטים</button><button data-t="#ovSeason">עונתיות</button><button data-t="#csTabs">פיננסים וחדשות</button>';
    col.insertBefore(tabs, hd.nextSibling); tabs.onclick = function (e) { var b = e.target.closest('button'); if (!b) return; var t = $q(b.dataset.t); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); tabs.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); };
    var ov = document.createElement('div'); ov.id = 'csOv'; ov.className = 'ov-body'; var ct = $q('#csTabs'); col.insertBefore(ov, ct);
  }
  async function refresh() {
    build(); watch(); var sym = ST.sym; head(store[sym]); var el = $q('#csOv'); if (el && !store[sym]) el.innerHTML = '<div class="dp-skel"><i style="height:120px"></i></div>';
    var o = await loadAll(sym); if (sym !== ST.sym) return; overview(o); watch(); await loadMonthly(sym); if (sym !== ST.sym) return; overview(o); watch();
  }
  var _e = onEnter; onEnter = function (id) { _e(id); if (id === 'p-sym') refresh(); };
  /* מחיר חי בכותרת וברשימת המעקב */
  clearInterval(TIMER); TIMER = setInterval(function () { if (!$q('#p-sym.on')) return; var q = (typeof LIVE !== 'undefined' && LIVE[ST.sym]) || null; var el = $q('#ovPx'); if (el && q && q.price > 0) el.textContent = num(q.price); watch(); }, 4000);
  window.__ov = { refresh: refresh, gauge: gauge, periods: periods, seasonal: seasonal, store: store };
})();
