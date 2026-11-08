/* חבילת הסוחר היומי: מחירים חיים (WebSocket של Finnhub), התראות מחיר, שער הפסד יומי, היומן שלומד אותך
   (ניתוח לפי שעה, יום, כיוון ותיוג), ייבוא CSV מהברוקר, סיכום ערב, עסקאות מקורבים ויעדי מחיר, וקיצורי מקלדת. */
(function () {
  'use strict';
  var $q = function (s) { return document.querySelector(s); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var money = function (v) { return (v >= 0 ? '+' : '−') + '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 }); };
  var DP = window.__deep;
  function fh(path) { var c = DP.getClient(); return c._json(c.fhBase + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(S.fh), c.fhLimiter); }

  /* ---------- כל העסקאות הסגורות במקום אחד ---------- */
  function closedAll() {
    var out = [];
    (D.closed || []).forEach(function (c) { if (c.entry && c.exit && c.qty) out.push({ t: c.t, ticker: c.ticker, dir: c.dir === 'short' ? 'short' : 'long', p: pnl(c), tag: c.tag || '', entry: c.entry, exit: c.exit, qty: c.qty }); });
    (D.trades || []).forEach(function (t) { if (t.status === 'closed' && t.entryPrice && t.exit && t.exit.price) out.push({ t: t.exit.t || t.created || 0, ticker: t.ticker, dir: t.dir, p: tpnl(t), tag: t.tag || '', entry: t.entryPrice, exit: t.exit.price, qty: t.qty, pattern: t.plan && t.plan.pattern }); });
    return out.filter(function (x) { return isFinite(x.p); });
  }

  /* ---------- שער הפסד יומי ---------- */
  var t0 = function () { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function todayPnl() { var s0 = t0(); return closedAll().filter(function (x) { return x.t >= s0; }).reduce(function (a, x) { return a + x.p; }, 0); }
  function limit() { return +S.dayLoss > 0 ? +S.dayLoss : (+S.risk > 0 ? S.risk * 2 : 0); }
  function locked() { var l = limit(); return l > 0 && todayPnl() <= -l && D.lockOff !== todayStr(); }
  function gateOk() {
    if (!locked()) return true;
    if (confirm('הגעת למגבלת ההפסד היומית ($' + limit() + '). הכלל שקבעת: אין כניסות חדשות עד מחר.\n\nלבטל את הנעילה להיום?') && confirm('בטוח? רוב ההפסדים הגדולים קורים אחרי שעוברים את המגבלה.')) { D.lockOff = todayStr(); save(); paintBar(); return true; }
    return false;
  }
  function bar() {
    var el = $q('#proBar'), main = document.querySelector('main'); if (!el && main) { el = document.createElement('div'); el.id = 'proBar'; main.insertBefore(el, $q('#qs') || main.firstChild); }
    return el;
  }
  var wsState = 'off';
  function paintBar() {
    var el = bar(); if (!el) return; var l = limit(), p = todayPnl(), lk = locked(), n = (D.pAlerts || []).filter(function (a) { return !a.done; }).length;
    el.className = lk ? 'pro-bar lock' : 'pro-bar';
    el.innerHTML = '<span class="pro-dot ' + (wsState === 'on' ? 'on' : '') + '" title="' + (wsState === 'on' ? 'מחירים חיים מחוברים' : 'מחירים בעיכוב') + '"></span>' +
      '<span>היום <b class="' + (p >= 0 ? 'up' : 'down') + '">' + money(p) + '</b></span>' +
      (l ? '<span>מגבלת הפסד <a href="#" id="proLim">$' + l.toLocaleString('en-US') + '</a></span>' : '<span><a href="#" id="proLim">קבע מגבלת הפסד יומית</a></span>') +
      (lk ? '<b class="down">נעול: אין כניסות חדשות</b>' : '') + (n ? '<span>' + n + ' התראות מחיר</span>' : '');
    var a = $q('#proLim'); if (a) a.onclick = function (e) { e.preventDefault(); var v = prompt('מגבלת הפסד יומית בדולרים (0 לביטול):', limit() || ''); if (v === null) return; S.dayLoss = Math.max(0, +v || 0); saveS(); paintBar(); };
  }

  /* ---------- מחירים חיים ---------- */
  var ws = null, subs = {}, backoff = 1500, uiT = 0, trT = 0;
  function wantSyms() {
    var set = {}, add = function (t) { if (t && /^[A-Z.]{1,6}$/.test(t)) set[t] = 1; };
    try { (D.watch || []).forEach(function (w) { if (!w.closed) (w.items || []).forEach(add); }); (D.trades || []).forEach(function (t) { if (t.status !== 'closed') add(t.ticker); }); (D.plans || []).forEach(function (p) { add(p.ticker); }); add(curSym); if (DP.state.res) add(DP.state.res.sym); } catch (e) { }
    return Object.keys(set).slice(0, 50);
  }
  function syncSubs() {
    if (!ws || ws.readyState !== 1) return; var want = wantSyms(), w = {};
    want.forEach(function (s) { w[s] = 1; if (!subs[s]) { ws.send(JSON.stringify({ type: 'subscribe', symbol: s })); subs[s] = 1; } });
    Object.keys(subs).forEach(function (s) { if (!w[s]) { ws.send(JSON.stringify({ type: 'unsubscribe', symbol: s })); delete subs[s]; } });
  }
  function onTick(s, p, t) {
    var q = LIVE[s] || (LIVE[s] = {}); q.price = p; q.ts = Math.round(t / 1000); q.live = true; if (q.prev > 0) q.chg = (p / q.prev - 1) * 100;
    checkAlerts(s, p);
    var now = Date.now(); if (now - uiT > 1500) { uiT = now; uiRefresh(); }
  }
  function uiRefresh() {
    try {
      if ($q('#p-today.on')) renderWatch();
      if ($q('#p-port.on') && Date.now() - trT > 4000) { trT = Date.now(); renderTrades(); }
      var r = DP.state.res, h = $q('#dpOut .dp-hero');
      if (r && h && LIVE[r.sym.replace('/USD', '')]) { var q = LIVE[r.sym.replace('/USD', '')], chip = $q('#dpLiveP'); if (!chip) { chip = document.createElement('div'); chip.id = 'dpLiveP'; chip.className = 'dp-livep'; h.appendChild(chip); } var ref = r.price || q.price; chip.innerHTML = '<span class="pro-dot on"></span>חי <b>' + q.price.toFixed(2) + '</b> <span class="' + (q.price >= ref ? 'up' : 'down') + '">' + (q.price >= ref ? '▲' : '▼') + ' ' + Math.abs((q.price / ref - 1) * 100).toFixed(2) + '% מהניתוח</span>'; }
    } catch (e) { }
  }
  function connect() {
    if (!S.fh || ws || typeof WebSocket === 'undefined') return;
    try { ws = new WebSocket('wss://ws.finnhub.io?token=' + encodeURIComponent(S.fh)); } catch (e) { ws = null; return; }
    ws.onopen = function () { backoff = 1500; wsState = 'on'; paintBar(); syncSubs(); };
    ws.onmessage = function (ev) { var j; try { j = JSON.parse(ev.data); } catch (e) { return; } if (j.type === 'trade' && j.data) j.data.forEach(function (d) { onTick(d.s, d.p, d.t); }); };
    ws.onclose = function () { ws = null; subs = {}; wsState = 'off'; paintBar(); setTimeout(connect, backoff); backoff = Math.min(60000, backoff * 2); };
    ws.onerror = function () { try { ws.close(); } catch (e) { } };
  }

  /* ---------- התראות מחיר ---------- */
  function checkAlerts(sym, px) {
    var al = D.pAlerts; if (!al || !al.length) return; var hit = false;
    al.forEach(function (a) {
      if (a.done || a.sym !== sym) return;
      if ((a.op === '>=' && px >= a.px) || (a.op === '<=' && px <= a.px)) { a.done = true; a.at = Date.now(); hit = true; fire('pa-' + a.id, a.sym + (a.op === '>=' ? ' עלתה ל-' : ' ירדה ל-') + a.px.toFixed(2) + ' (' + a.label + ')'); }
    });
    if (hit) { save(); paintBar(); }
  }
  function alertsFor(r, m) {
    var p = m && m.plan; if (!p) return toast('אין תוכנית להתראה');
    var tk = r.sym.replace('/USD', ''), cur = (LIVE[tk] && LIVE[tk].price) || r.price; D.pAlerts = D.pAlerts || []; var n = 0;
    [['כניסה', p.entry], ['סטופ', p.stop], ['יעד 1', p.t1]].forEach(function (x) {
      if (!(x[1] > 0)) return; var id = tk + '-' + x[0] + '-' + Math.round(x[1] * 100); if (D.pAlerts.some(function (a) { return a.id === id && !a.done; })) return;
      D.pAlerts.push({ id: id, sym: tk, op: cur < x[1] ? '>=' : '<=', px: x[1], label: x[0], done: false, t: Date.now() }); n++;
    });
    save(); syncSubs(); paintBar(); toast(n ? 'הוגדרו ' + n + ' התראות מחיר. תקבל הודעה, צליל ובטלגרם אם הוגדר (האתר צריך להיות פתוח)' : 'ההתראות כבר מוגדרות');
  }

  /* ---------- היומן לומד: ניתוח לפי שעה, יום, כיוון ותיוג ---------- */
  function groupStats(list, keyFn) { var g = {}; list.forEach(function (x) { var k = keyFn(x); if (k == null || k === '') return; var o = g[k] || (g[k] = { k: k, n: 0, w: 0, p: 0 }); o.n++; o.p += x.p; if (x.p > 0) o.w++; }); return Object.keys(g).map(function (k) { return g[k]; }); }
  var DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  function edge() {
    var C = closedAll(); if (C.length < 5) return { n: C.length };
    var tot = C.reduce(function (a, x) { return a + x.p; }, 0), W = C.filter(function (x) { return x.p > 0; }), L = C.filter(function (x) { return x.p <= 0; });
    var gw = W.reduce(function (a, x) { return a + x.p; }, 0), gl = Math.abs(L.reduce(function (a, x) { return a + x.p; }, 0));
    var out = { n: C.length, tot: tot, win: W.length / C.length, exp: tot / C.length, pf: gl ? gw / gl : null, ins: [] };
    var dims = [['שעה', function (x) { var h = new Date(x.t).getHours(); return h + ':00'; }], ['יום', function (x) { return DAYS[new Date(x.t).getDay()]; }], ['כיוון', function (x) { return x.dir === 'short' ? 'שורט' : 'לונג'; }], ['תיוג', function (x) { return x.tag; }], ['מניה', function (x) { return x.ticker; }]];
    out.dims = dims.map(function (d) { return { name: d[0], rows: groupStats(C, d[1]).filter(function (o) { return o.n >= 3; }).sort(function (a, b) { return a.p - b.p; }) }; });
    out.dims.forEach(function (d) {
      if (!d.rows.length) return; var worst = d.rows[0], best = d.rows[d.rows.length - 1];
      if (worst.p < 0) out.ins.push('ה' + d.name + ' הכי יקרה לך: ' + worst.k + ' (' + money(worst.p) + ' ב-' + worst.n + ' עסקאות, ' + Math.round(worst.w / worst.n * 100) + '% הצלחה)');
      if (best.p > 0 && best !== worst) out.ins.push('ה' + d.name + ' הכי טובה לך: ' + best.k + ' (' + money(best.p) + ' ב-' + best.n + ' עסקאות)');
    });
    if (out.exp < 0) out.ins.unshift('התוחלת שלך שלילית (' + money(out.exp) + ' לעסקה). לפני שמגדילים גודל צריך לתקן את הכללים.');
    return out;
  }
  /* היומן מזין את ציון הכניסה: אם יש מספיק היסטוריה על המניה או על הכיוון, זה נכנס לחישוב */
  function journalEdge(sym, dir) {
    var C = closedAll(), tk = sym.replace('/USD', ''), mine = C.filter(function (x) { return x.ticker === tk; });
    if (mine.length >= 3) { var s = mine.reduce(function (a, x) { return a + x.p; }, 0); return { v: s < 0 ? -40 : 30, detail: 'ב-' + mine.length + ' עסקאות קודמות במניה הזאת: ' + money(s) }; }
    var d = C.filter(function (x) { return x.dir === dir; }); if (d.length >= 8) { var w = d.filter(function (x) { return x.p > 0; }).length / d.length; if (w < 0.35) return { v: -30, detail: 'רק ' + Math.round(w * 100) + '% הצלחה בעסקאות ' + (dir === 'short' ? 'שורט' : 'לונג') + ' שלך (' + d.length + ')' }; if (w > 0.6) return { v: 20, detail: Math.round(w * 100) + '% הצלחה בעסקאות ' + (dir === 'short' ? 'שורט' : 'לונג') + ' שלך (' + d.length + ')' }; }
    return null;
  }
  function edgeHtml() {
    var e = edge(); if (!e.n || e.n < 5) return '<div class="dp-empty">צריך לפחות 5 עסקאות סגורות כדי ללמוד ממך משהו (יש ' + (e.n || 0) + ').</div>';
    var kp = function (l, v, c) { return '<div class="stat ' + (c || '') + '"><b>' + v + '</b><span>' + l + '</span></div>'; };
    return '<div class="stats">' + kp('תוחלת לעסקה', money(e.exp), e.exp >= 0 ? 'pos' : 'neg') + kp('אחוז הצלחה', Math.round(e.win * 100) + '%') + kp('פקטור רווח', e.pf != null ? e.pf.toFixed(2) : '–') + kp('עסקאות', e.n) + '</div>' +
      (e.ins.length ? '<ul class="dp-list pos" style="margin-top:8px">' + e.ins.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
      e.dims.filter(function (d) { return d.rows.length; }).map(function (d) { return '<h4 class="cx-h">לפי ' + d.name + '</h4><div class="cx-t">' + d.rows.slice().reverse().map(function (o) { return '<div class="cx-r" style="grid-template-columns:1.2fr 1fr 1fr 1fr"><span>' + esc(o.k) + '</span><span>' + o.n + ' עסקאות</span><span>' + Math.round(o.w / o.n * 100) + '%</span><span class="' + (o.p >= 0 ? 'up' : 'down') + '">' + money(o.p) + '</span></div>'; }).join('') + '</div>'; }).join('');
  }

  /* ---------- ייבוא CSV מהברוקר ---------- */
  function parseCsv(txt) {
    var lines = txt.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim(); }); if (lines.length < 2) return [];
    var del = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : (lines[0].indexOf('\t') >= 0 ? '\t' : ',');
    var split = function (l) { var o = [], cur = '', q = false; for (var i = 0; i < l.length; i++) { var ch = l[i]; if (ch === '"') q = !q; else if (ch === del && !q) { o.push(cur); cur = ''; } else cur += ch; } o.push(cur); return o.map(function (x) { return x.trim(); }); };
    var H = split(lines[0]).map(function (h) { return h.toLowerCase(); }), idx = function (names) { for (var i = 0; i < H.length; i++) for (var j = 0; j < names.length; j++) if (H[i].indexOf(names[j]) >= 0) return i; return -1; };
    var iS = idx(['symbol', 'ticker', 'instrument']), iA = idx(['side', 'action', 'buy/sell', 'type']), iQ = idx(['quantity', 'qty', 'shares', 'filled']), iP = idx(['price', 'avg']), iD = idx(['date', 'time']);
    if (iS < 0 || iA < 0 || iQ < 0 || iP < 0) return null;
    var fills = []; lines.slice(1).forEach(function (l) {
      var c = split(l), side = (c[iA] || '').toLowerCase(), q = Math.abs(parseFloat(String(c[iQ]).replace(/[$,]/g, ''))), p = parseFloat(String(c[iP]).replace(/[$,]/g, '')), t = iD >= 0 ? Date.parse(c[iD]) : NaN;
      var s = /buy|bot|long|b$/.test(side) ? 1 : /sell|sld|short|s$/.test(side) ? -1 : 0; var sym = (c[iS] || '').toUpperCase().replace(/[^A-Z.]/g, '');
      if (s && q > 0 && p > 0 && sym) fills.push({ sym: sym, s: s, q: q, p: p, t: isFinite(t) ? t : Date.now() });
    });
    fills.sort(function (a, b) { return a.t - b.t; });
    var open = {}, out = [];
    fills.forEach(function (f) {
      var list = open[f.sym] = open[f.sym] || [], rem = f.q;
      while (rem > 0 && list.length && list[0].s !== f.s) { var o = list[0], m = Math.min(o.q, rem); out.push({ t: f.t, ticker: f.sym, dir: o.s > 0 ? 'long' : 'short', entry: o.p, exit: f.p, qty: m, tag: '', note: 'ייבוא' }); o.q -= m; rem -= m; if (o.q <= 0) list.shift(); }
      if (rem > 0) list.push({ s: f.s, q: rem, p: f.p });
    });
    return out;
  }
  function importUi(host) {
    var inp = host.querySelector('#proCsv'); if (!inp) return;
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = function () {
        var rows = parseCsv(String(rd.result)), box = host.querySelector('#proCsvOut');
        if (rows === null) { box.innerHTML = '<div class="dp-empty">לא זיהיתי עמודות. הקובץ צריך לכלול סימול, צד (קנייה/מכירה), כמות ומחיר.</div>'; return; }
        var have = {}; (D.closed || []).forEach(function (c) { have[[c.ticker, c.entry, c.exit, c.qty].join('|')] = 1; });
        var fresh = rows.filter(function (r) { return !have[[r.ticker, r.entry, r.exit, r.qty].join('|')]; }), tot = fresh.reduce(function (a, r) { return a + pnl(r); }, 0);
        box.innerHTML = '<div class="dp-foot" style="text-align:right">נמצאו ' + rows.length + ' עסקאות סגורות (' + (rows.length - fresh.length) + ' כבר ביומן). רווח/הפסד של החדשות: <b class="' + (tot >= 0 ? 'up' : 'down') + '">' + money(tot) + '</b></div>' + (fresh.length ? '<button class="btn" id="proCsvGo">הוסף ' + fresh.length + ' עסקאות ליומן</button>' : '');
        var go = box.querySelector('#proCsvGo'); if (go) go.onclick = function () { fresh.forEach(function (r) { D.closed.push(r); }); save(); renderClosed(); renderStats(); toast('נוספו ' + fresh.length + ' עסקאות'); box.innerHTML = ''; inp.value = ''; };
      };
      rd.readAsText(f);
    };
  }

  /* ---------- סיכום ערב ---------- */
  async function evening(host) {
    var out = host.querySelector('#proEvOut'), s0 = t0(), today = closedAll().filter(function (x) { return x.t >= s0; });
    if (typeof aiKey !== 'function' || !aiKey()) { out.innerHTML = '<div class="dp-empty">לסיכום ערב צריך מפתח בינה בהגדרות.</div>'; return; }
    out.innerHTML = '<div class="dp-skel"><i style="height:70px"></i></div>';
    var checks = (D.daily && D.daily.checks || []).filter(Boolean).length, tot = (D.daily && D.daily.checks || []).length;
    var lines = today.map(function (x) { return x.ticker + ' ' + (x.dir === 'short' ? 'שורט' : 'לונג') + ' ' + money(x.p) + (x.tag ? ' (' + x.tag + ')' : ''); }).join('; ') || 'לא נסגרו עסקאות היום';
    try {
      var t = await claude([{ role: 'user', content: 'עסקאות שנסגרו היום: ' + lines + '. רווח/הפסד יומי: ' + money(todayPnl()) + '. מגבלת הפסד: $' + limit() + '. משימות בוקר שבוצעו: ' + checks + ' מתוך ' + tot + '.' }], { system: 'אתה מאמן מסחר ישראלי ישיר ומכבד. כתוב סיכום ערב קצר בעברית פשוטה: (1) מה עבד, (2) הטעות הכי חשובה אם יש, (3) דבר אחד לשנות מחר, (4) ציון 1 עד 10 לעמידה בכללים עם משפט. בלי המצאות מעבר לנתונים שקיבלת. עד 8 שורות.', max_tokens: 700, tier: 'cheap' });
      D.daily = D.daily || {}; D.daily.sum = { t: Date.now(), text: t }; save(); out.innerHTML = '<div class="dp-ai">' + esc(t).replace(/\n/g, '<br>') + '</div>';
    } catch (e) { out.innerHTML = '<div class="dp-empty">הסיכום נכשל: ' + esc(e.message) + '</div>'; }
  }
  function journalCard() {
    var stats = $q('#statsBox'), trades = $q('#s-trades'); if (!stats || !trades || $q('#proJ')) return; var card = stats.closest('.card'); if (!card) return;
    var e1 = document.createElement('div'); e1.id = 'proJ'; e1.innerHTML = '<h2>מה היומן מלמד אותך</h2><div class="card" id="proEdge"></div>'; card.parentNode.insertBefore(e1, card);
    var el = document.createElement('div'); el.id = 'proIO'; el.innerHTML = '<h2>ייבוא וסיכום ערב</h2><div class="card"><div class="dp-foot" style="text-align:right">ייבוא עסקאות מקובץ CSV שהורדת מהברוקר (סימול, צד, כמות, מחיר, תאריך). האתר מזווג קניות ומכירות לעסקאות סגורות.</div><input type="file" id="proCsv" accept=".csv,.txt" style="margin:8px 0"><div id="proCsvOut"></div><button class="btn ghost" id="proEv" style="margin-top:8px">סיכום ערב</button><div id="proEvOut" style="margin-top:8px"></div></div>';
    trades.appendChild(el); importUi(el); el.querySelector('#proEv').onclick = function () { evening(el); };
    if (D.daily && D.daily.sum && Date.now() - D.daily.sum.t < 20 * 3600e3) el.querySelector('#proEvOut').innerHTML = '<div class="dp-ai">' + esc(D.daily.sum.text).replace(/\n/g, '<br>') + '</div>';
  }
  function paintEdge() { journalCard(); var e = $q('#proEdge'); if (e) e.innerHTML = edgeHtml(); }

  /* ---------- מקורבים ויעדי מחיר בכרטיס הניתוח ---------- */
  var extra = {};
  async function loadExtra(res) {
    if (!S.fh || res.sym.indexOf('/') >= 0) return; var out = { t: Date.now() }, from = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    try { var j = await fh('/stock/insider-transactions?symbol=' + res.sym + '&from=' + from); var a = (j && j.data) || []; var buy = a.filter(function (x) { return x.transactionCode === 'P'; }), sell = a.filter(function (x) { return x.transactionCode === 'S'; }); var val = function (l) { return l.reduce(function (s, x) { return s + Math.abs(x.change || 0) * (x.transactionPrice || 0); }, 0); }; out.ins = { buyN: buy.length, sellN: sell.length, buyV: val(buy), sellV: val(sell) }; } catch (e) { }
    try { var t = await fh('/stock/price-target?symbol=' + res.sym); if (t && t.targetMean) out.pt = { mean: t.targetMean, hi: t.targetHigh, lo: t.targetLow }; } catch (e) { }
    extra[res.sym] = out; if (DP.state.res === res) DP.repaint();
  }
  function extraHtml(r) {
    var x = extra[r.sym]; if (!x || (!x.ins && !x.pt)) return ''; var out = '<section class="dp-card"><h3>מקורבים ויעדי מחיר</h3>', usd = function (v) { return '$' + (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v.toFixed(0)); };
    if (x.pt && r.price) { var up = (x.pt.mean / r.price - 1) * 100; out += '<div class="dp-regime ' + (up > 8 ? 'on' : up < -8 ? 'off' : '') + '"><i></i><b>יעד אנליסטים ממוצע $' + x.pt.mean.toFixed(0) + ' (' + (up >= 0 ? '+' : '') + up.toFixed(0) + '%)</b><span>טווח $' + (x.pt.lo || 0).toFixed(0) + ' עד $' + (x.pt.hi || 0).toFixed(0) + '</span></div>'; }
    if (x.ins) out += '<div class="dp-foot" style="text-align:right">מקורבים ב-90 ימים: <b class="up">' + x.ins.buyN + ' קניות (' + usd(x.ins.buyV) + ')</b> מול <b class="down">' + x.ins.sellN + ' מכירות (' + usd(x.ins.sellV) + ')</b>. קניות של מקורבים חזקות יותר מכירות, כי מכירות לרוב מתוכננות מראש.</div>';
    return out + '</section>';
  }
  if (window.DeepCtx) {
    var _s = DeepCtx.start, _h = DeepCtx.html;
    DeepCtx.start = function (res, f) { loadExtra(res); return _s(res, f); };
    DeepCtx.html = function (r) { return _h(r) + extraHtml(r); };
  }

  /* ---------- קיצורי מקלדת ---------- */
  var KEYS = { s: 'p-smart', b: 'p-brief', c: 'p-calc', p: 'p-port', h: 'p-morning', j: 'p-journal', n: 'p-news', g: 'p-today' };
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return; var t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    if (e.key === '/') { e.preventDefault(); var i = $q('#qsIn'); if (i) i.focus(); return; }
    if (e.key === '?') { toast('קיצורים: / חיפוש מניה · s סריקה · b תדריך · g גרף · c מחשבון · p תיק · j יומן · n חדשות · h בית'); return; }
    var id = KEYS[e.key.toLowerCase()]; if (id) { goPage(id); onEnter(id); }
  });

  /* ---------- חיווט ---------- */
  var _e = onEnter; onEnter = function (id) { _e(id); if (id === 'p-journal') paintEdge(); syncSubs(); };
  var _rs = renderStats; renderStats = function () { _rs(); try { paintEdge(); paintBar(); } catch (e) { } };
  window.__pro = { gateOk: gateOk, locked: locked, todayPnl: todayPnl, alertsFor: alertsFor, journalEdge: journalEdge, parseCsv: parseCsv, edge: edge, checkAlerts: checkAlerts, onTick: onTick, state: function () { return { ws: wsState, subs: Object.keys(subs) }; } };
  setTimeout(function () { paintBar(); connect(); }, 2000); setInterval(function () { paintBar(); syncSubs(); }, 20000);
})();
