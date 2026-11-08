/* מודול 2: כרטיס ביצועים ליומן.
   מוסיף מעל הסטטיסטיקה הקיימת: Profit Factor, תוחלת ב-$ וב-R, אחוז הצלחה, יחס רווח להפסד, סדרות,
   ירידה מקסימלית, זמן החזקה ממוצע, פילוח לפי תקופה וטבלה שבועית. נשען על closedTrades() הקיים. */
(function () {
  'use strict';
  var PERIOD = 'all', DAY = 864e5;
  var $q = function (s) { return document.querySelector(s); };
  var num = function (n, d) { return n == null || !isFinite(n) ? '–' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); };
  var usd = function (n) { return (n >= 0 ? '+' : '−') + '$' + num(Math.abs(n), 0); };
  var PERIODS = { day: 'היום', week: '7 ימים', month: '30 יום', q: '90 יום', all: 'הכל' };

  function since(p) {
    var now = new Date(), d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return p === 'day' ? d0 : p === 'week' ? Date.now() - 7 * DAY : p === 'month' ? Date.now() - 30 * DAY : p === 'q' ? Date.now() - 90 * DAY : 0;
  }
  function stats(C) {
    var n = C.length; if (!n) return null;
    var W = C.filter(function (c) { return c.pnl > 0; }), L = C.filter(function (c) { return c.pnl <= 0; });
    var gw = W.reduce(function (a, c) { return a + c.pnl; }, 0), gl = L.reduce(function (a, c) { return a + c.pnl; }, 0);
    var wr = W.length / n, aw = W.length ? gw / W.length : 0, al = L.length ? gl / L.length : 0;
    var cum = 0, peak = 0, dd = 0; C.forEach(function (c) { cum += c.pnl; peak = Math.max(peak, cum); dd = Math.min(dd, cum - peak); });
    var R = C.filter(function (c) { return c.risk > 0; }).map(function (c) { return c.pnl / c.risk; });
    var avgR = R.length ? R.reduce(function (a, b) { return a + b; }, 0) / R.length : null;
    var mw = 0, ml = 0, cw = 0, cl = 0; C.forEach(function (c) { if (c.pnl > 0) { cw++; cl = 0; } else { cl++; cw = 0; } mw = Math.max(mw, cw); ml = Math.max(ml, cl); });
    var last = C[C.length - 1], cur = 0; for (var i = C.length - 1; i >= 0; i--) { if ((C[i].pnl > 0) === (last.pnl > 0)) cur++; else break; }
    var holds = C.filter(function (c) { return c.tin && c.t && c.t > c.tin; }).map(function (c) { return (c.t - c.tin) / 60000; });
    return { n: n, wins: W.length, wr: wr, pf: gl < 0 ? gw / Math.abs(gl) : (gw > 0 ? Infinity : 0), aw: aw, al: al, payoff: al ? Math.abs(aw / al) : null, exp: wr * aw + (1 - wr) * al, avgR: avgR, rN: R.length,
      expR: avgR, net: gw + gl, dd: dd, best: Math.max.apply(null, C.map(function (c) { return c.pnl; })), worst: Math.min.apply(null, C.map(function (c) { return c.pnl; })), mw: mw, ml: ml, cur: cur, curWin: last.pnl > 0, hold: holds.length ? holds.reduce(function (a, b) { return a + b; }, 0) / holds.length : null };
  }
  function holdTxt(m) { return m == null ? '–' : m < 90 ? Math.round(m) + ' דק\'' : m < 2880 ? num(m / 60, 1) + ' שעות' : num(m / 1440, 1) + ' ימים'; }
  function verdict(s) {
    if (s.n < 20) return ['wait', 'מדגם קטן (' + s.n + ' עסקאות). אל תסיק מסקנות לפני 30 עסקאות לפחות.'];
    if (s.exp > 0 && s.pf >= 1.5) return ['ok', 'שיטה רווחית: תוחלת חיובית ו-Profit Factor מעל 1.5. שמור על אותם כללים ואל תגדיל סיכון בבת אחת.'];
    if (s.exp > 0) return ['wait', 'גבולי: התוחלת חיובית אבל Profit Factor נמוך מ-1.5. מרווח הביטחון קטן, הפחת עמלות והפסדים גדולים.'];
    return ['no', 'המערכת מפסידה בממוצע. הפתרון הוא כמעט תמיד גודל ההפסד הממוצע וכיבוד סטופים, לא מציאת כניסות חדשות.'];
  }
  function tile(k, v, cls, sub) { return '<div class="dp-tile ' + (cls || '') + '"><span>' + k + '</span><b>' + v + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; }
  function weekly(C) {
    var G = {}, key = function (t) { var d = new Date(t), day = (d.getDay() + 6) % 7; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day); return d.getTime(); };
    C.forEach(function (c) { var k = key(c.t); G[k] = G[k] || { p: 0, n: 0, w: 0 }; G[k].p += c.pnl; G[k].n++; if (c.pnl > 0) G[k].w++; });
    var ks = Object.keys(G).sort(function (a, b) { return b - a; }).slice(0, 8);
    if (!ks.length) return '';
    return '<div class="mx-wk"><b>שבועות אחרונים</b>' + ks.map(function (k) { var g = G[k]; return '<div><span>' + new Date(+k).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) + '</span><em>' + g.n + ' עסקאות · ' + Math.round(g.w / g.n * 100) + '%</em><b class="' + (g.p >= 0 ? 'up' : 'down') + '">' + usd(g.p) + '</b></div>'; }).join('') + '</div>';
  }
  function render() {
    var anchor = $q('#statsBox'); if (!anchor) return;
    var card = anchor.closest('.card'), box = $q('#kpiBox');
    if (!box) { box = document.createElement('div'); box.id = 'kpiBox'; card.parentNode.insertBefore(box, card); }
    var all = []; try { all = closedTrades(); } catch (e) { }
    var lim = since(PERIOD), C = all.filter(function (c) { return (c.t || 0) >= lim; }), s = stats(C);
    var chips = '<div class="tabs" id="kpiTabs" style="margin:0 0 10px">' + Object.keys(PERIODS).map(function (k) { return '<button data-p="' + k + '" class="' + (k === PERIOD ? 'on' : '') + '">' + PERIODS[k] + '</button>'; }).join('') + '</div>';
    var body;
    if (!s) body = '<div class="dp-empty">אין עסקאות סגורות בתקופה הזו.</div>';
    else {
      var v = verdict(s), pf = s.pf === Infinity ? '∞' : num(s.pf, 2);
      body = '<div class="dp-tiles mx-tiles">' + tile('רווח נקי', usd(s.net), s.net >= 0 ? 'pos' : 'neg', s.n + ' עסקאות') + tile('אחוז הצלחה', num(s.wr * 100, 0) + '%', '', s.wins + ' מתוך ' + s.n) +
        tile('גורם רווח', pf, s.pf >= 1.5 ? 'pos' : s.pf >= 1 ? '' : 'neg', 'סך רווחים ÷ סך הפסדים') + tile('תוחלת לעסקה', usd(s.exp), s.exp >= 0 ? 'pos' : 'neg', s.expR != null ? num(s.expR, 2) + 'R ממוצע (' + s.rN + ' עסקאות עם סיכון)' : 'אין נתוני R') +
        tile('רווח ממוצע', usd(s.aw), 'pos') + tile('הפסד ממוצע', usd(s.al), 'neg', s.payoff != null ? 'יחס ' + num(s.payoff, 2) + ':1' : '') + tile('ירידה מקסימלית', usd(s.dd), 'neg') +
        tile('סדרה נוכחית', s.cur + (s.curWin ? ' רווחים' : ' הפסדים'), s.curWin ? 'pos' : 'neg', 'שיא: ' + s.mw + ' רווחים · ' + s.ml + ' הפסדים') + tile('עסקה הכי טובה', usd(s.best), 'pos') + tile('עסקה הכי גרועה', usd(s.worst), 'neg') + tile('זמן החזקה ממוצע', holdTxt(s.hold)) + '</div>' +
        '<ul class="dp-gates" style="margin-top:10px"><li class="' + (v[0] === 'ok' ? 'ok' : v[0] === 'no' ? 'no' : 'un') + '"><i>' + (v[0] === 'ok' ? '✓' : v[0] === 'no' ? '✕' : '!') + '</i><div>' + v[1] + '</div></li></ul>' + weekly(C);
    }
    box.innerHTML = '<div class="dp-card"><h3>ביצועים</h3>' + chips + body + '</div>';
    box.querySelectorAll('#kpiTabs button').forEach(function (b) { b.onclick = function () { PERIOD = b.dataset.p; render(); }; });
  }
  var _rs = renderStats;
  renderStats = function () { _rs(); try { render(); } catch (e) { console.warn('kpi', e); } };
  window.__metrics = { stats: stats, render: render };
})();
