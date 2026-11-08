/* מידע מוקדם: אנליסטים בדף הבית.
   לשונית "שינויי המלצות": חיפוש ברשת (Investing.com, MarketBeat, TipRanks, Benzinga, גלובס ועוד) ותרגום לעברית.
   לשונית "קונצנזוס": נתון קשיח מ-Finnhub, שינוי בחלק הממליצים לקנות מול החודש הקודם. */
(function () {
  'use strict';
  var AN = { tab: 'web', busy: false, cons: null, consT: 0, inited: false };
  var $q = function (s) { return document.querySelector(s); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var TYPE = { upgrade: ['שדרוג', 'up'], downgrade: ['הורדת דירוג', 'down'], initiate: ['כיסוי חדש', 'blue'], target_up: ['העלאת יעד', 'up'], target_down: ['הורדת יעד', 'down'], reiterate: ['אישור המלצה', 'flat'], catalyst: ['אירוע קרוב', 'warn'] };
  var SYS = 'אתה חוקר שוק הון עבור סוחר ישראלי. קבל רשימת טיקרים וחפש ברשת מידע עדכני מהימים האחרונים: שינויי המלצה (שדרוג, הורדה, כיסוי חדש, אישור), שינויי יעד מחיר, ואירועים שיכולים להזיז את המניה (דוחות קרובים, אישורים רגולטוריים, עסקאות). ' +
    'מקורות מועדפים: investing.com, marketbeat.com, tipranks.com, benzinga.com, finviz.com, globes.co.il, bizportal.co.il. ' +
    'חוק ברזל: כלול רק מה שמצאת בפועל בחיפוש ועם מקור. אסור להמציא בית השקעות, דירוג, יעד או תאריך. אם לא מצאת, החזר רשימה ריקה. ' +
    'החזר JSON בלבד, בלי טקסט נוסף, במבנה: {"items":[{"ticker":"MU","type":"upgrade|downgrade|initiate|target_up|target_down|reiterate|catalyst","firm":"שם בית ההשקעות","from":"דירוג קודם","to":"דירוג חדש","pt_old":0,"pt_new":0,"date":"YYYY-MM-DD","summary":"משפט אחד בעברית","why":"למה זה חשוב לסוחר, משפט אחד בעברית","source":"שם האתר","url":"קישור"}]}. עד 12 פריטים, מהחדש לישן. מספרים בלי סימן דולר.';

  function tickers(limit) {
    var seen = {}, out = [];
    var add = function (t) { t = String(t || '').toUpperCase(); if (t && !seen[t] && t !== 'BTC' && !/[:\/]/.test(t)) { seen[t] = 1; out.push(t); } };
    (D.trades || []).filter(function (t) { return t.status !== 'closed'; }).forEach(function (t) { add(t.ticker); });
    (D.plans || []).forEach(function (p) { add(p.ticker); });
    (D.watch || []).slice(0, 2).forEach(function (w) { w.items.forEach(add); });
    ['MSTR', 'MU', 'NVDA'].forEach(add);
    return out.slice(0, limit);
  }
  var ago = function (iso) { var d = Math.round((Date.now() - Date.parse(iso)) / 864e5); return !isFinite(d) ? '' : d <= 0 ? 'היום' : d === 1 ? 'אתמול' : 'לפני ' + d + ' ימים'; };
  var pt = function (n) { return n != null && isFinite(n) && +n > 0 ? '$' + (+n).toLocaleString('en-US', { maximumFractionDigits: 2 }) : null; };

  /* ---------- קונצנזוס (Finnhub) ---------- */
  async function loadCons(force) {
    if (!S.fh) return null;
    if (!force && AN.cons && Date.now() - AN.consT < 6 * 3600e3) return AN.cons;
    var calc = function (x) { var tot = (x.strongBuy || 0) + (x.buy || 0) + (x.hold || 0) + (x.sell || 0) + (x.strongSell || 0); return tot ? { share: ((x.strongBuy || 0) + (x.buy || 0)) / tot, tot: tot, x: x } : null; };
    var out = [];
    await Promise.all(tickers(14).map(async function (t) {
      try {
        var r = await fetch('https://finnhub.io/api/v1/stock/recommendation?symbol=' + encodeURIComponent(t) + '&token=' + encodeURIComponent(S.fh));
        var j = await r.json();
        if (Array.isArray(j) && j.length) { var a = calc(j[0]), b = j[1] ? calc(j[1]) : null; if (a) out.push({ t: t, a: a, d: b ? (a.share - b.share) * 100 : null, period: j[0].period }); }
      } catch (e) { }
    }));
    out.sort(function (x, y) { return Math.abs(y.d || 0) - Math.abs(x.d || 0); });
    AN.cons = out; AN.consT = Date.now(); return out;
  }
  function consHtml(rows) {
    if (!S.fh) return '<div class="empty">להמלצות אנליסטים צריך מפתח Finnhub בהגדרות (⚙️).</div>';
    if (!rows || !rows.length) return '<div class="empty">לא התקבל קונצנזוס. נסה לרענן.</div>';
    return rows.map(function (r) {
      var x = r.a.x, d = r.d, tag = d == null ? '' : d >= 5 ? '<span class="chip up">▲ קונצנזוס משתפר</span>' : d <= -5 ? '<span class="chip down">▼ קונצנזוס נחלש</span>' : '';
      var bar = [['strongBuy', '#0FA36A'], ['buy', '#19D68A'], ['hold', '#FFB020'], ['sell', '#FF7A85'], ['strongSell', '#FF4D5E']].map(function (k) { return '<i style="flex:' + (x[k[0]] || 0) + ';background:' + k[1] + '"></i>'; }).join('');
      return '<div class="an-i cons"><div class="an-top"><b class="tk">' + esc(r.t) + '</b>' + tag + '<span class="when">' + r.a.tot + ' אנליסטים</span></div><div class="an-bar">' + bar + '</div>' +
        '<div class="an-mv">' + Math.round(r.a.share * 100) + '% ממליצים לקנות' + (d != null ? ' <em class="' + (d >= 0 ? 'up' : 'down') + '">' + (d >= 0 ? '+' : '') + d.toFixed(1) + ' נק\' מהחודש שעבר</em>' : '') + '</div></div>';
    }).join('');
  }

  /* ---------- שינויי המלצות (חיפוש ברשת) ---------- */
  async function loadWeb(force) {
    if (AN.busy) return;
    if (!aiKey()) { toast('לחיפוש ברשת צריך מפתח בינה בהגדרות'); return; }
    AN.busy = true; $q('#anRefresh').disabled = true; $q('#anT').innerHTML = '<span class="spin"></span> מחפש ברשת…'; render();
    try {
      var tk = tickers(10);
      var raw = await claude([{ role: 'user', content: 'טיקרים לבדיקה: ' + tk.join(', ') + '\nהיום: ' + new Date().toISOString().slice(0, 10) + '. חפש מהשבוע האחרון.' }],
        { system: SYS, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }], max_tokens: 3500, tier: 'cheap' });
      var j = parseJSON(raw), items = (j.items || []).filter(function (i) { return i && i.ticker && i.summary && i.url && /^https?:/.test(i.url); });
      D.analysts = { t: Date.now(), items: items }; await save();
    } catch (e) { toast('החיפוש נכשל: ' + e.message); }
    AN.busy = false; $q('#anRefresh').disabled = false; render();
  }
  function webHtml() {
    var A = D.analysts;
    if (AN.busy) return '<div class="dp-skel"><i style="height:90px"></i><i style="height:90px"></i></div>';
    if (!A || !A.items || !A.items.length) return '<div class="empty">' + (A ? 'לא נמצאו שינויי המלצות מתועדים מהימים האחרונים לטיקרים שלך.' : 'עוד לא נבדק. לחץ ↻ כדי לחפש ברשת שינויי המלצות ויעדי מחיר.') + '</div>';
    return A.items.map(function (i) {
      var ty = TYPE[i.type] || TYPE.reiterate, a = pt(i.pt_old), b = pt(i.pt_new);
      var mv = (i.from && i.to ? esc(i.from) + ' ← ' + esc(i.to) : esc(i.to || i.from || '')) + (b ? ' · יעד ' + b + (a ? ' (קודם ' + a + ')' : '') : '');
      return '<div class="an-i"><div class="an-top"><b class="tk">' + esc(i.ticker) + '</b><span class="chip ' + ty[1] + '">' + ty[0] + '</span><span class="when">' + esc(i.firm || '') + (i.date ? ' · ' + ago(i.date) : '') + '</span></div>' +
        (mv ? '<div class="an-mv">' + mv + '</div>' : '') + '<p>' + esc(i.summary) + '</p>' + (i.why ? '<div class="why">' + esc(i.why) + '</div>' : '') +
        '<a href="' + esc(i.url) + '" target="_blank" rel="noopener">' + esc(i.source || 'מקור') + ' ↗</a></div>';
    }).join('');
  }

  async function render() {
    var box = $q('#anBox'); if (!box) return;
    document.querySelectorAll('#anTabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === AN.tab); });
    var T = $q('#anT');
    if (AN.tab === 'web') { box.innerHTML = webHtml(); if (T && !AN.busy) T.textContent = D.analysts ? 'עודכן ' + new Date(D.analysts.t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : ''; }
    else { box.innerHTML = '<div class="dp-skel"><i style="height:80px"></i></div>'; var rows = await loadCons(false); if (AN.tab === 'cons') { box.innerHTML = consHtml(rows); if (T) T.textContent = AN.consT ? 'Finnhub · ' + new Date(AN.consT).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : ''; } }
  }
  function init() {
    if (AN.inited) return; AN.inited = true;
    document.querySelectorAll('#anTabs button').forEach(function (b) { b.onclick = function () { AN.tab = b.dataset.t; render(); }; });
    $q('#anRefresh').onclick = function () { if (AN.tab === 'web') loadWeb(true); else { AN.cons = null; render(); } };
    document.querySelectorAll('#homeJump button').forEach(function (b) { b.onclick = function () { var t = document.querySelector(b.dataset.j); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
    render();
    /* רענון אוטומטי פעם ב-6 שעות, רק אם יש מפתח בינה */
    var stale = !D.analysts || Date.now() - D.analysts.t > 6 * 3600e3;
    if (stale && aiKey() && S.anAuto !== false) setTimeout(function () { loadWeb(false); }, 2500);
  }
  var _enter = onEnter;
  onEnter = function (id) { _enter(id); if (id === 'p-morning' && D) { init(); render(); } };
  var wait = setInterval(function () { if (typeof D !== 'undefined' && D && $q('#anBox')) { clearInterval(wait); init(); } }, 400);
  window.__analysts = { state: AN, render: render, loadWeb: loadWeb, loadCons: loadCons };
})();
