/* סריקה חכמה + מסך "שוק".
   סריקה חכמה: מריצה את מנוע הניתוח (נרות יומיים + מצב שוק + חוזק יחסי) על כל רשימת מניות, ומחזירה לכל מניה
   כיוון (לונג או שורט), חוזק, החלטה (כניסה / לקראת כניסה / מעקב) ותוכנית עם סטופ, יעדים וכמות.
   מסך שוק: ווידג'טים של TradingView (סורק, מפת חום, יומן כלכלי, סקירה, חדשות) לצפייה, עם גשר לסריקה החכמה. */
(function () {
  'use strict';
  var E = AT.engine, DP = window.__deep;
  var $q = function (s) { return document.querySelector(s); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var num = function (n, d) { return n == null || !isFinite(n) ? '–' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); };
  var px = function (n) { return n == null || !isFinite(n) ? '–' : Math.abs(n) >= 10 ? num(n, 2) : num(n, 3); };
  var KEY = 'adir-scan2';
  var SC = { items: [], busy: false, stop: false, filter: 'all', done: 0, total: 0, msg: '', regime: null, at: 0, text: '' };
  try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv && sv.items) { SC.items = sv.items; SC.at = sv.at; SC.regime = sv.regime; } } catch (e) { }
  var persist = function () { try { localStorage.setItem(KEY, JSON.stringify({ items: SC.items.slice(0, 80), at: SC.at, regime: SC.regime })); } catch (e) { } };

  /* ---------- קלט: רשימת סימולים ---------- */
  function parseSyms(text) {
    var seen = {}, out = [];
    String(text || '').split(/[\s,;\n\r\t]+/).forEach(function (t) {
      t = t.replace(/^.*:/, '').toUpperCase().replace(/[^A-Z0-9.\-\/]/g, ''); if (t === 'BTC') t = 'BTC/USD'; if (t === 'ETH') t = 'ETH/USD';
      if (/^[A-Z][A-Z0-9.\-]{0,5}$|^[A-Z]{2,5}\/USD$/.test(t) && !seen[t]) { seen[t] = 1; out.push(t); }
    });
    return out.slice(0, 60);
  }
  function myTickers() {
    var seen = {}, out = []; var add = function (t) { t = String(t || '').toUpperCase(); if (t && !seen[t]) { seen[t] = 1; out.push(t); } };
    (D.trades || []).filter(function (t) { return t.status !== 'closed'; }).forEach(function (t) { add(t.ticker); }); (D.plans || []).forEach(function (p) { add(p.ticker); }); return out;
  }

  /* ---------- ניתוח מניה אחת ---------- */
  function ttShort(bars, spy) { /* מראה היפוכית של התבנית לשורט: בנייה שלי, לא מקור חיצוני */
    if (!bars || bars.length < 210) return { ok: false };
    var c = bars.map(function (b) { return b.c; }), i = c.length - 1, px_ = c[i], av = function (p, k) { var t = 0; for (var j = k - p + 1; j <= k; j++) t += c[j]; return t / p; };
    var s50 = av(50, i), s150 = av(150, i), s200 = av(200, i), s200p = av(200, i - 22), hi = -Infinity, lo = Infinity;
    bars.slice(-252).forEach(function (b) { if (b.h > hi) hi = b.h; if (b.l < lo) lo = b.l; });
    var r = [px_ < s150 && px_ < s200, s150 < s200, s200 < s200p, s50 < s150 && s50 < s200, px_ < s50, px_ <= hi * 0.7, px_ <= lo * 1.25];
    var rs = null; if (spy && spy.length > 130 && bars.length > 126) { rs = (bars[i].c / bars[i - 126].c - spy[spy.length - 1].c / spy[spy.length - 127].c) * 100; r.push(rs < 0); }
    var pass = r.filter(Boolean).length; return { ok: true, pass: pass, total: r.length, rs: rs, verdict: pass >= 7 ? 'ready' : pass >= 5 ? 'partial' : 'no' };
  }
  function analyze(sym, bars, spy, regime) {
    if (!bars || bars.length < 60) return { sym: sym, err: 'מעט מדי נרות (' + (bars ? bars.length : 0) + ')' };
    var a = E.analyzeTF(bars, '1D'); if (!a.ok) return { sym: sym, err: a.reason || 'אין ניתוח' };
    var score = a.score, dir = score >= 0 ? 'long' : 'short', abs = Math.abs(score);
    var conv = abs >= 50 ? 'strong' : abs >= 30 ? 'medium' : abs >= 15 ? 'weak' : 'none';
    var tt = dir === 'long' ? DP.trendTemplate(bars, spy) : ttShort(bars, spy);
    var counter = regime && ((dir === 'long' && regime.state === 'off') || (dir === 'short' && regime.state === 'on'));
    var step = conv === 'strong' && tt && tt.ok && tt.verdict === 'ready' ? 2 : (conv === 'strong' || conv === 'medium') ? 1 : 0;
    var why = [];
    if (counter) { step = Math.max(0, step - 1); why.push('נגד מצב השוק (' + regime.label + ')'); }
    var risk = a.atr * 1.5, long = dir === 'long', qty = risk > 0 && S.risk > 0 ? Math.floor(S.risk / risk) : 0;
    var maxLev = +S.maxLev > 0 ? +S.maxLev : 1; if (S.acct > 0 && a.price > 0) qty = Math.min(qty, Math.floor(S.acct * maxLev / a.price));
    var last = bars[bars.length - 1], prev = bars[bars.length - 2], rs6 = null;
    if (spy && spy.length > 130 && bars.length > 126) rs6 = (bars[bars.length - 1].c / bars[bars.length - 127].c - spy[spy.length - 1].c / spy[spy.length - 127].c) * 100;
    return { sym: sym, price: a.price, chg: prev ? (last.c / prev.c - 1) * 100 : null, score: score, dir: dir, conv: conv, step: step, tt: tt && tt.ok ? tt.pass + '/' + tt.total : null, ttv: tt && tt.ok ? tt.verdict : null, rs6: rs6, atrPct: a.atr / a.price * 100, rvol: a.rvol, state: a.state, why: why,
      notes: (a.notes || []).slice(0, 3), plan: { entry: a.price, stop: long ? a.price - risk : a.price + risk, t1: long ? a.price + 2 * risk : a.price - 2 * risk, t2: long ? a.price + 3 * risk : a.price - 3 * risk, qty: qty, riskUsd: qty * risk, atr: a.atr }, earnDays: null };
  }

  /* ---------- סריקה ---------- */
  function setMsg(t) { SC.msg = t; var n = $q('#smMsg'); if (n) n.textContent = t; var b = $q('#smBar i'); if (b && SC.total) b.style.width = Math.round(SC.done / SC.total * 100) + '%'; }
  async function scan(syms) {
    if (SC.busy) return;
    if (!S.td) return toast('צריך מפתח Twelve Data בהגדרות (⚙️)');
    if (!syms.length) return toast('הזן לפחות סימול אחד');
    var c = DP.getClient(); SC.busy = true; SC.stop = false; SC.done = 0; SC.total = syms.length; SC.items = []; paint();
    var spy = null; setMsg('בודק את מצב השוק (SPY)…'); try { spy = await c.series('SPY', '1day', 300); } catch (e) { }
    SC.regime = DP.regimeOf(spy);
    for (var i = 0; i < syms.length && !SC.stop; i++) {
      var sym = syms[i]; setMsg('סורק ' + sym + ' (' + (i + 1) + ' מתוך ' + syms.length + ')');
      try {
        var bars = sym === 'SPY' && spy ? spy : await c.series(sym, '1day', 300), row = analyze(sym, bars, spy, SC.regime);
        if (!row.err && S.fh && sym.indexOf('/') < 0) { try { var er = await c.earnings(sym); if (er && er.date) row.earnDays = Math.round((Date.parse(er.date) - Date.now()) / 864e5); } catch (e) { } }
        SC.items.push(row);
      } catch (e) { SC.items.push({ sym: sym, err: e.message }); }
      SC.done = i + 1; sortItems(); paintList();
    }
    SC.busy = false; SC.at = Date.now(); persist(); setMsg(SC.stop ? 'הסריקה נעצרה' : ''); paint();
  }
  function sortItems() { SC.items.sort(function (a, b) { if (!!a.err !== !!b.err) return a.err ? 1 : -1; if (a.err) return 0; return (b.step - a.step) || (Math.abs(b.score) - Math.abs(a.score)); }); }

  /* ---------- תצוגה ---------- */
  var DEC = { 2: ['entry', 'כניסה'], 1: ['prep', 'לקראת כניסה'], 0: ['watch', 'מעקב'] }, CONV = { strong: 'חזק', medium: 'בינוני', weak: 'חלש', none: 'אין יתרון' };
  function decText(r) {
    var side = r.dir === 'long' ? 'לונג' : 'שורט';
    if (r.step === 2) return side + ': הציון חזק והתבנית מאשרת. אפשר לתכנן כניסה לפי התוכנית.';
    if (r.step === 1) return side + ': יש כיוון, אבל חסר אישור מלא' + (r.why.length ? ' (' + r.why.join(', ') + ')' : '') + '. מחכים לריטסט או לנר אישור.';
    return (r.conv === 'none' ? 'אין יתרון ברור לאף כיוון.' : 'נטייה ל' + side + ' בלבד.') + ' אם נכנסים בכל זאת, רק בגודל מוקטן' + (r.why.length ? ' (' + r.why.join(', ') + ')' : '') + '.';
  }
  function bar(v) { var p = Math.round(Math.min(100, Math.abs(v)) / 2); return '<div class="dp-bar"><i class="' + (v >= 0 ? 'pos' : 'neg') + '" style="' + (v >= 0 ? 'right:50%;' : 'left:50%;') + 'width:' + p + '%"></i></div>'; }
  function rowHtml(r) {
    var d = DEC[r.step], side = r.dir === 'long' ? 'long' : 'short', p = r.plan;
    var kv = [r.tt ? 'תבנית ' + r.tt : null, r.rs6 != null ? 'חוזק יחסי ' + (r.rs6 >= 0 ? '+' : '') + num(r.rs6, 1) : null, 'ATR ' + num(r.atrPct, 1) + '%', r.rvol != null ? 'נפח x' + num(r.rvol, 2) : null, r.earnDays != null && r.earnDays >= 0 && r.earnDays <= 14 ? '<em class="warn">דוחות בעוד ' + r.earnDays + ' ימים</em>' : null].filter(Boolean).join(' · ');
    return '<div class="sm-r ' + side + ' s' + r.step + '" data-s="' + esc(r.sym) + '"><div class="sm-h"><b class="tk">' + esc(r.sym) + '</b><span class="sm-px">$' + px(r.price) + (r.chg != null ? ' <em class="' + (r.chg >= 0 ? 'up' : 'down') + '">' + (r.chg >= 0 ? '+' : '') + num(r.chg, 1) + '%</em>' : '') + '</span><span class="sm-v ' + side + '">' + (r.dir === 'long' ? 'לונג' : 'שורט') + ' · ' + CONV[r.conv] + '</span></div>' +
      '<div class="sm-sc">' + bar(r.score) + '<b>' + r.score + '</b></div><div class="sm-d ' + d[0] + '"><i></i><b>' + d[1] + '</b><span>' + esc(decText(r)) + '</span></div><div class="sm-kv">' + kv + '</div>' +
      '<div class="sm-pl"><span>כניסה <b>$' + px(p.entry) + '</b></span><span>סטופ <b class="down">$' + px(p.stop) + '</b></span><span>יעד 1 <b class="up">$' + px(p.t1) + '</b></span><span>יעד 2 <b class="up">$' + px(p.t2) + '</b></span><span>כמות <b>' + (p.qty || '–') + '</b></span></div>' +
      '<div class="sm-a"><button data-a="deep">🧠 ניתוח מלא</button><button data-a="calc">🧮 מחשבון</button><button data-a="save">📓 שמור ליומן</button></div></div>';
  }
  function paintList() {
    var host = $q('#smList'); if (!host) return;
    var ok = SC.items.filter(function (r) { return !r.err; }), bad = SC.items.filter(function (r) { return r.err; });
    var f = SC.filter, shown = ok.filter(function (r) { return f === 'all' || (f === 'long' && r.dir === 'long') || (f === 'short' && r.dir === 'short') || (f === 'strong' && r.step >= 1); });
    var nl = ok.filter(function (r) { return r.dir === 'long'; }).length, ns = ok.length - nl, ne = ok.filter(function (r) { return r.step === 2; }).length;
    var rg = SC.regime ? '<div class="dp-regime ' + SC.regime.state + '"><i></i><b>' + SC.regime.label + '</b><span>SPY ' + (SC.regime.dist >= 0 ? '+' : '') + SC.regime.dist.toFixed(1) + '% מממוצע 200</span></div>' : '';
    var head = ok.length ? '<div class="sm-sum"><div><b>' + ne + '</b><span>כניסה</span></div><div><b class="up">' + nl + '</b><span>לונג</span></div><div><b class="down">' + ns + '</b><span>שורט</span></div><div><b>' + ok.length + '</b><span>נסרקו</span></div></div>' +
      '<div class="tabs" id="smF" style="margin:6px 0 10px">' + [['all', 'הכל'], ['strong', 'כניסה ולקראת'], ['long', 'לונג'], ['short', 'שורט']].map(function (x) { return '<button data-f="' + x[0] + '" class="' + (f === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>' : '';
    host.innerHTML = rg + head + (shown.length ? shown.map(rowHtml).join('') : (ok.length ? '<div class="dp-empty">אין תוצאות בסינון הזה.</div>' : SC.busy ? '<div class="dp-skel"><i style="height:140px"></i><i style="height:140px"></i></div>' : '<div class="dp-empty">עוד לא נסרק. בחר רשימה למעלה ולחץ "סרוק".</div>')) +
      (bad.length ? '<details class="ht-set"><summary>לא נסרקו (' + bad.length + ')</summary>' + bad.map(function (r) { return '<div class="dp-foot" style="text-align:right">' + esc(r.sym) + ': ' + esc(r.err) + '</div>'; }).join('') + '</details>' : '') +
      (ok.length ? '<div class="dp-foot" style="text-align:right;margin-top:10px">ההחלטה נגזרת מהציון היומי ומתבנית המגמה. מניה נגד מצב השוק יורדת דרגה. לכל מניה יש כיוון, אבל "חלש" ו"אין יתרון" אומרים שאין עדיפות סטטיסטית, ולא שכדאי להיכנס. התבנית לשורט היא מראה היפוכית שבניתי, לא מקור חיצוני. לא ייעוץ השקעות.</div>' : '');
    host.querySelectorAll('#smF button').forEach(function (b) { b.onclick = function () { SC.filter = b.dataset.f; paintList(); }; });
    host.querySelectorAll('.sm-r').forEach(function (el) {
      var r = SC.items.find(function (x) { return x.sym === el.dataset.s; });
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
      plan: { entry: p.entry, stop: p.stop, tp: [p.t1, p.t2], condition: 'סריקה חכמה: ' + DEC[r.step][1], reasons: r.notes, pattern: 'ציון ' + r.score, bias: r.dir, invalidation: (dir === 'long' ? 'סגירה מתחת ל-' : 'סגירה מעל ') + px(p.stop), analysts: null, news_context: null },
      sizing: { entry: p.entry, stop: p.stop, qty: p.qty, risk: Math.round(p.riskUsd), riskPct: S.acct > 0 ? p.riskUsd / S.acct * 100 : 0, pos: Math.round(p.qty * p.entry) }, imgs: { chart: null }, qty: p.qty, entryPrice: null,
      log: [{ t: Date.now(), type: 'סריקה חכמה', note: r.sym + ' ' + (dir === 'long' ? 'לונג' : 'שורט') + ' · ציון ' + r.score + ' · ' + decText(r) }] };
    D.trades.push(tr);
    var pl = D.plans.find(function (x) { return x.ticker === tk; });
    if (!pl) { pl = { id: tk.toLowerCase() + Date.now(), ticker: tk, cls: '', checks: [['סטופ מוגדר לפני כניסה', true], ['גודל פוזיציה חושב לפי סיכון', true]] }; D.plans.push(pl); }
    Object.assign(pl, { status: (dir === 'long' ? 'לונג' : 'שורט') + ' – מתוכנן', qty: p.qty, entry: p.entry, stop: p.stop, tp1: p.t1, tp2: p.t2, tp3: 0, rules: decText(r) + '\nביטול: ' + tr.plan.invalidation });
    await save(); renderPlans(); renderTrades(); toast('נשמר ביומן כעסקה מתוכננת');
  }
  function paint() {
    var busy = SC.busy, go = $q('#smGo'); if (go) { go.textContent = busy ? 'עצור' : 'סרוק'; }
    var bar_ = $q('#smBar'); if (bar_) bar_.style.display = busy ? '' : 'none';
    var m = $q('#smMsg'); if (m) m.textContent = SC.msg || (SC.at && !busy ? 'סריקה אחרונה: ' + new Date(SC.at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
    paintList();
  }

  /* ---------- בניית המסכים ---------- */
  function build() {
    if ($q('#p-smart')) return;
    var main = document.querySelector('main');
    var s1 = document.createElement('section'); s1.className = 'page'; s1.id = 'p-smart';
    s1.innerHTML = '<div class="dp-card"><h3>סריקה חכמה <small>כיוון והחלטה לכל מניה</small></h3>' +
      '<div class="dp-flag" style="background:rgba(88,196,255,.08);border-color:rgba(88,196,255,.3);color:#9bd9ff">הדבק סימולים (גם מהסורק של TradingView), או טען רשימה שלך. כל מניה מקבלת לונג או שורט, חוזק, ותוכנית עם סטופ ויעדים. סריקה של 30 מניות לוקחת כ-5 דקות, בגלל מגבלת הקצב של Twelve Data.</div>' +
      '<div class="tabs" id="smLists" style="margin:0 0 8px"></div>' +
      '<textarea id="smTxt" class="sm-txt" rows="3" dir="ltr" placeholder="NVDA, MU, AMD, TSLA   או   NASDAQ:NVDA NYSE:BA"></textarea>' +
      '<div class="dp-actions" style="grid-template-columns:1fr auto"><button class="btn" id="smGo">סרוק</button><button class="btn ghost" id="smClr">נקה</button></div>' +
      '<div class="dp-prog" id="smBar" style="display:none"><i></i></div><div class="dp-msg" id="smMsg"></div></div><div id="smList"></div>';
    main.appendChild(s1);
    var s2 = document.createElement('section'); s2.className = 'page'; s2.id = 'p-mkt';
    s2.innerHTML = '<div class="tabs" id="mkTabs" style="margin:6px 0 10px"></div><div class="dp-card mk-wrap"><div id="mkBox" class="mk-box"></div></div>' +
      '<div class="dp-card"><h3>מצאת מניות? <small>העבר אותן לסריקה חכמה</small></h3><textarea id="mkTxt" class="sm-txt" rows="2" dir="ltr" placeholder="הדבק כאן סימולים מהסורק או ממפת החום"></textarea><div class="dp-actions" style="grid-template-columns:1fr"><button class="btn" id="mkGo">🔎 סרוק אותן וקבל לונג / שורט</button></div></div>' +
      '<div class="dp-foot" style="text-align:right">הווידג\'טים של TradingView הם לצפייה בלבד, בנתונים מושהים בבורסות רבות. הם נטענים מהשרתים של TradingView.</div>';
    main.appendChild(s2);
    var lists = [['⭐ הפוזיציות והתוכניות שלי', function () { return myTickers(); }]];
    $q('#smLists').innerHTML = '<button data-l="-1">⭐ שלי</button>' + (D && D.watch ? '' : '');
    fillLists();
    $q('#smClr').onclick = function () { $q('#smTxt').value = ''; };
    $q('#smGo').onclick = function () { if (SC.busy) { SC.stop = true; return; } scan(parseSyms($q('#smTxt').value)); };
    $q('#mkGo').onclick = function () { var t = $q('#mkTxt').value; if (!parseSyms(t).length) return toast('הדבק לפחות סימול אחד'); $q('#smTxt').value = parseSyms(t).join(' '); goPage('p-smart'); onEnter('p-smart'); scan(parseSyms(t)); };
    var W = [['ov', 'סקירה', 'embed-widget-market-overview.js', { colorTheme: 'dark', dateRange: '1D', showChart: true, locale: 'he_IL', width: '100%', height: 560, isTransparent: true, showSymbolLogo: true, showFloatingTooltip: false, tabs: [{ title: 'מדדים', symbols: [{ s: 'FOREXCOM:SPXUSD', d: 'S&P 500' }, { s: 'FOREXCOM:NSXUSD', d: 'נאסד"ק 100' }, { s: 'FOREXCOM:DJI', d: 'דאו ג\'ונס' }, { s: 'CAPITALCOM:RTY', d: 'ראסל 2000' }, { s: 'CAPITALCOM:VIX', d: 'VIX' }] }, { title: 'קריפטו', symbols: [{ s: 'BITSTAMP:BTCUSD', d: 'ביטקוין' }, { s: 'BITSTAMP:ETHUSD', d: 'אתריום' }] }, { title: 'סחורות', symbols: [{ s: 'TVC:GOLD', d: 'זהב' }, { s: 'TVC:USOIL', d: 'נפט' }] }] }],
      ['sc', 'סורק', 'embed-widget-screener.js', { width: '100%', height: 600, defaultColumn: 'overview', defaultScreen: 'most_capitalized', market: 'america', showToolbar: true, colorTheme: 'dark', locale: 'he_IL', isTransparent: true }],
      ['hm', 'מפת חום', 'embed-widget-stock-heatmap.js', { exchanges: [], dataSource: 'SPX500', grouping: 'sector', blockSize: 'market_cap_basic', blockColor: 'change', locale: 'he_IL', symbolUrl: '', colorTheme: 'dark', hasTopBar: true, isDataSetEnabled: false, isZoomEnabled: true, hasSymbolTooltip: true, isMonoSize: false, width: '100%', height: 560 }],
      ['ec', 'יומן כלכלי', 'embed-widget-events.js', { colorTheme: 'dark', isTransparent: true, width: '100%', height: 560, locale: 'he_IL', importanceFilter: '0,1', countryFilter: 'us' }],
      ['nw', 'חדשות', 'embed-widget-timeline.js', { feedMode: 'market', market: 'stock', isTransparent: true, displayMode: 'regular', width: '100%', height: 560, colorTheme: 'dark', locale: 'he_IL' }]];
    var cur = null;
    function show(k) { cur = k; var w = W.filter(function (x) { return x[0] === k; })[0]; $q('#mkTabs').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.k === k); }); tv('mkBox', w[2], w[3]); }
    $q('#mkTabs').innerHTML = W.map(function (x) { return '<button data-k="' + x[0] + '">' + x[1] + '</button>'; }).join('');
    $q('#mkTabs').querySelectorAll('button').forEach(function (b) { b.onclick = function () { show(b.dataset.k); }; });
    window.__mkShow = function () { if (!cur) show('sc'); };
  }
  function fillLists() {
    var box = $q('#smLists'); if (!box) return; var L = [['⭐ שלי', myTickers]].concat(((D && D.watch) || []).filter(function (w) { return w.items.length; }).map(function (w) { return [w.name, function () { return w.items.filter(function (t) { return !/[:]/.test(t); }); }]; }));
    box.innerHTML = L.map(function (x, i) { return '<button data-i="' + i + '">' + esc(x[0]) + '</button>'; }).join('');
    box.querySelectorAll('button').forEach(function (b) { b.onclick = function () { var cur = parseSyms($q('#smTxt').value), add = parseSyms(L[+b.dataset.i][1]().join(' ')); add.forEach(function (t) { if (cur.indexOf(t) < 0) cur.push(t); }); $q('#smTxt').value = cur.slice(0, 60).join(' '); }; });
  }
  build();
  GROUPS.scan.splice(0, 0, ['p-smart', 'סריקה חכמה'], ['p-mkt', 'שוק']);
  GROUPS.scan.forEach(function (x) { if (x[0] === 'p-scan') x[1] = 'פריצות'; });
  PAGE_GROUP['p-smart'] = 'scan'; PAGE_GROUP['p-mkt'] = 'scan';
  var _e = onEnter;
  onEnter = function (id) { _e(id); if (id === 'p-smart') { fillLists(); paint(); } if (id === 'p-mkt') window.__mkShow(); };
  window.__smart = { parseSyms: parseSyms, analyze: analyze, ttShort: ttShort, state: SC, scan: scan };
})();
