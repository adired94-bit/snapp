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
    var hit; try { hit = JSON.parse(localStorage.getItem('adir-brief-cal2') || 'null'); } catch (e) { }
    if (hit && hit.events && Date.now() - hit.t < 12 * 3600e3) { ST.cal = hit; paint(); }
    if (!force && hit && Date.now() - hit.t < 30 * 60e3) return;
    if (ST.busy.c) return;
    ST.busy.c = 1; paint();
    try {
      var raw = await claude([{ role: 'user', content: 'היום: ' + new Date().toISOString().slice(0, 10) + ' (שעון ישראל עכשיו ' + hm(Date.now()) + ').' }], { system: 'אתה עוזר לסוחר יומי ישראלי. חפש ברשת את אירועי המאקרו וההכרזות החשובים להיום ולמחר בשוק האמריקאי: נתונים כלכליים (תעסוקה, אינפלציה, ריבית), נאומי הפד ונשיא ארה"ב, מכרזי אג"ח, החלטות רגולטוריות, ודוחות גדולים. לכל אירוע: שעה בשעון ישראל אם ידועה, חשיבות (high/medium/low), תחזית וקודם אם ידועים, ומקור עם קישור. חוק ברזל: רק מה שמצאת בפועל ועם קישור. אל תמציא. החזר JSON בלבד: {"events":[{"time":"HH:MM","day":"היום|מחר","title":"","importance":"high|medium|low","forecast":"","previous":"","what":"מה זה, במשפט פשוט לסוחר שלא מכיר","impact":"איך זה משפיע על המסחר: אם המספר גבוה מהתחזית מה קורה למדדים, לדולר ולאג\"ח, ואילו מניות או סקטורים מושפעים","source":"","url":""}],"summary":"שתי שורות: מה צפוי להזיז את השוק היום"}. עד 8 אירועים, בלי הקדמה. לכל אירוע חובה למלא what ו-impact בעברית פשוטה וקצרה (עד שני משפטים כל אחד).', tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }], max_tokens: 3200, tier: 'cheap' });
      var j = parseJSON(raw); ST.cal = { t: Date.now(), summary: j.summary || '', events: (j.events || []).filter(function (e) { return e && e.title && /^https?:/.test(e.url || ''); })  .slice(0, 8) };
      try { localStorage.setItem('adir-brief-cal2', JSON.stringify(ST.cal)); } catch (e) { }
    } catch (e) { if (!ST.cal || !ST.cal.events) ST.cal = { err: 'חיפוש האירועים נכשל: ' + e.message }; }
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
      '<div class="br-grid">' + ST.quotes.map(function (x) { return '<div class="br-c"><small>' + esc(x.n) + '</small><span class="' + cls(x.dp) + '" style="font-size:20px">' + pc(x.dp) + '</span><b style="font-size:14px;color:var(--ink2)">' + (x.c ? '$' + x.c.toFixed(2) : '–') + '</b><i>מחיר הקרן ' + x.s + '</i></div>'; }).join('') + '</div>' +
      '<div class="dp-foot" style="text-align:right">מחירים מ-Finnhub, נכון ל-' + hm(ST.qt) + '. הכרטיסים מציגים קודם כל את השינוי היומי באחוזים, שכמעט זהה לשינוי במדד עצמו. המספר הקטן הוא מחיר קרן הסל שעוקבת אחרי המדד (SPY עוקבת אחרי S&P 500 וכן הלאה), ולכן הוא לא רמת המדד עצמו. אלה גם לא חוזים עתידיים ולא פרה-מרקט.</div>';
  }
  function calHtml() {
    var c = ST.cal, e = ST.earn, out = watchHtml() + '<h4 class="cx-h">אירועי מאקרו והכרזות <small><a href="#" data-brf="cal">רענן</a></small></h4>';
    if (ST.busy.c && !(c && c.events)) out += '<div class="dp-skel"><i style="height:90px"></i></div><div class="dp-foot">מחפש ברשת, לוקח כחצי דקה. הדוחות למטה כבר מוכנים.</div>';
    else if (!c) out += '<div class="dp-empty">טוען…</div>';
    else if (c.err) out += '<div class="dp-empty">' + esc(c.err) + '</div>';
    else {
      if (c.summary) out += '<div class="dp-regime"><i></i><b>' + esc(c.summary) + '</b></div>';
      out += c.events.length ? c.events.map(function (x, k) { return '<div class="cx-i"><b>' + (x.day ? esc(x.day) + ' ' : '') + (x.time ? esc(x.time) + ' · ' : '') + esc(x.title) + (x.importance === 'high' ? ' <span class="down">●</span>' : '') + '</b>' + ((x.forecast || x.previous) ? '<p>' + (x.forecast ? 'תחזית ' + esc(x.forecast) : '') + (x.forecast && x.previous ? ' · ' : '') + (x.previous ? 'קודם ' + esc(x.previous) : '') + '</p>' : '') + (x.what ? '<p class="br-ex"><b>מה זה:</b> ' + esc(x.what) + '</p>' : '') + (x.impact ? '<p class="br-ex"><b>איך זה משפיע על המסחר:</b> ' + esc(x.impact) + '</p>' : '') + '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.source || 'מקור') + ' ↗</a> ' + trackBtn('ev' + k, x) + '</div>'; }).join('') : '<div class="dp-empty">לא נמצאו אירועים מתועדים עם מקור.</div>';
      out += '<div class="dp-foot" style="text-align:right">מחקר ברשת, נכון ל-' + hm(c.t) + (ST.busy.c ? ' · מתעדכן ברקע…' : '') + '. עלול לטעות. בדוק במקור.</div>';
    }
    out += '<h4 class="cx-h">דוחות רבעוניים היום ומחר</h4>';
    if (!S.fh) out += '<div class="dp-empty">צריך מפתח Finnhub.</div>';
    else if (!e) out += '<div class="dp-empty">טוען…</div>';
    else out += e.rows.length ? '<div class="cx-t"><div class="cx-r cx-th" style="grid-template-columns:1fr 1fr 1fr 1fr"><span>מניה</span><span>יום</span><span>מועד</span><span>צפי רווח</span></div>' + e.rows.map(function (r) { var today = r.date === new Date().toISOString().slice(0, 10); return '<div class="cx-r" style="grid-template-columns:1fr 1fr 1fr 1fr"><span><a href="#" data-brd="' + esc(r.symbol) + '">' + esc(r.symbol) + '</a> ' + trackBtn('er' + r.symbol + r.date, { _er: r }) + '</span><span>' + (today ? 'היום' : 'מחר') + '</span><span>' + (r.hour === 'bmo' ? 'לפני פתיחה' : r.hour === 'amc' ? 'אחרי סגירה' : r.hour === 'dmh' ? 'בזמן מסחר' : '–') + '</span><span>' + (r.epsEstimate != null ? r.epsEstimate.toFixed(2) : '–') + '</span></div>'; }).join('') + '</div><div class="dp-foot" style="text-align:right">25 הדוחות הגדולים לפי צפי הכנסות. לחיצה על סימול פותחת ניתוח מלא.</div>' : '<div class="dp-empty">אין דוחות מדווחים בתקופה הזאת.</div>';
    return out;
  }
  function newsHtml() {
    var mv = window.__hot ? window.__hot.movers() : [], W = window.__wire && window.__wire.state.items || [], out = '<h4 class="cx-h">המניות הכי זזות עכשיו</h4>';
    out += mv.length ? '<div class="cx-t"><div class="cx-r cx-th" style="grid-template-columns:1fr 1fr 1fr 1fr"><span>מניה</span><span>מחיר</span><span>היום</span><span>גאפ</span></div>' + mv.slice(0, 12).map(function (r) { return '<div class="cx-r" style="grid-template-columns:1fr 1fr 1fr 1fr"><span><a href="#" data-brd="' + esc(r.s) + '">' + esc(r.s) + '</a></span><span>' + (r.c ? r.c.toFixed(2) : '–') + '</span><span class="' + cls(r.dp) + '">' + pc(r.dp) + '</span><span class="' + cls(r.gap) + '">' + pc(r.gap) + '</span></div>'; }).join('') + '</div><div class="dp-foot" style="text-align:right">מתוך המניות שהסורק בודק, לפי גודל התנועה והגאפ. לחיצה על סימול פותחת ניתוח מלא.</div>' : '<div class="dp-empty">' + (S.fh ? 'עדיין מחשב. נסה שוב בעוד דקה.' : 'צריך מפתח Finnhub.') + '</div>';
    out += '<h4 class="cx-h">החדשות האחרונות <small><a href="#" data-brf="news">רענן</a></small></h4>';
    out += W.length ? W.slice(0, 30).map(function (i) { return '<a class="dp-news" href="' + esc(i.link) + '" target="_blank" rel="noopener"><i></i><div><b' + (i.en ? ' dir="ltr"' : '') + '>' + esc((window.__wire.state.tr || {})[i.title] || i.title) + '</b><small>' + esc(i.src) + (i.t ? ' · ' + new Date(i.t).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '') + '</small></div></a>'; }).join('') + '<div class="dp-foot" style="text-align:right">כל החדשות לפי קטגוריה ובתרגום נמצאות בעמוד "חדשות".</div>' : '<div class="dp-empty">טוען חדשות…</div>';
    return out;
  }
  /* ---------- מעקב אחרי אירוע: כשהמידע מתפרסם, מקבלים סיכום של מה קרה ומה היה מול התחזית ---------- */
  var tid = function (id) { return (D.evWatch || []).filter(function (w) { return w.id === id; })[0]; };
  function trackBtn(id, x) { ST.tr = ST.tr || {}; ST.tr[id] = x; return tid(id) ? '<span class="up" style="font-size:12px">במעקב ✓</span>' : '<a href="#" data-brw="' + esc(id) + '" style="font-size:12px">עקוב</a>'; }
  function evTime(x) {
    if (x._er) { var r = x._er, t0 = r.hour === 'bmo' ? nyAt(9, 30) : r.hour === 'dmh' ? nyAt(12, 0) : nyAt(16, 15) + 10 * 6e4; return r.date === new Date().toISOString().slice(0, 10) ? t0 : t0 + 864e5; }
    var m = /(\d{1,2}):(\d{2})/.exec(x.time || ''), d = new Date(); if (x.day === 'מחר') d.setDate(d.getDate() + 1);
    if (m) d.setHours(+m[1], +m[2], 0, 0); else return Date.now() + 10 * 6e4;
    return d.getTime();
  }
  function addWatch(id) {
    var x = ST.tr && ST.tr[id]; if (!x || tid(id)) return; D.evWatch = D.evWatch || [];
    var er = x._er; D.evWatch.push({ id: id, kind: er ? 'earn' : 'macro', title: er ? 'דוח רבעוני ' + er.symbol : x.title, forecast: er ? (er.epsEstimate != null ? 'צפי רווח ' + er.epsEstimate : '') : (x.forecast || ''), previous: er ? '' : (x.previous || ''), sym: er ? er.symbol : '', ts: evTime(x), next: 0, tries: 0, added: Date.now() });
    save(); if (typeof Notification !== 'undefined' && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) { } }
    if (typeof toast === 'function') toast('במעקב. כשהמידע יתפרסם תקבל סיכום כאן' + (S.tgT && S.tgC ? ' ובטלגרם' : '') + '. האתר צריך להיות פתוח.'); paint(); setTimeout(tick, 1000);
  }
  async function check(w) {
    w.busy = 1; w.tries = (w.tries || 0) + 1; w.next = Date.now() + 5 * 60e3; paint();
    var q = w.kind === 'earn' ? 'דוח הרבעון של ' + w.sym + ' (' + w.title + ')' : w.title + (w.forecast ? ' (תחזית ' + w.forecast + ')' : '') + (w.previous ? ' (קודם ' + w.previous + ')' : '');
    try {
      var raw = await claude([{ role: 'user', content: 'אירוע: ' + q + '. תאריך: ' + new Date(w.ts).toISOString().slice(0, 10) + '. עכשיו ' + hm(Date.now()) + ' שעון ישראל.' }], { system: 'אתה עוזר לסוחר ישראלי. חפש ברשת האם האירוע כבר פורסם או נאמר, ומה בדיוק היה. אם עדיין לא פורסם, החזר published:false. אסור להמציא: רק מה שמצאת בפועל עם קישור. החזר JSON בלבד: {"published":true,"actual":"המספר או ההכרזה בפועל","forecast":"התחזית","verdict":"מעל התחזית|מתחת לתחזית|בקו התחזית|לא רלוונטי","summary":"שתי עד שלוש שורות בעברית פשוטה: מה קרה ולמה זה חשוב","reaction":"איך השוק או המניה הגיבו עד עכשיו, אם ידוע","source":"","url":""}.', tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }], max_tokens: 1200, tier: 'cheap' });
      var j = parseJSON(raw);
      if (j && j.published && /^https?:/.test(j.url || '') && j.summary) { w.result = { actual: j.actual || '', forecast: j.forecast || w.forecast, verdict: j.verdict || '', summary: j.summary, reaction: j.reaction || '', source: j.source || 'מקור', url: j.url, t: Date.now() }; notify(w); }
      else if (w.tries >= 8) w.result = { failed: 1, summary: 'לא נמצא פרסום מתועד אחרי 8 בדיקות. בדוק ידנית.', t: Date.now() };
    } catch (e) { if (w.tries >= 8) w.result = { failed: 1, summary: 'הבדיקה נכשלה: ' + e.message, t: Date.now() }; }
    w.busy = 0; save(); paint();
  }
  function notify(w) {
    var r = w.result, txt = w.title + ': ' + (r.actual ? r.actual + (r.verdict ? ' (' + r.verdict + ')' : '') : '') + '\n' + r.summary + (r.reaction ? '\nתגובת השוק: ' + r.reaction : '');
    if (typeof toast === 'function') toast(w.title + ' פורסם. הסיכום בתדריך');
    try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(w.title + ' פורסם', { body: r.summary }); } catch (e) { }
    if (typeof telegram === 'function') Promise.resolve(telegram('📌 ' + txt + '\n' + r.url)).catch(function () { });
  }
  function tick() {
    var ws = D && D.evWatch; if (!ws || !ws.length || typeof aiKey !== 'function' || !aiKey()) return;
    var due = ws.filter(function (w) { return !w.result && !w.busy && Date.now() >= w.ts + 2 * 6e4 && Date.now() >= (w.next || 0); })[0];
    if (due) check(due);
  }
  function watchHtml() {
    var ws = (D.evWatch || []).slice().sort(function (a, b) { return b.ts - a.ts; }); if (!ws.length) return '';
    return '<h4 class="cx-h">אירועים במעקב</h4>' + ws.map(function (w) {
      var r = w.result, st = r ? '' : w.busy ? '<span>בודק עכשיו…</span>' : Date.now() < w.ts ? '<span>ממתין לפרסום · ' + new Date(w.ts).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</span>' : '<span>הפרסום צפוי, בודק כל 5 דקות</span>';
      return '<div class="cx-i"><b>' + esc(w.title) + '</b>' + (w.forecast || w.previous ? '<p>' + (w.forecast ? 'תחזית ' + esc(w.forecast) : '') + (w.forecast && w.previous ? ' · ' : '') + (w.previous ? 'קודם ' + esc(w.previous) : '') + '</p>' : '') + st +
        (r ? (r.failed ? '<p>' + esc(r.summary) + '</p>' : '<div class="dp-regime ' + (/מעל/.test(r.verdict) ? 'on' : /מתחת/.test(r.verdict) ? 'off' : '') + '"><i></i><b>' + (r.actual ? esc(r.actual) : 'פורסם') + (r.verdict ? ' · ' + esc(r.verdict) : '') + '</b><span>' + esc(r.summary) + (r.reaction ? ' תגובת השוק: ' + esc(r.reaction) : '') + '</span></div><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.source) + ' ↗</a>') : '') +
        ' <a href="#" data-brx="' + esc(w.id) + '" style="font-size:12px">הסר</a></div>';
    }).join('');
  }
  /* ---------- רדאר מוקדם: מניות שמתפוצצות וקטליזטורים שבדרך (FDA, ספין-אוף, פיצול, קרב שורט, דוחות של מניות קטנות) ---------- */
  async function loadRadar(force) {
    if (typeof aiKey !== 'function' || !aiKey()) { ST.radar = { err: 'לרדאר צריך מפתח בינה בהגדרות.' }; paint(); return; }
    var hit; try { hit = JSON.parse(localStorage.getItem('adir-radar') || 'null'); } catch (e) { }
    if (hit && hit.hot && Date.now() - hit.t < 12 * 3600e3) { ST.radar = hit; paint(); }
    if (!force && hit && Date.now() - hit.t < 30 * 60e3) return; if (ST.busy.r) return; ST.busy.r = 1; paint();
    try {
      var raw = await claude([{ role: 'user', content: 'היום: ' + new Date().toISOString().slice(0, 10) + '.' }], { system: 'אתה סורק מניות לסוחר יומי ישראלי שמחפש מניות לפני שהן מתפוצצות. חפש ברשת בשוק האמריקאי: (א) מניות שזינקו או קרסו בצורה קיצונית היום ובשבוע האחרון (20% ומעלה), ומה הסיבה האמיתית: חדשות, דוח, אישור FDA, מיזוג, קרב שורט, פיצול מניה, רישום מחדש או ספין-אוף. אם הזינוק נראה תוצאה של שינוי טכני (פיצול הפוך, ספין-אוף, שינוי סימול, מניה שרק התחילה להיסחר) ולא של שווי אמיתי, ציין זאת במפורש. (ב) קטליזטורים צפויים בימים הקרובים במניות קטנות ובינוניות: החלטות FDA ותאריכי PDUFA, דוחות של מניות עם עניין גבוה, ספין-אוף, פיצול מניות, הכללה במדד, מיזוג שמחכה לאישור, מניות עם שורט גבוה ופלואט נמוך. לכל פריט: סימול אמיתי בלבד, סיבה, מה לצפות, הסיכון, תאריך אם ידוע, מקור עם קישור. חוק ברזל: רק מה שמצאת בפועל עם קישור. אסור להמציא סימולים או מספרים. החזר JSON בלבד: {"summary":"שתי שורות: מה הכי חם עכשיו","hot":[{"sym":"","move":"+X% בשבוע","why":"","technical":false,"risk":"","source":"","url":""}],"upcoming":[{"sym":"","date":"YYYY-MM-DD","type":"FDA|דוח|ספין-אוף|פיצול|מדד|מיזוג|קרב שורט|אחר","why":"","setup":"מה לצפות ואיך לעקוב","risk":"","source":"","url":""}]}. עד 6 במה שזז ועד 8 בקטליזטורים.', tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }], max_tokens: 3500, tier: 'cheap' });
      var j = parseJSON(raw), ok = function (a) { return (Array.isArray(a) ? a : []).filter(function (x) { return x && /^[A-Z.]{1,6}$/.test(x.sym || '') && /^https?:/.test(x.url || ''); }); };
      var hot = ok(j.hot).slice(0, 6), up = ok(j.upcoming).slice(0, 8), syms = Array.from(new Set(hot.concat(up).map(function (x) { return x.sym; })));
      var qs = {}; if (S.fh) await Promise.all(syms.map(async function (t) { try { var q = await fh('/quote?symbol=' + t); if (q && q.c > 0) qs[t] = { c: q.c, dp: q.dp }; } catch (e) { } }));
      var tag = function (x) { x.q = qs[x.sym] || null; x.verified = !!qs[x.sym]; return x; };
      ST.radar = { t: Date.now(), summary: j.summary || '', hot: hot.map(tag), upcoming: up.map(tag), noFh: !S.fh };
      try { localStorage.setItem('adir-radar', JSON.stringify(ST.radar)); } catch (e) { }
    } catch (e) { if (!ST.radar || !ST.radar.hot) ST.radar = { err: 'הרדאר נכשל: ' + e.message }; }
    ST.busy.r = 0; paint();
  }
  async function loadIpo() {
    if (!S.fh || ST.ipo) return; var d = function (x) { return x.toISOString().slice(0, 10); };
    try { var j = await fh('/calendar/ipo?from=' + d(new Date()) + '&to=' + d(new Date(Date.now() + 14 * 864e5))); ST.ipo = ((j && j.ipoCalendar) || []).filter(function (x) { return x.symbol && x.name; }).slice(0, 10); } catch (e) { ST.ipo = []; }
    paint();
  }
  function radarCard(x, kind) {
    var q = x.q ? '<span class="' + cls(x.q.dp) + '" style="direction:ltr">' + x.q.c.toFixed(2) + ' · ' + pc(x.q.dp) + ' היום</span>' : '<span style="color:var(--ink2);font-size:12px">מחיר לא אומת</span>';
    var big = x.technical ? '<div class="dp-regime off"><i></i><b>ייתכן שהזינוק טכני ולא אמיתי</b><span>פיצול, ספין-אוף, שינוי סימול או מניה שרק התחילה להיסחר. בדוק במקור לפני שמסיקים משהו.</span></div>' : '';
    return '<div class="cx-i"><b><a href="#" data-brd="' + esc(x.sym) + '">' + esc(x.sym) + '</a> ' + (kind === 'hot' ? (x.move ? esc(x.move) : '') : (x.type ? '· ' + esc(x.type) : '') + (x.date ? ' · ' + esc(x.date) : '')) + '</b> ' + q + big +
      '<p>' + esc(x.why) + '</p>' + (x.setup ? '<p class="br-ex"><b>מה לצפות:</b> ' + esc(x.setup) + '</p>' : '') + (x.risk ? '<p class="br-ex"><b>סיכון:</b> ' + esc(x.risk) + '</p>' : '') +
      '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.source || 'מקור') + ' ↗</a></div>';
  }
  function radarHtml() {
    var r = ST.radar, out = '';
    if (ST.busy.r && !(r && r.hot)) return '<div class="dp-skel"><i style="height:120px"></i></div><div class="dp-foot">סורק ברשת מניות שמתפוצצות וקטליזטורים בדרך. לוקח כחצי דקה.</div>';
    if (!r) return '<div class="dp-empty">טוען…</div>'; if (r.err) return '<div class="dp-empty">' + esc(r.err) + '</div>';
    if (r.summary) out += '<div class="dp-regime"><i></i><b>' + esc(r.summary) + '</b></div>';
    out += '<h4 class="cx-h">זזו חזק עכשיו <small><a href="#" data-brf="radar">רענן</a></small></h4>' + (r.hot.length ? r.hot.map(function (x) { return radarCard(x, 'hot'); }).join('') : '<div class="dp-empty">לא נמצאו.</div>');
    out += '<h4 class="cx-h">קטליזטורים בדרך</h4>' + (r.upcoming.length ? r.upcoming.map(function (x) { return radarCard(x, 'up'); }).join('') : '<div class="dp-empty">לא נמצאו.</div>');
    out += '<h4 class="cx-h">הנפקות בשבועיים הקרובים</h4>' + (ST.ipo && ST.ipo.length ? '<div class="cx-t">' + ST.ipo.map(function (x) { return '<div class="cx-r" style="grid-template-columns:1.6fr 1fr 1fr"><span>' + esc(x.name) + ' <small>' + esc(x.symbol) + '</small></span><span>' + esc(x.date || '') + '</span><span>' + (x.price ? esc(x.price) : '–') + '</span></div>'; }).join('') + '</div>' : '<div class="dp-empty">' + (S.fh ? 'אין הנפקות מתועדות.' : 'צריך מפתח Finnhub.') + '</div>');
    out += '<div class="dp-foot" style="text-align:right">מחקר ברשת נכון ל-' + hm(r.t) + (ST.busy.r ? ' · מתעדכן ברקע…' : '') + '. מניות כאלה תנודתיות מאוד, ולא מומלץ לרדוף אחרי זינוק שכבר קרה. הסימולים נבדקו מול Finnhub ("מחיר לא אומת" אומר שלא נמצא מחיר). לא ייעוץ השקעות.</div>';
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
    host.innerHTML = ST.tab === 'market' ? marketHtml() : ST.tab === 'cal' ? calHtml() : ST.tab === 'clock' ? clockHtml() : ST.tab === 'radar' ? radarHtml() : newsHtml();
    host.querySelectorAll('[data-brd]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); window.openDeep(a.dataset.brd); }; });
    host.querySelectorAll('[data-brw]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); addWatch(a.dataset.brw); }; });
    host.querySelectorAll('[data-brx]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); D.evWatch = (D.evWatch || []).filter(function (w) { return w.id !== a.dataset.brx; }); save(); paint(); }; });
    host.querySelectorAll('[data-brf]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); if (a.dataset.brf === 'cal') loadCal(true); else if (a.dataset.brf === 'radar') loadRadar(true); else window.__wire.load(true).then(paint); }; });
  }
  function show(t) { ST.tab = t; clearInterval(ST.iv); if (t === 'clock') ST.iv = setInterval(function () { if ($q('#p-brief.on') && ST.tab === 'clock') paint(); }, 30e3); if (t === 'market') loadMarket(); else if (t === 'radar') { loadRadar(); loadIpo(); } else if (t === 'cal') { loadEarn(); if (!ST.cal) loadCal(); } else { if (window.__hot) window.__hot.refresh(); if (window.__wire) window.__wire.load(false); setTimeout(paint, 1500); } paint(); }
  function build() {
    if ($q('#p-brief')) return;
    var s = document.createElement('section'); s.className = 'page'; s.id = 'p-brief';
    s.innerHTML = '<div class="tabs" id="brTabs" style="margin:6px 0 10px"><button data-t="market">שוק</button><button data-t="cal">יומן ודוחות</button><button data-t="radar">רדאר</button><button data-t="news">חדשות ומובילות</button><button data-t="clock">שעון מסחר</button></div><div class="dp-card"><div id="brBody"></div></div>';
    document.querySelector('main').appendChild(s);
    $q('#brTabs').querySelectorAll('button').forEach(function (b) { b.onclick = function () { show(b.dataset.t); }; });
    window.__briefShow = function () { var t = new URLSearchParams(location.search).get('tab'); show(t && ['market', 'cal', 'radar', 'news', 'clock'].indexOf(t) >= 0 && !ST.opened ? t : ST.tab); ST.opened = 1; };
  }
  build();
  /* טעינה מוקדמת ברקע ביום מסחר, כדי שהיומן יהיה מוכן כשפותחים את הלשונית */
  setTimeout(function () { var d = new Date().getDay(); if (d > 0 && d < 6 && typeof aiKey === 'function' && aiKey()) loadCal(false); if (S.fh) loadEarn(false); }, 6000);
  GROUPS.morning.push(['p-brief', 'תדריך']); PAGE_GROUP['p-brief'] = 'morning';
  var _e = onEnter; onEnter = function (id) { _e(id); if (id === 'p-brief') window.__briefShow(); };
  setInterval(tick, 60e3); setTimeout(tick, 9000);
  window.__brief = { tick: tick, addWatch: addWatch, check: check, tid: tid, state: ST, loadMarket: loadMarket, loadEarn: loadEarn };
})();
