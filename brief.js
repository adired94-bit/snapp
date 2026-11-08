/* תדריך בוקר: המידע שהאתר אסף עבור שלוש המשימות הראשונות, במקום אחד. נפתח מכפתורי המשימות בלשונית חדשה.
   שוק (מחירים חיים של מדדים ונכסים דרך קרנות סל), יומן (דוחות מ-Finnhub ואירועי מאקרו ממחקר ברשת עם מקורות),
   חדשות ומניות מובילות (זרם החדשות ותנועות היום). */
(function () {
  'use strict';
  var $q = function (s) { return document.querySelector(s); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var ASSETS = [['SPY', 'S&P 500'], ['QQQ', 'נאסד"ק 100'], ['DIA', 'דאו ג\'ונס'], ['IWM', 'ראסל 2000'], ['SMH', 'שבבים'], ['VIXY', 'פחד (VIX)'], ['UUP', 'דולר'], ['TLT', 'אג"ח ארוכות'], ['IEF', 'אג"ח 10 שנים'], ['GLD', 'זהב'], ['USO', 'נפט'], ['IBIT', 'ביטקוין'], ['EWJ', 'יפן'], ['FXI', 'סין'], ['EIS', 'ישראל']];
  var ST = { tab: 'market', quotes: null, qt: 0, earn: null, cal: null, busy: {} };
  var fh = function (p) { var c = window.__deep.getClient(); return c._json(c.fhBase + p + (p.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(S.fh), c.fhLimiter); };
  var pc = function (v) { return v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : '') + v.toFixed(2) + '%'; };
  var cls = function (v) { return v > 0 ? 'up' : v < 0 ? 'down' : ''; };
  var hm = function (t) { return new Date(t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); };

  async function loadMarket(force) {
    if (!S.fh) return; if (!force && ST.quotes && Date.now() - ST.qt < 60e3) return; ST.busy.m = 1; paint();
    var out = await Promise.all(ASSETS.map(async function (a) { try { var q = await fh('/quote?symbol=' + a[0]); return q && q.c > 0 ? { s: a[0], n: a[1], c: q.c, dp: q.dp, pc: q.pc } : { s: a[0], n: a[1] }; } catch (e) { return { s: a[0], n: a[1] }; } }));
    ST.quotes = out; ST.qt = Date.now(); ST.busy.m = 0; paint();
  }
  async function loadEarn(force) {
    if (!S.fh) return; if (!force && ST.earn && Date.now() - ST.earn.t < 30 * 60e3) return; ST.busy.e = 1; paint();
    var d = function (x) { return x.toISOString().slice(0, 10); }, t0 = new Date(), t1 = new Date(Date.now() + 864e5), rows = [];
    try { var j = await fh('/calendar/earnings?from=' + d(t0) + '&to=' + d(t1)); rows = (j && j.earningsCalendar) || []; } catch (e) { }
    rows = rows.filter(function (r) { return r.symbol && /^[A-Z.]{1,5}$/.test(r.symbol); }).sort(function (a, b) { return (b.revenueEstimate || 0) - (a.revenueEstimate || 0); }).slice(0, 25);
    ST.earn = { t: Date.now(), rows: rows }; ST.busy.e = 0; paint();
  }
  async function loadCal(force) {
    if (typeof aiKey !== 'function' || !aiKey()) { ST.cal = { err: 'ליומן מאקרו צריך מפתח בינה בהגדרות.' }; paint(); return; }
    var hit; try { hit = JSON.parse(localStorage.getItem('adir-brief-cal') || 'null'); } catch (e) { }
    if (!force && hit && Date.now() - hit.t < 30 * 60e3) { ST.cal = hit; paint(); return; }
    ST.busy.c = 1; paint();
    try {
      var raw = await claude([{ role: 'user', content: 'היום: ' + new Date().toISOString().slice(0, 10) + ' (שעון ישראל עכשיו ' + hm(Date.now()) + ').' }], { system: 'אתה עוזר לסוחר יומי ישראלי. חפש ברשת את אירועי המאקרו וההכרזות החשובים להיום ולמחר בשוק האמריקאי: נתונים כלכליים (תעסוקה, אינפלציה, ריבית), נאומי הפד ונשיא ארה"ב, מכרזי אג"ח, החלטות רגולטוריות, ודוחות גדולים. לכל אירוע: שעה בשעון ישראל אם ידועה, חשיבות (high/medium/low), תחזית וקודם אם ידועים, ומקור עם קישור. חוק ברזל: רק מה שמצאת בפועל ועם קישור. אל תמציא. החזר JSON בלבד: {"events":[{"time":"HH:MM","day":"היום|מחר","title":"","importance":"high|medium|low","forecast":"","previous":"","source":"","url":""}],"summary":"שתי שורות: מה צפוי להזיז את השוק היום"}. עד 10 אירועים.', tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }], max_tokens: 2500, tier: 'smart' });
      var j = parseJSON(raw); ST.cal = { t: Date.now(), summary: j.summary || '', events: (j.events || []).filter(function (e) { return e && e.title && /^https?:/.test(e.url || ''); }).slice(0, 10) };
      try { localStorage.setItem('adir-brief-cal', JSON.stringify(ST.cal)); } catch (e) { }
    } catch (e) { ST.cal = { err: 'חיפוש האירועים נכשל: ' + e.message }; }
    ST.busy.c = 0; paint();
  }
  function marketHtml() {
    if (!S.fh) return '<div class="dp-empty">לנתוני שוק צריך מפתח Finnhub בהגדרות.</div>';
    if (!ST.quotes) return '<div class="dp-skel"><i style="height:120px"></i></div>';
    var q = ST.quotes.filter(function (x) { return x.c; }), by = {}; q.forEach(function (x) { by[x.s] = x; });
    var up = ['SPY', 'QQQ', 'IWM'].filter(function (s) { return by[s] && by[s].dp > 0; }).length, ok = ['SPY', 'QQQ', 'IWM'].filter(function (s) { return by[s]; }).length;
    var mood = !ok ? '' : up === ok ? 'המדדים הראשיים בעלייה: אווירה חיובית.' : up === 0 ? 'המדדים הראשיים בירידה: אווירה שלילית.' : 'המדדים מעורבים.';
    var vix = by.VIXY && by.VIXY.dp > 3 ? ' הפחד (VIXY) עולה.' : by.VIXY && by.VIXY.dp < -3 ? ' הפחד (VIXY) יורד.' : '';
    return (mood ? '<div class="dp-regime ' + (up === ok ? 'on' : up === 0 ? 'off' : '') + '"><i></i><b>' + mood + '</b><span>' + vix + '</span></div>' : '') +
      '<div class="br-grid">' + ST.quotes.map(function (x) { return '<div class="br-c"><small>' + esc(x.n) + '</small><b>' + (x.c ? x.c.toFixed(2) : '–') + '</b><span class="' + cls(x.dp) + '">' + pc(x.dp) + '</span><i>' + x.s + '</i></div>'; }).join('') + '</div>' +
      '<div class="dp-foot" style="text-align:right">מחירים מ-Finnhub, נכון ל-' + hm(ST.qt) + '. בגלל המנוי החינמי המדדים מוצגים דרך קרנות סל שעוקבות אחריהם (למשל SPY במקום S&P 500, VIXY במקום VIX), ולכן אלה לא חוזים עתידיים ולא פרה-מרקט. לחוזים ולפרה-מרקט אמיתיים אפשר להשתמש בכפתור "נתוני שוק" בעמוד הבית.</div>';
  }
  function calHtml() {
    var c = ST.cal, e = ST.earn, out = '<h4 class="cx-h">אירועי מאקרו והכרזות <small><a href="#" data-brf="cal">רענן</a></small></h4>';
    if (ST.busy.c) out += '<div class="dp-skel"><i style="height:90px"></i></div><div class="dp-foot">מחפש ברשת…</div>';
    else if (!c) out += '<div class="dp-empty">טוען…</div>';
    else if (c.err) out += '<div class="dp-empty">' + esc(c.err) + '</div>';
    else {
      if (c.summary) out += '<div class="dp-regime"><i></i><b>' + esc(c.summary) + '</b></div>';
      out += c.events.length ? c.events.map(function (x) { return '<div class="cx-i"><b>' + (x.day ? esc(x.day) + ' ' : '') + (x.time ? esc(x.time) + ' · ' : '') + esc(x.title) + (x.importance === 'high' ? ' <span class="down">●</span>' : '') + '</b>' + ((x.forecast || x.previous) ? '<p>' + (x.forecast ? 'תחזית ' + esc(x.forecast) : '') + (x.forecast && x.previous ? ' · ' : '') + (x.previous ? 'קודם ' + esc(x.previous) : '') + '</p>' : '') + '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.source || 'מקור') + ' ↗</a></div>'; }).join('') : '<div class="dp-empty">לא נמצאו אירועים מתועדים עם מקור.</div>';
      out += '<div class="dp-foot" style="text-align:right">מחקר ברשת, נכון ל-' + hm(c.t) + '. עלול לטעות. בדוק במקור.</div>';
    }
    out += '<h4 class="cx-h">דוחות רבעוניים היום ומחר</h4>';
    if (!S.fh) out += '<div class="dp-empty">צריך מפתח Finnhub.</div>';
    else if (!e) out += '<div class="dp-empty">טוען…</div>';
    else out += e.rows.length ? '<div class="cx-t"><div class="cx-r cx-th" style="grid-template-columns:1fr 1fr 1fr 1fr"><span>מניה</span><span>יום</span><span>מועד</span><span>צפי רווח</span></div>' + e.rows.map(function (r) { var today = r.date === new Date().toISOString().slice(0, 10); return '<div class="cx-r" style="grid-template-columns:1fr 1fr 1fr 1fr"><span><a href="#" data-brd="' + esc(r.symbol) + '">' + esc(r.symbol) + '</a></span><span>' + (today ? 'היום' : 'מחר') + '</span><span>' + (r.hour === 'bmo' ? 'לפני פתיחה' : r.hour === 'amc' ? 'אחרי סגירה' : r.hour === 'dmh' ? 'בזמן מסחר' : '–') + '</span><span>' + (r.epsEstimate != null ? r.epsEstimate.toFixed(2) : '–') + '</span></div>'; }).join('') + '</div><div class="dp-foot" style="text-align:right">25 הדוחות הגדולים לפי צפי הכנסות. לחיצה על סימול פותחת ניתוח מלא.</div>' : '<div class="dp-empty">אין דוחות מדווחים בתקופה הזאת.</div>';
    return out;
  }
  function newsHtml() {
    var mv = window.__hot ? window.__hot.movers() : [], W = window.__wire && window.__wire.state.items || [], out = '<h4 class="cx-h">המניות הכי זזות עכשיו</h4>';
    out += mv.length ? '<div class="cx-t"><div class="cx-r cx-th" style="grid-template-columns:1fr 1fr 1fr 1fr"><span>מניה</span><span>מחיר</span><span>היום</span><span>גאפ</span></div>' + mv.slice(0, 12).map(function (r) { return '<div class="cx-r" style="grid-template-columns:1fr 1fr 1fr 1fr"><span><a href="#" data-brd="' + esc(r.s) + '">' + esc(r.s) + '</a></span><span>' + (r.c ? r.c.toFixed(2) : '–') + '</span><span class="' + cls(r.dp) + '">' + pc(r.dp) + '</span><span class="' + cls(r.gap) + '">' + pc(r.gap) + '</span></div>'; }).join('') + '</div><div class="dp-foot" style="text-align:right">מתוך המניות שהסורק בודק, לפי גודל התנועה והגאפ. לחיצה על סימול פותחת ניתוח מלא.</div>' : '<div class="dp-empty">' + (S.fh ? 'עדיין מחשב. נסה שוב בעוד דקה.' : 'צריך מפתח Finnhub.') + '</div>';
    out += '<h4 class="cx-h">החדשות האחרונות <small><a href="#" data-brf="news">רענן</a></small></h4>';
    out += W.length ? W.slice(0, 30).map(function (i) { return '<a class="dp-news" href="' + esc(i.link) + '" target="_blank" rel="noopener"><i></i><div><b' + (i.en ? ' dir="ltr"' : '') + '>' + esc((window.__wire.state.tr || {})[i.title] || i.title) + '</b><small>' + esc(i.src) + (i.t ? ' · ' + new Date(i.t).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '') + '</small></div></a>'; }).join('') + '<div class="dp-foot" style="text-align:right">כל החדשות לפי קטגוריה ובתרגום נמצאות בעמוד "חדשות".</div>' : '<div class="dp-empty">טוען חדשות…</div>';
    return out;
  }
  /* שעון מסחר: מתי וול סטריט נפתחת בישראל, באיזו שלב אנחנו, וכמה זמן נשאר לכלל 15 הדקות */
  function nyAt(h, m) {
    var f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, minute: '2-digit' }), p = {}, now = new Date();
    f.formatToParts(now).forEach(function (x) { p[x.type] = x.value; });
    var base = Date.UTC(+p.year, +p.month - 1, +p.day, h, m);
    for (var off = 4; off <= 5; off++) { var t = base + off * 3600e3, q = {}; f.formatToParts(new Date(t)).forEach(function (x) { q[x.type] = x.value; }); if (+q.hour % 24 === h && +q.minute === m) return t; }
    return base + 5 * 3600e3;
  }
  function clockHtml() {
    var now = Date.now(), wd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(now), weekend = wd === 'Sat' || wd === 'Sun';
    var pre = nyAt(4, 0), open = nyAt(9, 30), safe = open + 15 * 6e4, close = nyAt(16, 0), post = nyAt(20, 0), phase, next, nt;
    if (weekend) { phase = 'סוף שבוע: השוק סגור'; next = ''; }
    else if (now < pre) { phase = 'לפני פרה-מרקט'; next = 'פרה-מרקט נפתח'; nt = pre; }
    else if (now < open) { phase = 'פרה-מרקט'; next = 'הפתיחה'; nt = open; }
    else if (now < safe) { phase = 'ה-15 הדקות הראשונות: לא נכנסים בלי תוכנית ואישור'; next = 'סוף 15 הדקות'; nt = safe; }
    else if (now < close) { phase = 'מסחר רגיל'; next = 'הסגירה'; nt = close; }
    else if (now < post) { phase = 'אפטר-מרקט'; next = 'סגירת אפטר-מרקט'; nt = post; }
    else { phase = 'השוק סגור'; next = ''; }
    var mins = nt ? Math.max(0, Math.round((nt - now) / 6e4)) : 0, cd = nt ? (Math.floor(mins / 60) ? Math.floor(mins / 60) + ' שעות ו-' : '') + (mins % 60) + ' דקות' : '';
    var ny = new Intl.DateTimeFormat('he-IL', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }).format(now);
    var row = function (l, t) { return '<div class="cx-r" style="grid-template-columns:1.4fr 1fr"><span>' + l + '</span><span>' + hm(t) + '</span></div>'; };
    return '<div class="dp-regime ' + (!weekend && now >= open && now < close && now >= safe ? 'on' : '') + '"><i></i><b>' + phase + '</b><span>' + (next ? next + ' בעוד ' + cd : '') + '</span></div>' +
      '<div class="cx-t">' + row('פרה-מרקט מתחיל (שעון ישראל)', pre) + row('פתיחת המסחר', open) + row('סוף 15 הדקות הראשונות', safe) + row('סגירת המסחר', close) + row('סוף אפטר-מרקט', post) + '</div>' +
      '<div class="dp-foot" style="text-align:right">עכשיו בניו יורק ' + ny + '. השעות מחושבות לפי שעון קיץ וחורף בארה"ב. לא כולל חגים וימי מסחר מקוצרים.</div>';
  }
  function paint() {
    var host = $q('#brBody'); if (!host) return;
    $q('#brTabs').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === ST.tab); });
    host.innerHTML = ST.tab === 'market' ? marketHtml() : ST.tab === 'cal' ? calHtml() : ST.tab === 'clock' ? clockHtml() : newsHtml();
    host.querySelectorAll('[data-brd]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); window.openDeep(a.dataset.brd); }; });
    host.querySelectorAll('[data-brf]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); if (a.dataset.brf === 'cal') loadCal(true); else window.__wire.load(true).then(paint); }; });
  }
  function show(t) { ST.tab = t; clearInterval(ST.iv); if (t === 'clock') ST.iv = setInterval(function () { if ($q('#p-brief.on') && ST.tab === 'clock') paint(); }, 30e3); if (t === 'market') loadMarket(); else if (t === 'cal') { loadEarn(); if (!ST.cal) loadCal(); } else { if (window.__hot) window.__hot.refresh(); if (window.__wire) window.__wire.load(false); setTimeout(paint, 1500); } paint(); }
  function build() {
    if ($q('#p-brief')) return;
    var s = document.createElement('section'); s.className = 'page'; s.id = 'p-brief';
    s.innerHTML = '<div class="tabs" id="brTabs" style="margin:6px 0 10px"><button data-t="market">שוק</button><button data-t="cal">יומן ודוחות</button><button data-t="news">חדשות ומובילות</button><button data-t="clock">שעון מסחר</button></div><div class="dp-card"><div id="brBody"></div></div>';
    document.querySelector('main').appendChild(s);
    $q('#brTabs').querySelectorAll('button').forEach(function (b) { b.onclick = function () { show(b.dataset.t); }; });
    window.__briefShow = function () { var t = new URLSearchParams(location.search).get('tab'); show(t && ['market', 'cal', 'news', 'clock'].indexOf(t) >= 0 && !ST.opened ? t : ST.tab); ST.opened = 1; };
  }
  build();
  GROUPS.morning.push(['p-brief', 'תדריך']); PAGE_GROUP['p-brief'] = 'morning';
  var _e = onEnter; onEnter = function (id) { _e(id); if (id === 'p-brief') window.__briefShow(); };
  window.__brief = { state: ST, loadMarket: loadMarket, loadEarn: loadEarn };
})();
