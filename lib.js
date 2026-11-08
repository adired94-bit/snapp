/* ניתוחי מניות: כל "שקלול" נשמר עם הכיוון, הכניסה, הסטופ והיעדים, והגרף. מעקב אוטומטי בודק מול נרות אמיתיים
   מה קרה אחר כך (נכנס? פגע ביעד? נעצר?), האם התנועה היומית תאמה את הכיוון, ובסוף כל יום מסחר שולח סיכום.
   כך אפשר לדעת כמה טוב הניתוח של האתר, לפי נתונים ולא לפי הרגשה. המעקב רץ כשהאתר פתוח. */
(function () {
  'use strict';
  var DP = window.__deep, $q = function (s) { return document.querySelector(s); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var num = function (n, d) { return n == null || !isFinite(n) ? '–' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); };
  var HZ = [['day', 'יומי', 1], ['swing', 'סווינג', 10], ['long', 'ארוך', 60]];
  var ST = { filter: '', open: {}, busy: false };
  function fh(path) { var c = DP.getClient(); return c._json(c.fhBase + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(S.fh), c.fhLimiter); }

  /* ---------- זמן בורסה ---------- */
  function et(ts) {
    var f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }), p = {};
    f.formatToParts(new Date(ts)).forEach(function (x) { p[x.type] = x.value; });
    return { d: p.year + '-' + p.month + '-' + p.day, m: (+p.hour % 24) * 60 + +p.minute, wk: p.weekday === 'Sat' || p.weekday === 'Sun' };
  }
  function nextDay(d) { var t = Date.parse(d + 'T00:00:00Z'); do { t += 864e5; } while ([0, 6].indexOf(new Date(t).getUTCDay()) >= 0); return new Date(t).toISOString().slice(0, 10); }
  var barDate = function (t) { return new Date(t).toISOString().slice(0, 10); };
  /* ממתי הנרות נספרים: אחרי הסגירה או בסוף שבוע מתחילים מיום המסחר הבא, באמצע מסחר מתחילים מהיום (והכניסה נחשבת כבוצעה) */
  function startInfo(at) { var e = et(at); if (e.wk || e.m >= 16 * 60) return { start: nextDay(e.wk ? e.d : e.d), intraday: false }; if (e.m < 9 * 60 + 30) return { start: e.d, intraday: false }; return { start: e.d, intraday: true }; }
  function completed(b, now) { var e = et(now), d = barDate(b.t); return d < e.d || (d === e.d && (e.wk || e.m >= 16 * 60 + 15)); }

  /* ---------- בדיקת תוכנית מול נרות: סטופ לפני יעד כשהכול באותו נר (שמרני) ---------- */
  function evalPlan(p, bars, expiry, fillFirst) {
    if (!p || !(Math.abs(p.entry - p.stop) > 0)) return { st: 'na', done: true };
    var long = p.dir === 'long', sg = long ? 1 : -1, risk = Math.abs(p.entry - p.stop), filled = false, h1 = false, h2 = false, stopped = false, last = null, n = 0;
    for (var i = 0; i < bars.length && i < expiry; i++) {
      var b = bars[i]; n = i + 1; last = b;
      if (!filled) { if ((i === 0 && fillFirst) || (b.l <= p.entry && p.entry <= b.h)) filled = true; else continue; }
      var sH = long ? b.l <= p.stop : b.h >= p.stop, t1 = long ? b.h >= p.t1 : b.l <= p.t1, t2 = long ? b.h >= p.t2 : b.l <= p.t2;
      if (!h1) { if (sH) { stopped = true; break; } if (t1) h1 = true; }
      if (h1 && t2) { h2 = true; break; }
    }
    var over = bars.length >= expiry, R = function (px) { return ((px - p.entry) * sg) / risk; };
    if (!filled) return { st: over ? 'noentry' : 'wait', r: 0, done: over, n: n };
    if (stopped) return { st: 'stop', r: -1, done: true, n: n };
    if (h2) return { st: 't2', r: R(p.t2), done: true, n: n };
    if (h1) return { st: 't1', r: R(p.t1), done: over, n: n };
    return { st: over ? 'expired' : 'open', r: last ? R(last.c) : 0, done: over, n: n };
  }
  var STT = { wait: 'ממתין לכניסה', noentry: 'לא נכנס', open: 'פתוח', stop: 'נעצר בסטופ', t1: 'פגע ביעד 1', t2: 'פגע ביעד 2', expired: 'הסתיים בלי יעד', na: '–' };
  var GOOD = { t1: 1, t2: 1 }, BAD = { stop: 1 };

  /* ---------- שמירת ניתוח ---------- */
  function saveAnalysis(res) {
    var plans = {}, verdict = {}, bars = (res.bars && res.bars['1D'] || []).slice(-90).map(function (b) { return [b.t, +b.o.toFixed(2), +b.h.toFixed(2), +b.l.toFixed(2), +b.c.toFixed(2)]; });
    ['day', 'swing', 'long'].forEach(function (k) {
      var m = res.modes[k], u = m.uni, v = DP.verdictOf(m); verdict[k] = { stance: v.stance, score: v.score, entry: v.entry, headline: v.headline };
      plans[k] = m.plan ? { dir: m.plan.dir, entry: m.plan.entry, stop: m.plan.stop, t1: m.plan.t1, t2: m.plan.t2, qty: m.plan.qty || 0, strong: v.stance === 'long' || v.stance === 'short' } : null;
    });
    var u = res.modes.swing.uni, now = Date.now(), si = startInfo(now);
    var rec = { id: res.sym + '-' + now, sym: res.sym, name: (res.fund && res.fund.profile && res.fund.profile.name) || '', at: now, start: si.start, intraday: si.intraday, px: res.price, plans: plans, verdict: verdict, parts: u ? u.parts.map(function (p) { return { k: p.label, v: p.v }; }) : [], bars: bars, after: [], status: {}, daily: [], lastCheck: 0, final: false };
    D.lib = D.lib || []; D.lib = D.lib.filter(function (r) { return !(r.sym === res.sym && now - r.at < 30 * 60e3); }); D.lib.push(rec);
    if (D.lib.length > 150) D.lib = D.lib.slice(-150);
    save(); toast('נשמר בניתוחי מניות. בסוף יום המסחר תקבל בדיקה אם הניתוח היה נכון'); paint(); setTimeout(function () { track(true, rec.id); }, 3000); return rec;
  }

  /* ---------- מעקב אוטומטי ---------- */
  function apply(rec, series, now) {
    var after = series.filter(function (b) { return barDate(b.t) >= rec.start && completed(b, now); }).map(function (b) { return [b.t, b.o, b.h, b.l, b.c]; });
    rec.after = after.slice(0, 70); var objs = rec.after.map(function (a) { return { t: a[0], o: a[1], h: a[2], l: a[3], c: a[4] }; }), done = true;
    HZ.forEach(function (h) { var p = rec.plans[h[0]]; if (!p) return; var r = evalPlan(p, objs, h[2], rec.intraday); rec.status[h[0]] = r; if (!r.done) done = false; });
    var prime = rec.plans.swing || rec.plans.day || rec.plans.long, prev = rec.bars.length ? rec.bars[rec.bars.length - 1][4] : rec.px, daily = [];
    objs.slice(0, 10).forEach(function (b) { var chg = (b.c / prev - 1) * 100; daily.push({ d: barDate(b.t), chg: chg, match: prime ? ((chg > 0) === (prime.dir === 'long')) : null }); prev = b.c; });
    rec.daily = daily; rec.final = done && objs.length > 0; rec.lastCheck = now;
  }
  async function track(force, onlyId) {
    if (ST.busy || !D.lib || !D.lib.length || !S.td) return; ST.busy = true; paint(); var now = Date.now();
    try {
      for (var i = 0; i < D.lib.length; i++) {
        var rec = D.lib[i]; if (rec.final || (onlyId && rec.id !== onlyId)) continue; if (!force && now - rec.lastCheck < 40 * 60e3) continue;
        if (barDate(now) < rec.start && et(now).d < rec.start) { rec.lastCheck = now; continue; }
        try { var series = await DP.getClient().series(rec.sym.indexOf('/') >= 0 ? rec.sym : rec.sym, '1day', 45); apply(rec, series, now); } catch (e) { rec.err = e.message; }
      }
      save();
    } finally { ST.busy = false; }
    eod(); paint();
  }

  /* ---------- סיכום סוף יום ---------- */
  function eod() {
    var now = Date.now(), e = et(now); if (e.wk || e.m < 16 * 60 + 20 || D.libEod === e.d) return;
    var todays = (D.lib || []).filter(function (r) { return r.daily && r.daily.length && r.daily[r.daily.length - 1].d === e.d; });
    if (!todays.length) return; D.libEod = e.d;
    var lines = todays.map(function (r) { var d = r.daily[r.daily.length - 1], s = r.status.swing || r.status.day || r.status.long || {}, dir = (r.plans.swing || r.plans.day || r.plans.long || {}).dir; return r.sym + ': היום ' + (d.chg >= 0 ? '+' : '') + d.chg.toFixed(1) + '% (' + (d.match ? 'כמו' : 'נגד') + ' כיוון ה' + (dir === 'short' ? 'שורט' : 'לונג') + '), מצב: ' + (STT[s.st] || '–'); });
    var ok = todays.filter(function (r) { return r.daily[r.daily.length - 1].match; }).length, txt = 'סיכום יום המסחר: ' + ok + ' מתוך ' + todays.length + ' ניתוחים נעו היום בכיוון שחזינו.\n' + lines.join('\n');
    D.libRep = { t: now, d: e.d, text: txt }; save(); toast('סיכום יום המסחר מוכן בניתוחי מניות'); if (typeof telegram === 'function') Promise.resolve(telegram('📊 ' + txt)).catch(function () { });
  }

  /* ---------- לוח תוצאות ---------- */
  function board() {
    var L = D.lib || [], n = L.length, strong = 0, win = 0, loss = 0, rs = [], dm = 0, dt = 0;
    L.forEach(function (r) {
      HZ.forEach(function (h) { var p = r.plans[h[0]], s = r.status[h[0]]; if (p && p.strong && s && s.done && s.st !== 'noentry' && s.st !== 'na') { strong++; if (GOOD[s.st]) win++; else if (BAD[s.st]) loss++; rs.push(s.r); } });
      (r.daily || []).slice(0, 1).forEach(function (d) { if (d.match != null) { dt++; if (d.match) dm++; } });
    });
    return { n: n, strong: strong, win: win, loss: loss, hit: win + loss ? win / (win + loss) : null, avgR: rs.length ? rs.reduce(function (a, b) { return a + b; }, 0) / rs.length : null, dir: dt ? dm / dt : null, dt: dt };
  }

  /* ---------- אירועים היסטוריים וכל החדשות (כרטיסי נתונים בניתוח) ---------- */
  var hist = {};
  async function loadHist(res) {
    var out = {}, sym = res.sym; if (sym.indexOf('/') >= 0) return;
    var b1 = res.bars && res.bars['1D'] || []; var moves = []; for (var i = Math.max(1, b1.length - 250); i < b1.length; i++) { var chg = (b1[i].c / b1[i - 1].c - 1) * 100; if (Math.abs(chg) >= 5) moves.push({ d: barDate(b1[i].t), chg: chg }); }
    out.moves = moves.sort(function (a, b) { return Math.abs(b.chg) - Math.abs(a.chg); }).slice(0, 6).sort(function (a, b) { return a.d < b.d ? 1 : -1; });
    if (S.fh) {
      try { var e = await fh('/stock/earnings?symbol=' + sym); out.earn = (Array.isArray(e) ? e : []).slice(0, 4); } catch (x) { }
      try { var y = new Date(); var sp = await fh('/stock/split?symbol=' + sym + '&from=' + (y.getFullYear() - 3) + '-01-01&to=' + y.toISOString().slice(0, 10)); out.splits = Array.isArray(sp) ? sp.slice(-3) : []; } catch (x) { }
    }
    hist[sym] = out; if (DP.state.res === res) DP.repaint();
  }
  function histHtml(r) {
    var h = hist[r.sym]; if (!h) return ''; var out = '<section class="dp-card"><h3>אירועים היסטוריים עד היום</h3>';
    if (h.earn && h.earn.length) out += '<h4 class="cx-h">דוחות רבעוניים אחרונים: בפועל מול צפי</h4><div class="cx-t">' + h.earn.map(function (x) { var s = x.surprisePercent; return '<div class="cx-r" style="grid-template-columns:1.1fr 1fr 1fr 1fr"><span>' + esc(x.period || '') + '</span><span>בפועל ' + num(x.actual) + '</span><span>צפי ' + num(x.estimate) + '</span><span class="' + (s > 0 ? 'up' : s < 0 ? 'down' : '') + '">' + (s != null ? (s > 0 ? 'הפתיעה +' : 'הפספסה ') + num(Math.abs(s), 1) + '%' : '–') + '</span></div>'; }).join('') + '</div>';
    if (h.moves && h.moves.length) out += '<h4 class="cx-h">ימים עם תנועה חדה בשנה האחרונה (5% ומעלה)</h4><div class="cx-t">' + h.moves.map(function (x) { return '<div class="cx-r" style="grid-template-columns:1fr 1fr"><span>' + esc(x.d) + '</span><span class="' + (x.chg >= 0 ? 'up' : 'down') + '" style="direction:ltr;text-align:right">' + (x.chg >= 0 ? '+' : '') + num(x.chg, 1) + '%</span></div>'; }).join('') + '</div>';
    if (h.splits && h.splits.length) out += '<h4 class="cx-h">פיצולי מניה</h4>' + h.splits.map(function (x) { return '<div class="cx-i"><b>' + esc(x.date) + ': ' + esc(x.fromFactor) + ' ל-' + esc(x.toFactor) + '</b></div>'; }).join('');
    if (!(h.earn && h.earn.length) && !(h.moves && h.moves.length) && !(h.splits && h.splits.length)) out += '<div class="dp-empty">אין נתונים היסטוריים זמינים.</div>';
    return out + '<div class="dp-foot" style="text-align:right">אירועים מהשנה האחרונה מהמחקר ברשת (עם מקורות) מופיעים בכרטיס "מה קורה סביב המניה".</div></section>';
  }
  function allNewsHtml(r) {
    var W = (window.__wire && window.__wire.state && window.__wire.state.items) || []; if (!W.length) return '';
    var sym = r.sym.replace('/USD', ''), re = new RegExp('(^|[^A-Za-z])' + sym + '([^A-Za-z]|$)'), L = { il: 'ישראל', us: 'ארה"ב והעולם', macro: 'מאקרו ופוליטיקה', an: 'אנליסטים' };
    var list = W.filter(function (i) { return re.test(i.title); }).concat(W.filter(function (i) { return !re.test(i.title) && (i.c === 'macro' || i.c === 'an'); })).slice(0, 18);
    return '<section class="dp-card"><h3>כל החדשות שיכולות להזיז את המניה <small>גם כאלה שלא קשורות אליה ישירות</small></h3>' + list.map(function (i) { return '<a class="dp-news" href="' + esc(i.link) + '" target="_blank" rel="noopener"><i class="' + (re.test(i.title) ? 'pos' : '') + '"></i><div><b' + (i.en ? ' dir="ltr"' : '') + '>' + esc((window.__wire.state.tr || {})[i.title] || i.title) + '</b><small>' + esc(i.src) + ' · ' + (L[i.c] || '') + (i.t ? ' · ' + new Date(i.t).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '') + '</small></div></a>'; }).join('') + '</section>';
  }
  if (window.DeepCtx) {
    var _s = DeepCtx.start, _h = DeepCtx.html;
    DeepCtx.start = function (res, f) { loadHist(res); return _s(res, f); };
    DeepCtx.html = function (r) { return _h(r) + histHtml(r) + allNewsHtml(r); };
  }

  /* ---------- עמוד הספרייה ---------- */
  function chart(rec, cv) {
    var objs = rec.bars.concat(rec.after).map(function (a) { return { t: a[0], o: a[1], h: a[2], l: a[3], c: a[4] }; }), plan = rec.plans.swing || rec.plans.day || rec.plans.long;
    DP.drawChart(cv, objs, plan, null);
    var g = cv.getContext('2d'), n = Math.min(70, objs.length), W = cv.clientWidth || 340, padL = 6, padR = 58, cw = (W - padL - padR) / n, i = rec.bars.length - 1 - (objs.length - n);
    if (i >= 0) { var x = padL + i * cw + cw / 2; g.save(); g.setLineDash([3, 4]); g.strokeStyle = 'rgba(255,200,60,.8)'; g.beginPath(); g.moveTo(x, 6); g.lineTo(x, 224); g.stroke(); g.fillStyle = 'rgba(255,200,60,.95)'; g.font = '11px sans-serif'; g.fillText('ניתוח', Math.max(2, x - 14), 12); g.restore(); }
  }
  function recHtml(r) {
    var dt = new Date(r.at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }), v = r.verdict.swing || {};
    var hs = HZ.map(function (h) {
      var p = r.plans[h[0]], vd = r.verdict[h[0]] || {}, s = r.status[h[0]];
      if (!p) return '<div><b>' + h[1] + '</b>' + esc(vd.headline || 'אין תוכנית') + '</div>';
      var st = s ? STT[s.st] : 'נבדק בסוף יום המסחר', cl = s && GOOD[s.st] ? 'good' : s && BAD[s.st] ? 'bad' : '';
      return '<div><b>' + h[1] + ': ' + (p.dir === 'long' ? 'לונג' : 'שורט') + (p.strong ? '' : ' (חלש)') + '</b>כניסה ' + num(p.entry) + ' · סטופ ' + num(p.stop) + '<br>יעד 1 ' + num(p.t1) + ' · יעד 2 ' + num(p.t2) + '<br><span class="lb-st ' + cl + '">' + st + (s && s.r != null && s.st !== 'wait' && s.st !== 'noentry' ? ' · ' + (s.r >= 0 ? '+' : '') + s.r.toFixed(1) + 'R' : '') + '</span></div>';
    }).join('');
    var days = (r.daily || []).map(function (d) { return '<span class="' + (d.match ? 'up' : 'down') + '" style="margin-inline-end:10px;white-space:nowrap">' + d.d.slice(5) + ' ' + (d.chg >= 0 ? '+' : '') + d.chg.toFixed(1) + '% ' + (d.match ? '✓' : '✗') + '</span>'; }).join('');
    return '<div class="lb-r" data-id="' + esc(r.id) + '"><h3><a href="#" data-lsym="' + esc(r.sym) + '">' + esc(r.sym) + '</a><small style="color:var(--ink2);font-weight:400">' + esc(r.name) + ' · ' + dt + ' · מחיר $' + num(r.px) + '</small></h3>' +
      '<div class="dp-foot" style="text-align:right">' + esc(v.headline || '') + (r.parts && r.parts.length ? ' · ' + r.parts.slice(0, 8).map(function (p) { return esc(p.k) + ' ' + (p.v >= 0 ? '+' : '') + p.v; }).join(', ') : '') + '</div><div class="lb-h">' + hs + '</div>' +
      (days ? '<div class="dp-foot" style="text-align:right"><b>תנועה יומית מול הכיוון:</b> ' + days + '</div>' : '<div class="dp-foot" style="text-align:right">עוד לא נסגר יום מסחר אחרי הניתוח.</div>') +
      '<div class="dp-actions" style="grid-template-columns:1fr 1fr 1fr"><button class="btn ghost" data-lchart="' + esc(r.id) + '">' + (ST.open[r.id] ? 'הסתר גרף' : 'גרף עם התוצאה') + '</button><button class="btn ghost" data-lre="' + esc(r.sym) + '">נתח שוב</button><button class="btn ghost" data-ldel="' + esc(r.id) + '">מחק</button></div>' + (ST.open[r.id] ? '<canvas class="lb-cv" id="lc-' + esc(r.id) + '"></canvas>' : '') + (r.err ? '<div class="dp-foot">הבדיקה האחרונה נכשלה: ' + esc(r.err) + '</div>' : '') + '</div>';
  }
  function paint() {
    var host = $q('#lbBody'); if (!host) return; var B = board(), L = (D.lib || []).slice().reverse();
    if (ST.filter) L = L.filter(function (r) { return r.sym.indexOf(ST.filter) >= 0; });
    var pct = function (v) { return v == null ? '–' : Math.round(v * 100) + '%'; };
    host.innerHTML = '<div class="lb-sc"><div><b>' + B.n + '</b><span>ניתוחים שמורים</span></div><div><b>' + pct(B.hit) + '</b><span>פגעו ביעד מתוך אלה שנסגרו (' + (B.win + B.loss) + ')</span></div><div><b>' + (B.avgR != null ? (B.avgR >= 0 ? '+' : '') + B.avgR.toFixed(2) + 'R' : '–') + '</b><span>תוצאה ממוצעת לעסקה</span></div><div><b>' + pct(B.dir) + '</b><span>היום הראשון בכיוון הניתוח (' + B.dt + ')</span></div></div>' +
      (D.libRep ? '<div class="dp-regime"><i></i><b>' + esc(D.libRep.text).replace(/\n/g, '<br>') + '</b></div>' : '') +
      '<div style="display:flex;gap:8px;margin:8px 0"><input id="lbQ" placeholder="חפש מניה בתיקייה" dir="ltr" value="' + esc(ST.filter) + '" style="flex:1;min-width:0;height:44px;font-size:16px;padding:0 12px;border-radius:12px;background:var(--panel);border:1px solid var(--line);color:var(--ink)"><button class="btn ghost" id="lbCheck">' + (ST.busy ? 'בודק…' : 'בדוק עכשיו') + '</button></div>' +
      (L.length ? L.map(recHtml).join('') : '<div class="dp-empty">אין ניתוחים שמורים. נתח מניה ולחץ "שקלול", והניתוח יישמר כאן אוטומטית.</div>') +
      '<div class="dp-foot" style="text-align:right">הבדיקה משווה כל תוכנית לנרות יומיים אמיתיים שנסגרו אחרי הניתוח. אם הסטופ והיעד נוגעים באותו נר, נספר הסטופ (שמרני). המעקב רץ כשהאתר פתוח, ומשלים אחורה כשפותחים אותו שוב. התוצאות מעידות על העבר ולא מבטיחות את העתיד.</div>';
    var q = $q('#lbQ'); if (q) q.oninput = function () { ST.filter = q.value.toUpperCase().trim(); var p = q.selectionStart; paint(); var q2 = $q('#lbQ'); q2.focus(); q2.setSelectionRange(p, p); };
    var ck = $q('#lbCheck'); if (ck) ck.onclick = function () { track(true); };
    host.querySelectorAll('[data-lchart]').forEach(function (b) { b.onclick = function () { ST.open[b.dataset.lchart] = !ST.open[b.dataset.lchart]; paint(); }; });
    host.querySelectorAll('[data-lre]').forEach(function (b) { b.onclick = function () { window.openDeep(b.dataset.lre); }; });
    host.querySelectorAll('[data-lsym]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); window.openDeep(a.dataset.lsym); }; });
    host.querySelectorAll('[data-ldel]').forEach(function (b) { b.onclick = function () { if (!confirm('למחוק את הניתוח הזה?')) return; D.lib = D.lib.filter(function (r) { return r.id !== b.dataset.ldel; }); save(); paint(); }; });
    Object.keys(ST.open).forEach(function (id) { if (!ST.open[id]) return; var rec = (D.lib || []).filter(function (r) { return r.id === id; })[0], cv = document.getElementById('lc-' + id); if (rec && cv) chart(rec, cv); });
  }
  function build() {
    if ($q('#p-lib')) return; var s = document.createElement('section'); s.className = 'page'; s.id = 'p-lib';
    s.innerHTML = '<h2>ניתוחי מניות <small>כל שקלול נשמר ונבדק מול מה שקרה</small></h2><div id="lbBody"></div>'; document.querySelector('main').appendChild(s);
  }
  build();
  var _e = onEnter; onEnter = function (id) { _e(id); if (id === 'p-lib') { paint(); track(false); } };
  window.__lib = { saveAnalysis: saveAnalysis, track: track, evalPlan: evalPlan, apply: apply, startInfo: startInfo, board: board, eod: eod, paint: paint };
  setTimeout(function () { track(false); }, 6000); setInterval(function () { track(false); }, 30 * 60e3);
})();
