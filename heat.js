/* חום תיק: סך הסיכון הפתוח מול תקרה (ברירת מחדל 6% מההון), תקרה לקבוצה מתואמת (3%),
   ותקרת הפסד חודשי (עצירה ב-6%). לפי כללי הסיכון הנפוצים: 2% לעסקה, 6% סך הכול, נכסים מתואמים נספרים כאחד. */
(function () {
  'use strict';
  var $q = function (s) { return document.querySelector(s); };
  var num = function (n, d) { return n == null || !isFinite(n) ? '–' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var cap = function () { return { total: +S.heatTotal > 0 ? +S.heatTotal : 6, group: +S.heatGroup > 0 ? +S.heatGroup : 3, month: +S.heatMonth > 0 ? +S.heatMonth : 6 }; };

  function tradeRisk(t) {
    var q = +t.qty || 0, ep = +t.entryPrice || 0, st = t.plan && +t.plan.stop;
    if (t.status === 'open' && q > 0 && ep > 0 && st > 0) { var d = t.dir === 'short' ? st - ep : ep - st; return d > 0 ? d * q : 0; } /* סטופ שכבר מעל הכניסה = סיכון 0 */
    return (t.sizing && +t.sizing.risk) || 0;
  }
  function compute() {
    var acct = +S.acct || 0, open = [], planned = [];
    (D.trades || []).forEach(function (t) { if ((t.mode || 'live') !== MODE) return; if (t.status === 'open') open.push(t); else if (t.status === 'planned') planned.push(t); });
    var groups = {}, tot = 0;
    open.forEach(function (t) { var r = tradeRisk(t), g = AT.groupOf(t.ticker); tot += r; groups[g] = groups[g] || { risk: 0, n: 0, tk: [] }; groups[g].risk += r; groups[g].n++; groups[g].tk.push(t.ticker); });
    var plannedRisk = planned.reduce(function (a, t) { return a + tradeRisk(t); }, 0);
    var from = new Date(); from.setDate(1); from.setHours(0, 0, 0, 0);
    var mp = 0; try { closedTrades().forEach(function (c) { if ((c.t || 0) >= from.getTime()) mp += c.pnl; }); } catch (e) { }
    return { acct: acct, open: open, planned: planned, tot: tot, plannedRisk: plannedRisk, groups: groups, month: mp };
  }
  function meter(pct, limit) {
    var w = Math.min(100, pct / (limit * 1.25) * 100), col = pct > limit ? 'var(--down)' : pct > limit * 0.6 ? 'var(--btc)' : 'var(--up)';
    return '<div class="ht-m"><i style="width:' + w + '%;background:' + col + '"></i><u style="right:' + (100 - limit / (limit * 1.25) * 100) + '%"></u></div>';
  }
  function render() {
    if (!D) return;
    var host = $q('#heatBox'); if (!host) { var t = $q('#p-port .today'); if (!t) return; host = document.createElement('div'); host.id = 'heatBox'; t.insertBefore(host, t.firstChild); }
    var c = compute(), L = cap();
    if (!(c.acct > 0)) { host.innerHTML = '<div class="dp-card"><h3>חום תיק</h3><div class="dp-empty">הגדר "גודל תיק" בהגדרות (⚙️) כדי לראות כמה מהתיק בסיכון.</div></div>'; return; }
    var heat = c.tot / c.acct * 100, withPlanned = (c.tot + c.plannedRisk) / c.acct * 100, mPct = c.month / c.acct * 100;
    var gKeys = Object.keys(c.groups).sort(function (a, b) { return c.groups[b].risk - c.groups[a].risk; });
    var w = [];
    if (heat > L.total) w.push(['no', 'סך הסיכון הפתוח (' + num(heat) + '%) מעל התקרה (' + L.total + '%). לא פותחים עסקאות חדשות עד שמצמצמים.']);
    else if (withPlanned > L.total) w.push(['un', 'אם כל העסקאות המתוכננות ימולאו, החום יגיע ל-' + num(withPlanned) + '%, מעל התקרה.']);
    gKeys.forEach(function (g) { var gp = c.groups[g].risk / c.acct * 100; if (gp > L.group && c.groups[g].n > 1) w.push(['no', 'קבוצה מתואמת "' + g + '" (' + c.groups[g].tk.join(', ') + '): ' + num(gp) + '% סיכון, מעל ' + L.group + '%. הנכסים האלה זזים יחד, זו הימור אחד גדול.']); });
    if (mPct <= -L.month) w.push(['no', 'הפסד חודשי של ' + num(Math.abs(mPct)) + '%. לפי הכלל, עוצרים לשאר החודש ובודקים מה השתבש.']);
    else if (mPct <= -L.month * 0.66) w.push(['un', 'הפסד חודשי של ' + num(Math.abs(mPct)) + '%, מתקרב לתקרת ' + L.month + '%. הקטן גודל.']);
    if (!w.length) w.push(['ok', c.open.length ? 'החום בגבולות. אפשר לפתוח עסקה בגודל רגיל.' : 'אין פוזיציות פתוחות. התיק מוכן לעסקה הבאה.']);
    var rows = gKeys.map(function (g) { var gp = c.groups[g].risk / c.acct * 100; return '<div class="ht-r"><span>' + esc(g) + (c.groups[g].n > 1 ? ' <small>(' + c.groups[g].tk.join(', ') + ')</small>' : '') + '</span><b class="' + (gp > L.group ? 'down' : '') + '">$' + num(c.groups[g].risk, 0) + ' · ' + num(gp) + '%</b></div>'; }).join('');
    host.innerHTML = '<div class="dp-card"><h3>חום תיק <small>סיכון פתוח ומשמעת</small></h3>' +
      '<div class="dp-tiles"><div class="dp-tile ' + (heat > L.total ? 'neg' : 'big') + '"><span>סיכון פתוח כולל</span><b>' + num(heat) + '%</b><small>$' + num(c.tot, 0) + ' · תקרה ' + L.total + '%</small></div>' +
      '<div class="dp-tile"><span>פוזיציות פתוחות</span><b>' + c.open.length + '</b><small>' + c.planned.length + ' מתוכננות (+$' + num(c.plannedRisk, 0) + ')</small></div>' +
      '<div class="dp-tile ' + (mPct < 0 ? 'neg' : 'pos') + '"><span>רווח/הפסד החודש</span><b>' + (c.month >= 0 ? '+' : '−') + '$' + num(Math.abs(c.month), 0) + '</b><small>' + num(mPct) + '% מהתיק · עצירה ב-' + L.month + '%</small></div></div>' +
      '<div class="ht-l"><span>חום תיק</span>' + meter(heat, L.total) + '</div>' + (c.plannedRisk > 0 ? '<div class="ht-l"><span>כולל מתוכננות</span>' + meter(withPlanned, L.total) + '</div>' : '') +
      (mPct < 0 ? '<div class="ht-l"><span>הפסד חודשי</span>' + meter(Math.abs(mPct), L.month) + '</div>' : '') +
      (rows ? '<div class="ht-rows"><b>לפי קבוצה מתואמת</b>' + rows + '</div>' : '') +
      '<ul class="dp-gates" style="margin-top:10px">' + w.map(function (x) { return '<li class="' + x[0] + '"><i>' + (x[0] === 'ok' ? '✓' : x[0] === 'no' ? '✕' : '!') + '</i><div>' + x[1] + '</div></li>'; }).join('') + '</ul>' +
      '<details class="ht-set"><summary>הגדרת תקרות</summary><div class="rc-grid"><label class="rc-f"><span>תקרת סיכון כולל (%)</span><input id="htT" type="number" step="0.5" value="' + L.total + '"></label><label class="rc-f"><span>תקרה לקבוצה מתואמת (%)</span><input id="htG" type="number" step="0.5" value="' + L.group + '"></label><label class="rc-f"><span>עצירה חודשית (%)</span><input id="htM" type="number" step="0.5" value="' + L.month + '"></label><label class="rc-f"><span>מינוף מקסימלי (1 = בלי)</span><input id="htL" type="number" step="0.5" min="1" value="' + (+S.maxLev > 0 ? +S.maxLev : 1) + '"></label></div>' +
      '<div class="dp-foot" style="text-align:right;margin-top:8px">המקובל: 2% לעסקה ו-6% סך הכול (Alexander Elder), ונכסים מתואמים נספרים כאחד עם תקרה של 2 עד 3%. אלה כללי אצבע ולא תקנות, ומקורות חלוקים לגבי המספרים.</div></details></div>';
    ['htT:heatTotal', 'htG:heatGroup', 'htM:heatMonth', 'htL:maxLev'].forEach(function (p) { var a = p.split(':'), el = $q('#' + a[0]); if (el) el.onchange = function () { S[a[1]] = +el.value || 0; saveS(); render(); }; });
  }
  var _rt = renderToday; renderToday = async function () { await _rt.apply(this, arguments); try { render(); } catch (e) { console.warn('heat', e); } };
  var _tr = renderTrades; renderTrades = function () { _tr.apply(this, arguments); try { render(); } catch (e) { } };
  window.__heat = { compute: compute, render: render, tradeRisk: tradeRisk, cap: cap };
})();
