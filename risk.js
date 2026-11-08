/* מודול 1: מחשבון ניהול סיכונים מתקדם.
   מניות, קריפטו (עם מינוף), חוזים עתידיים (ערך נקודה) ואופציות (מכפיל 100).
   כמות מדויקת מהסיכון, שלושה יעדים לפי R, עמלות, מרווח, הערכת חיסול, ואזהרות ברורות. */
(function () {
  'use strict';
  var KEY = 'adir-calc', $q = function (s) { return document.querySelector(s); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var num = function (n, d) { return n == null || !isFinite(n) ? '–' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); };
  var TYPES = { stock: 'מניה / ETF', crypto: 'קריפטו', future: 'חוזה עתידי', option: 'אופציה' };
  var ST = { type: 'stock', acct: 0, riskPct: 1, riskUsd: 0, riskBy: 'pct', sym: '', entry: '', stop: '', atr: '', atrMult: 1.5, r1: 2, r2: 3, r3: 4, fee: 0, lev: 1, pv: 1, mult: 100 };
  try { Object.assign(ST, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { }
  var OUT = null;

  function calc() {
    var s = ST, e = +s.entry, st = +s.stop, acct = +s.acct || 0, w = [];
    var res = { ok: false, w: w };
    if (!(e > 0) || !(st > 0)) { res.msg = 'הזן מחיר כניסה וסטופ'; return res; }
    if (e === st) { res.msg = 'הסטופ לא יכול להיות שווה לכניסה'; return res; }
    var long = e > st, dist = Math.abs(e - st);
    var riskUsd = s.riskBy === 'usd' ? +s.riskUsd || 0 : acct * (+s.riskPct || 0) / 100;
    if (!(riskUsd > 0)) { res.msg = 'הגדר סיכון (באחוזים או בדולרים) והון תיק'; return res; }
    var perUnit = s.type === 'future' ? dist * (+s.pv || 1) : s.type === 'option' ? dist * (+s.mult || 100) : dist;
    var feeUsd = function (q) { return (+s.fee || 0) / 100 * e * q * (s.type === 'future' ? (+s.pv || 1) : s.type === 'option' ? (+s.mult || 100) : 1) * 2; };
    /* כמות: מחשבים כך שהסיכון הכולל כולל עמלות לא יעלה על התקציב */
    var qty = s.type === 'stock' || s.type === 'crypto' ? riskUsd / (perUnit + (+s.fee || 0) / 100 * e * 2) : riskUsd / (perUnit + feeUsd(1));
    qty = s.type === 'crypto' ? Math.floor(qty * 1e6) / 1e6 : Math.floor(qty);
    if (!(qty > 0)) { res.msg = 'הסטופ רחוק מדי לתקציב הסיכון: הכמות יוצאת 0'; return res; }
    var unitVal = s.type === 'future' ? (+s.pv || 1) : s.type === 'option' ? (+s.mult || 100) : 1;
    var notional = qty * e * unitVal, risk = qty * perUnit + feeUsd(qty), lev = Math.max(1, +s.lev || 1);
    var margin = (s.type === 'crypto' || s.type === 'future') ? notional / lev : notional;
    var tgt = [s.r1, s.r2, s.r3].map(function (R) {
      R = +R; if (!(R > 0)) return null;
      var p = long ? e + R * dist : e - R * dist, gross = qty * Math.abs(p - e) * unitVal;
      return { r: R, price: p, profit: gross - feeUsd(qty), pct: acct > 0 ? (gross - feeUsd(qty)) / acct * 100 : null, be: 1 / (1 + R) * 100 };
    }).filter(Boolean);
    var liq = null;
    if (lev > 1 && (s.type === 'crypto' || s.type === 'future')) liq = long ? e * (1 - 1 / lev + 0.005) : e * (1 + 1 / lev - 0.005);
    var atr = +s.atr || 0, stopAtr = atr > 0 ? dist / atr : null;
    if (tgt[0] && tgt[0].r < 2) w.push({ t: 'bad', m: 'יחס סיכון-סיכוי ליעד הראשון מתחת ל-1:2, מתחת למינימום שהגדרת' });
    if (acct > 0 && notional / acct * 100 > 100 && lev === 1) w.push({ t: 'warn', m: 'שווי הפוזיציה גדול מההון: צריך מינוף או הקטנת גודל' });
    else if (acct > 0 && notional / acct * 100 > 30 && lev === 1) w.push({ t: 'warn', m: 'פוזיציה גדולה: ' + num(notional / acct * 100, 0) + '% מההון בנכס אחד' });
    if (s.riskBy === 'pct' && +s.riskPct > 2) w.push({ t: 'warn', m: 'סיכון של מעל 2% לעסקה. סדרת הפסדים קצרה תפגע בתיק' });
    if (stopAtr != null && stopAtr < 0.5) w.push({ t: 'warn', m: 'סטופ צפוף מדי (' + num(stopAtr, 2) + ' ATR): סיכון גבוה להיפגע מרעש' });
    if (stopAtr != null && stopAtr > 3) w.push({ t: 'warn', m: 'סטופ רחוק (' + num(stopAtr, 1) + ' ATR): הכמות קטנה, בדוק שהסטופ באמת מבני' });
    if (liq != null && ((long && liq >= st) || (!long && liq <= st))) w.push({ t: 'bad', m: 'המחיר לחיסול (הערכה ' + num(liq, 2) + ') קרוב יותר מהסטופ. הנכס יחוסל לפני שהסטופ יפעל. הנמך מינוף' });
    if (!w.length) w.push({ t: 'ok', m: 'כל בדיקות הסיכון עברו' });
    return { ok: true, w: w, long: long, qty: qty, risk: risk, riskPct: acct > 0 ? risk / acct * 100 : null, notional: notional, notionalPct: acct > 0 ? notional / acct * 100 : null, margin: margin, tgt: tgt, liq: liq, dist: dist, distPct: dist / e * 100, stopAtr: stopAtr, e: e, st: st, unitName: s.type === 'future' ? 'חוזים' : s.type === 'option' ? 'חוזי אופציה' : s.type === 'crypto' ? 'יחידות' : 'מניות' };
  }

  function field(id, label, type, extra) { return '<label class="rc-f"><span>' + label + '</span><input id="' + id + '" type="' + (type || 'number') + '" inputmode="decimal" step="any" ' + (extra || '') + '></label>'; }
  function build() {
    if ($q('#p-calc')) return;
    var sec = document.createElement('section'); sec.className = 'page'; sec.id = 'p-calc';
    sec.innerHTML = '<div class="dp-card rc-card"><h3>מחשבון ניהול סיכונים <small>הכמות נגזרת מהסיכון, לא מהתחושה</small></h3>' +
      '<div class="dp-seg" id="rcType">' + Object.keys(TYPES).map(function (k) { return '<button data-t="' + k + '">' + TYPES[k] + '</button>'; }).join('') + '</div>' +
      '<div class="rc-grid">' + field('rcSym', 'סימול (לא חובה)', 'text', 'autocapitalize="characters"') + field('rcAcct', 'גודל תיק ($)') +
      '<div class="rc-f"><span>סיכון לעסקה</span><div class="rc-risk"><input id="rcRiskV" type="number" inputmode="decimal" step="any"><div class="dp-seg" id="rcBy"><button data-b="pct">%</button><button data-b="usd">$</button></div></div></div>' +
      field('rcEntry', 'מחיר כניסה') + field('rcStop', 'סטופ לוס') + field('rcAtr', 'ATR (לא חובה)') +
      '<div class="rc-f" id="rcAtrBtnW"><span>סטופ לפי ATR</span><div class="rc-risk"><input id="rcAtrM" type="number" inputmode="decimal" step="0.1" placeholder="מכפיל"><button class="btn ghost small" id="rcAtrGo">חשב סטופ</button></div></div>' +
      field('rcR1', 'יעד 1 (R)') + field('rcR2', 'יעד 2 (R)') + field('rcR3', 'יעד 3 (R)') + field('rcFee', 'עמלה לכל צד (%)') +
      '<div id="rcLevW">' + field('rcLev', 'מינוף (x)') + '</div><div id="rcPvW">' + field('rcPv', 'ערך נקודה ($)') + '</div><div id="rcMultW">' + field('rcMult', 'מכפיל חוזה') + '</div></div></div>' +
      '<div id="rcOut"></div>';
    document.querySelector('main').appendChild(sec);
    var bind = function (id, key, num_) { var el = $q('#' + id); el.oninput = function () { ST[key] = num_ ? (el.value === '' ? '' : +el.value) : el.value; update(); }; };
    bind('rcSym', 'sym'); bind('rcAcct', 'acct', 1); bind('rcEntry', 'entry', 1); bind('rcStop', 'stop', 1); bind('rcAtr', 'atr', 1); bind('rcR1', 'r1', 1); bind('rcR2', 'r2', 1); bind('rcR3', 'r3', 1); bind('rcFee', 'fee', 1); bind('rcLev', 'lev', 1); bind('rcPv', 'pv', 1); bind('rcMult', 'mult', 1);
    $q('#rcRiskV').oninput = function () { var v = $q('#rcRiskV').value === '' ? '' : +$q('#rcRiskV').value; if (ST.riskBy === 'pct') ST.riskPct = v; else ST.riskUsd = v; update(); };
    $q('#rcType').querySelectorAll('button').forEach(function (b) { b.onclick = function () { ST.type = b.dataset.t; if (ST.type === 'stock' || ST.type === 'option') ST.lev = 1; sync(); update(); }; });
    $q('#rcBy').querySelectorAll('button').forEach(function (b) { b.onclick = function () { ST.riskBy = b.dataset.b; sync(); update(); }; });
    $q('#rcAtrGo').onclick = function () {
      var a = +ST.atr, m = +$q('#rcAtrM').value || ST.atrMult, e = +ST.entry; ST.atrMult = m;
      if (!(a > 0) || !(e > 0)) return toast('הזן כניסה ו-ATR');
      var long = ST.long !== false; ST.stop = +(long ? e - a * m : e + a * m).toFixed(4); sync(); update();
    };
    sync(); update();
  }
  function sync() {
    $q('#rcSym').value = ST.sym || ''; $q('#rcAcct').value = ST.acct || (typeof S !== 'undefined' && S.acct) || ''; if (!ST.acct && typeof S !== 'undefined' && S.acct) ST.acct = S.acct;
    $q('#rcRiskV').value = ST.riskBy === 'pct' ? ST.riskPct : ST.riskUsd; $q('#rcEntry').value = ST.entry; $q('#rcStop').value = ST.stop; $q('#rcAtr').value = ST.atr; $q('#rcAtrM').value = ST.atrMult;
    $q('#rcR1').value = ST.r1; $q('#rcR2').value = ST.r2; $q('#rcR3').value = ST.r3; $q('#rcFee').value = ST.fee; $q('#rcLev').value = ST.lev; $q('#rcPv').value = ST.pv; $q('#rcMult').value = ST.mult;
    $q('#rcType').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === ST.type); });
    $q('#rcBy').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.b === ST.riskBy); });
    $q('#rcLevW').style.display = ST.type === 'crypto' || ST.type === 'future' ? '' : 'none'; $q('#rcPvW').style.display = ST.type === 'future' ? '' : 'none'; $q('#rcMultW').style.display = ST.type === 'option' ? '' : 'none';
  }
  function tile(k, v, cls, sub) { return '<div class="dp-tile ' + (cls || '') + '"><span>' + k + '</span><b>' + v + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; }
  function update() {
    try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) { }
    var out = $q('#rcOut'); if (!out) return;
    var r = OUT = calc();
    if (!r.ok) { out.innerHTML = '<div class="dp-card"><div class="dp-empty">' + esc(r.msg) + '</div></div>'; return; }
    ST.long = r.long;
    var tg = r.tgt.map(function (t, i) { return tile('יעד ' + (i + 1) + ' · ' + t.r + 'R', '$' + num(t.price, t.price < 10 ? 4 : 2), 'pos', '+$' + num(t.profit, 0) + (t.pct != null ? ' · ' + num(t.pct, 2) + '% מהתיק' : '') + ' · איזון ב-' + num(t.be, 0) + '% הצלחה'); }).join('');
    var warns = r.w.map(function (x) { return '<li class="' + (x.t === 'ok' ? 'ok' : x.t === 'bad' ? 'no' : 'un') + '"><i>' + (x.t === 'ok' ? '✓' : x.t === 'bad' ? '✕' : '!') + '</i><div>' + esc(x.m) + '</div></li>'; }).join('');
    out.innerHTML = '<div class="dp-card dp-plan ' + (r.long ? 'long' : 'short') + '"><h3>תוצאה · ' + (r.long ? 'לונג' : 'שורט') + (ST.sym ? ' · ' + esc(String(ST.sym).toUpperCase()) : '') + '<small>סטופ ' + num(r.distPct, 2) + '% מהכניסה' + (r.stopAtr != null ? ' · ' + num(r.stopAtr, 2) + ' ATR' : '') + '</small></h3>' +
      '<div class="dp-tiles">' + tile('כמות', num(r.qty, ST.type === 'crypto' ? 4 : 0) + ' ' + r.unitName, 'big') + tile('סיכון בפועל', '$' + num(r.risk, 0), 'neg', r.riskPct != null ? num(r.riskPct, 2) + '% מהתיק' : '') +
      tile('שווי פוזיציה', '$' + num(r.notional, 0), '', r.notionalPct != null ? num(r.notionalPct, 0) + '% מהתיק' : '') + (r.margin !== r.notional ? tile('מרווח נדרש', '$' + num(r.margin, 0), '', 'מינוף ' + ST.lev + 'x') : tile('סטופ', '$' + num(r.st, r.st < 10 ? 4 : 2), 'neg')) +
      tg + (r.liq != null ? tile('מחיר חיסול (הערכה)', '$' + num(r.liq, 2), 'neg', 'בהנחת מרווח אחזקה 0.5%') : '') + '</div>' +
      '<ul class="dp-gates" style="margin-top:12px">' + warns + '</ul>' +
      '<div class="dp-actions"><button class="btn" id="rcSave">📓 שמור ליומן כעסקה מתוכננת</button><button class="btn ghost" id="rcCopy">⎘ העתק</button><button class="btn ghost" id="rcDeep">🧠 נתח את הנכס</button></div></div>';
    $q('#rcSave').onclick = save_; $q('#rcCopy').onclick = copy_; $q('#rcDeep').onclick = function () { if (!ST.sym) return toast('הזן סימול'); openDeep(String(ST.sym).toUpperCase()); };
  }
  function text() { var r = OUT, s = String(ST.sym || '').toUpperCase(); return (s ? s + ' · ' : '') + (r.long ? 'לונג' : 'שורט') + '\nכניסה ' + num(r.e, 2) + ' · סטופ ' + num(r.st, 2) + '\n' + r.tgt.map(function (t, i) { return 'יעד ' + (i + 1) + ' (' + t.r + 'R): ' + num(t.price, 2); }).join('\n') + '\nכמות ' + num(r.qty, 4) + ' ' + r.unitName + ' · סיכון $' + num(r.risk, 0); }
  function copy_() { if (!OUT || !OUT.ok) return; (navigator.clipboard ? navigator.clipboard.writeText(text()) : Promise.reject()).then(function () { toast('הועתק'); }).catch(function () { toast('לא ניתן להעתיק'); }); }
  async function save_() {
    var r = OUT; if (!r || !r.ok) return;
    var tk = String(ST.sym || '').toUpperCase().replace('/USD', ''); if (!tk) return toast('הזן סימול כדי לשמור ביומן');
    var dir = r.long ? 'long' : 'short', tp = r.tgt.map(function (t) { return t.price; });
    var tr = { id: 't' + Date.now(), mode: MODE, ticker: tk, dir: dir, status: 'planned', created: Date.now(), assetType: ST.type,
      plan: { entry: r.e, stop: r.st, tp: tp, condition: 'מחשבון סיכון', reasons: [], pattern: '', bias: '', invalidation: (r.long ? 'סגירה מתחת ל-' : 'סגירה מעל ') + r.st, analysts: null, news_context: null },
      sizing: { entry: r.e, stop: r.st, qty: r.qty, risk: Math.round(r.risk), riskPct: r.riskPct || 0, pos: Math.round(r.notional) }, imgs: { chart: null }, qty: r.qty, entryPrice: null, log: [{ t: Date.now(), type: 'מחשבון', note: text() }] };
    D.trades.push(tr);
    var pl = D.plans.find(function (x) { return x.ticker === tk; });
    if (!pl) { pl = { id: tk.toLowerCase() + Date.now(), ticker: tk, cls: '', checks: [['סטופ מוגדר לפני כניסה', true], ['גודל פוזיציה חושב לפי סיכון', true]] }; D.plans.push(pl); }
    Object.assign(pl, { status: (r.long ? 'לונג' : 'שורט') + ' – מתוכנן', qty: r.qty, entry: r.e, stop: r.st, tp1: tp[0] || 0, tp2: tp[1] || 0, tp3: tp[2] || 0, rules: 'נוצר במחשבון הסיכון\nביטול: ' + tr.plan.invalidation });
    await save(); renderPlans(); renderTrades(); goPage('p-journal'); onEnter('p-journal'); showSub('trades'); toast('נשמר ביומן כעסקה מתוכננת');
  }
  window.openCalc = function (o) {
    build(); o = o || {};
    if (o.sym != null) ST.sym = o.sym; if (o.entry != null) ST.entry = +(+o.entry).toFixed(4); if (o.stop != null) ST.stop = +(+o.stop).toFixed(4);
    if (o.atr != null) ST.atr = +(+o.atr).toFixed(4); if (o.type) ST.type = o.type;
    if (o.risk > 0) { ST.riskBy = 'usd'; ST.riskUsd = o.risk; }
    goPage('p-calc'); onEnter('p-calc'); sync(); update();
  };
  GROUPS.trade.splice(2, 0, ['p-calc', 'מחשבון']); PAGE_GROUP['p-calc'] = 'trade';
  var _e = onEnter; onEnter = function (id) { _e(id); if (id === 'p-calc') { build(); sync(); update(); } };
  build();
  window.__risk = { calc: calc, state: ST, setState: function (o) { Object.assign(ST, o); if ($q('#rcAcct')) { sync(); update(); } } };
})();
