/* מסך מניה בסגנון TradingView, שלך: גרף נרות אמיתי (ספריית Lightweight Charts של TradingView, קוד פתוח) עם נפח, ממוצעים,
   VWAP ובולינגר, ועליו התוכנית שלך: כניסה, סטופ, יעדים, אזורי פער וביקוש, וסימון של כל ניתוח קודם.
   מימין: ההחלטה האחרונה. מתחת: כרטיסי TradingView לסקירת חברה, פיננסים, ניתוח טכני וחדשות. */
(function () {
  'use strict';
  if (!window.LightweightCharts) return;
  var LW = window.LightweightCharts, DP = window.__deep, $q = function (s) { return document.querySelector(s); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var px = function (v) { return v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var TF = [['5ד', '5min'], ['שעה', '1h'], ['4ש', '4h'], ['יום', '1day'], ['שבוע', '1week'], ['חודש', '1month']];
  var OPT = [['ema20', 'EMA 20'], ['ema50', 'EMA 50'], ['ema200', 'EMA 200'], ['vwap', 'VWAP'], ['bb', 'בולינגר'], ['vol', 'נפח'], ['plan', 'התוכנית'], ['zones', 'אזורים'], ['marks', 'ניתוחים']];
  var ST = { mode: 'mine', sym: 'MU', iv: '1day', hz: 'swing', opts: { ema20: 1, ema50: 1, ema200: 1, vwap: 1, bb: 0, vol: 1, plan: 1, zones: 1, marks: 1 }, bars: null, chart: null, cs: null, times: [], busy: false, w: '' };
  try { var sv = JSON.parse(localStorage.getItem('adir-ch') || 'null'); if (sv) { if (sv.opts) Object.assign(ST.opts, sv.opts); if (sv.iv) ST.iv = sv.iv; if (sv.hz) ST.hz = sv.hz; if (sv.mode) ST.mode = sv.mode; } } catch (e) { }
  var persist = function () { try { localStorage.setItem('adir-ch', JSON.stringify({ opts: ST.opts, iv: ST.iv, hz: ST.hz, mode: ST.mode })); } catch (e) { } };
  var intraday = function () { return ['5min', '1h', '4h'].indexOf(ST.iv) >= 0; };
  var tz = function (t) { return new Date(t).getTimezoneOffset() * 60; };
  var T = function (t) { return intraday() ? Math.floor(t / 1000) - tz(t) : new Date(t).toISOString().slice(0, 10); };

  /* ---------- מקור ההחלטה: ניתוח פתוח, או האחרון ששמור ---------- */
  function source() {
    var r = DP.state.res;
    if (r && r.sym.replace('/USD', '') === ST.sym && r.weighed) {
      var plans = {}, ver = {}; ['day', 'swing', 'long'].forEach(function (k) { var m = r.modes[k], v = DP.verdictOf(m); ver[k] = v; plans[k] = m.plan ? { dir: m.plan.dir, entry: m.plan.entry, stop: m.plan.stop, t1: m.plan.t1, t2: m.plan.t2, qty: m.plan.qty } : null; });
      var base = r.modes[ST.hz] && r.modes[ST.hz].base;
      return { live: true, at: r.at, plans: plans, verdict: ver, base: base, status: {} };
    }
    var L = (D.lib || []).filter(function (x) { return x.sym.replace('/USD', '') === ST.sym; }); if (!L.length) return null;
    var rec = L[L.length - 1]; return { live: false, at: rec.at, plans: rec.plans, verdict: rec.verdict, base: null, status: rec.status || {}, rec: rec };
  }

  /* ---------- חישובי אינדיקטורים ---------- */
  function line(vals, times) { var o = []; for (var i = 0; i < vals.length; i++) if (vals[i] != null && isFinite(vals[i])) o.push({ time: times[i], value: +vals[i].toFixed(4) }); return o; }
  function sma(a, n) { var o = new Array(a.length).fill(null), s = 0; for (var i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; }
  function bollinger(c, n, k) { var m = sma(c, n), up = [], lo = []; for (var i = 0; i < c.length; i++) { if (m[i] == null) { up.push(null); lo.push(null); continue; } var v = 0; for (var j = i - n + 1; j <= i; j++) v += Math.pow(c[j] - m[i], 2); var sd = Math.sqrt(v / n); up.push(m[i] + k * sd); lo.push(m[i] - k * sd); } return { m: m, up: up, lo: lo }; }
  function vwap(bars) { var out = [], day = '', pv = 0, vv = 0; bars.forEach(function (b) { var d = new Date(b.t).toISOString().slice(0, 10); if (d !== day) { day = d; pv = 0; vv = 0; } var tp = (b.h + b.l + b.c) / 3; pv += tp * (b.v || 1); vv += (b.v || 1); out.push(pv / vv); }); return out; }

  /* ---------- ציור ---------- */
  function draw() {
    var el = $q('#csChart'); if (!el) return; if (ST.chart) { try { ST.chart.remove(); } catch (e) { } ST.chart = null; ST.cs = null; }
    var bars = ST.bars; if (!bars || !bars.length) return;
    var ch = LW.createChart(el, { width: el.clientWidth, height: el.clientHeight, layout: { background: { type: 'solid', color: '#0b0f16' }, textColor: '#9aa4b5', fontFamily: 'inherit' }, grid: { vertLines: { color: 'rgba(42,49,64,.35)' }, horzLines: { color: 'rgba(42,49,64,.35)' } }, crosshair: { mode: 0 }, rightPriceScale: { borderColor: '#2a3140' }, timeScale: { borderColor: '#2a3140', timeVisible: intraday(), secondsVisible: false, rightOffset: 6 }, localization: { priceFormatter: function (p) { return p.toFixed(2); } } });
    ST.chart = ch; var times = bars.map(function (b) { return T(b.t); }), seen = {}, data = [], keep = [];
    bars.forEach(function (b, i) { if (seen[times[i]]) return; seen[times[i]] = 1; keep.push(i); data.push({ time: times[i], open: b.o, high: b.h, low: b.l, close: b.c }); });
    ST.times = keep.map(function (i) { return times[i]; }); var B = keep.map(function (i) { return bars[i]; }), closes = B.map(function (b) { return b.c; }), tm = ST.times;
    var cs = ch.addCandlestickSeries({ upColor: '#19D68A', downColor: '#FF4D5E', borderUpColor: '#19D68A', borderDownColor: '#FF4D5E', wickUpColor: '#19D68A', wickDownColor: '#FF4D5E' }); cs.setData(data); ST.cs = cs;
    if (ST.opts.vol) { var vs = ch.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false }); ch.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } }); vs.setData(B.map(function (b, i) { return { time: tm[i], value: b.v || 0, color: b.c >= b.o ? 'rgba(25,214,138,.35)' : 'rgba(255,77,94,.35)' }; })); }
    var L = function (vals, color, w, dash) { var s = ch.addLineSeries({ color: color, lineWidth: w || 1, priceLineVisible: false, lastValueVisible: false, lineStyle: dash ? 2 : 0, crosshairMarkerVisible: false }); s.setData(line(vals, tm)); return s; };
    if (ST.opts.ema20) L(AT.ind.ema(closes, 20), '#58C4FF', 1);
    if (ST.opts.ema50) L(AT.ind.ema(closes, 50), '#F2B33D', 1);
    if (ST.opts.ema200) L(AT.ind.ema(closes, 200), '#C792EA', 1.5);
    if (ST.opts.vwap && intraday()) L(vwap(B), '#FFFFFF', 1.5, true);
    if (ST.opts.bb) { var bb = bollinger(closes, 20, 2); L(bb.up, 'rgba(120,140,255,.7)', 1); L(bb.lo, 'rgba(120,140,255,.7)', 1); L(bb.m, 'rgba(120,140,255,.35)', 1, true); }
    /* התוכנית והרמות על הגרף */
    var src = source();
    if (src) {
      var p = src.plans && src.plans[ST.hz];
      if (ST.opts.plan && p) [['כניסה', p.entry, '#58C4FF', 0], ['סטופ', p.stop, '#FF4D5E', 0], ['יעד 1', p.t1, '#19D68A', 2], ['יעד 2', p.t2, '#19D68A', 2]].forEach(function (x) { if (x[1] > 0) cs.createPriceLine({ price: x[1], color: x[2], lineWidth: 1, lineStyle: x[3], axisLabelVisible: true, title: x[0] }); });
      var base = src.base;
      if (ST.opts.zones && base) { var zs = (base.zones && base.zones.fvg || []).slice(-2).map(function (z) { return ['פער ' + (z.dir === 'bull' ? 'עולה' : 'יורד'), z]; }).concat((base.zones && base.zones.ob || []).slice(-2).map(function (z) { return ['ביקוש/היצע', z]; })); zs.forEach(function (x) { var z = x[1]; if (!(z.lo > 0)) return; [z.lo, z.hi].forEach(function (v, i) { cs.createPriceLine({ price: v, color: z.dir === 'bull' ? 'rgba(25,214,138,.55)' : 'rgba(255,77,94,.55)', lineWidth: 1, lineStyle: 3, axisLabelVisible: false, title: i ? '' : x[0] }); }); }); [['POC', base.poc], ['VAH', base.vah], ['VAL', base.val]].forEach(function (x) { if (x[1] > 0) cs.createPriceLine({ price: x[1], color: 'rgba(88,196,255,.45)', lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: x[0] }); }); }
    }
    if (ST.opts.marks) {
      var marks = []; (D.lib || []).filter(function (x) { return x.sym.replace('/USD', '') === ST.sym; }).slice(-12).forEach(function (rec) {
        var tgt = T(rec.at), idx = -1; for (var i = 0; i < tm.length; i++) { if (tm[i] <= tgt) idx = i; else break; } if (idx < 0) return; var pl = rec.plans.swing || rec.plans.day || rec.plans.long;
        marks.push({ time: tm[idx], position: pl && pl.dir === 'short' ? 'aboveBar' : 'belowBar', color: '#F2B33D', shape: pl && pl.dir === 'short' ? 'arrowDown' : 'arrowUp', text: 'ניתוח' });
      });
      var seenM = {}; marks = marks.filter(function (m) { var k = m.time + m.position; if (seenM[k]) return false; seenM[k] = 1; return true; }).sort(function (a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : 0; }); try { cs.setMarkers(marks); } catch (e) { }
    }
    ch.subscribeCrosshairMove(function (par) { var d = par && par.seriesData && par.seriesData.get(cs); legend(d || data[data.length - 1]); }); legend(data[data.length - 1]);
    ch.timeScale().fitContent(); var n = Math.min(120, data.length); if (data.length > n) ch.timeScale().setVisibleLogicalRange({ from: data.length - n, to: data.length + 6 });
  }
  function legend(d) {
    var el = $q('#csLeg'); if (!el || !d) return; var chg = (d.close / d.open - 1) * 100;
    el.innerHTML = '<span dir="ltr"><b>' + esc(ST.sym) + '</b> · ' + (TF.filter(function (x) { return x[1] === ST.iv; })[0] || [])[0] + '</span> <span dir="ltr">O ' + px(d.open) + ' H ' + px(d.high) + ' L ' + px(d.low) + ' C <b class="' + (chg >= 0 ? 'up' : 'down') + '">' + px(d.close) + '</b> <span class="' + (chg >= 0 ? 'up' : 'down') + '">' + (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%</span></span>';
  }

  /* ---------- נתונים ---------- */
  async function load() {
    var box = $q('#csChart'); if (!box) return; ST.busy = true; $q('#csMsg').textContent = 'טוען נרות…';
    try { var b = await DP.getClient().series(ST.sym === 'BTC' ? 'BTC/USD' : ST.sym, ST.iv, ST.iv === '1month' ? 240 : 300); ST.bars = b; $q('#csMsg').textContent = ''; draw(); head(); }
    catch (e) { ST.bars = null; if (ST.chart) { try { ST.chart.remove(); } catch (x) { } ST.chart = null; } $q('#csMsg').textContent = 'לא הצלחתי לטעון נרות: ' + e.message + (/429/.test(e.message) ? ' (מגבלת הקצב של ספק הנתונים, נסה בעוד דקה)' : ''); }
    ST.busy = false; side();
  }
  function head() {
    var last = ST.bars && ST.bars[ST.bars.length - 1], prev = ST.bars && ST.bars[ST.bars.length - 2], q = (typeof LIVE !== 'undefined' && LIVE[ST.sym]) || null, price = q && q.price || (last && last.c), chg = q && q.chg != null ? q.chg : (last && prev ? (last.c / prev.c - 1) * 100 : null);
    var nm = ''; try { var r = DP.state.res; if (r && r.sym.replace('/USD', '') === ST.sym && r.fund && r.fund.profile) nm = r.fund.profile.name || ''; } catch (e) { }
    $q('#csHead').innerHTML = '<div class="cs-id"><b dir="ltr">' + esc(ST.sym) + '</b><span>' + esc(nm) + '</span></div><div class="cs-px" dir="ltr"><b id="csPx">' + px(price) + '</b>' + (chg != null ? '<span class="' + (chg >= 0 ? 'up' : 'down') + '">' + (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%</span>' : '') + '</div>';
  }
  /* ---------- פאנל ההחלטה ---------- */
  function side() {
    var el = $q('#csSide'); if (!el) return; var src = source(), ST_ = { long: 'לונג', short: 'שורט', lean_long: 'נטייה ללונג', lean_short: 'נטייה לשורט', flat: 'להמתין' };
    var HZ = [['day', 'יומי'], ['swing', 'סווינג'], ['long', 'ארוך']], out = '<div class="cs-card"><h3>ההחלטה שלך</h3>';
    if (!src) out += '<div class="dp-empty">עוד לא נותחה. לחץ "נתח ושקלל" וההחלטה, הכניסה, הסטופ והיעדים יופיעו כאן ועל הגרף.</div>';
    else {
      var v = src.verdict[ST.hz] || {}, p = src.plans && src.plans[ST.hz], s = src.status && src.status[ST.hz];
      out += '<div class="cs-chips">' + HZ.map(function (h) { var vv = src.verdict[h[0]] || {}, cls = (vv.stance || '').indexOf('long') >= 0 ? 'long' : (vv.stance || '').indexOf('short') >= 0 ? 'short' : 'flat'; return '<button class="dp-chip ' + cls + (h[0] === ST.hz ? ' on' : '') + '" data-hz="' + h[0] + '"><small>' + h[1] + '</small><b>' + (ST_[vv.stance] || '–') + '</b></button>'; }).join('') + '</div>' +
        '<div class="dp-foot" style="text-align:right">' + esc(v.headline || '') + '</div>' +
        (p ? '<div class="cs-plan"><div><span>כניסה</span><b class="blue">' + px(p.entry) + '</b></div><div><span>סטופ</span><b class="down">' + px(p.stop) + '</b></div><div><span>יעד 1</span><b class="up">' + px(p.t1) + '</b></div><div><span>יעד 2</span><b class="up">' + px(p.t2) + '</b></div>' + (p.qty ? '<div><span>כמות</span><b>' + p.qty + '</b></div>' : '') + '</div>' : '<div class="dp-empty">אין תוכנית לאופק הזה.</div>') +
        (s && s.st ? '<div class="dp-foot" style="text-align:right">נבדק מול הנרות: <b>' + esc({ wait: 'ממתין לכניסה', noentry: 'לא נכנס', open: 'פתוח', stop: 'נעצר בסטופ', t1: 'פגע ביעד 1', t2: 'פגע ביעד 2', expired: 'הסתיים בלי יעד' }[s.st] || '') + '</b></div>' : '') +
        '<div class="dp-foot" style="text-align:right">' + (src.live ? 'מהניתוח הפתוח' : 'מהניתוח השמור ' + new Date(src.at).toLocaleDateString('he-IL')) + '</div>';
    }
    out += '<div class="dp-actions" style="grid-template-columns:1fr"><button class="btn" id="csAn">' + (src ? 'נתח ושקלל מחדש' : 'נתח ושקלל') + '</button>' + (src ? '<button class="btn ghost" id="csAl">התרע לי על הרמות</button><button class="btn ghost" id="csLib">ניתוחי מניות</button>' : '') + '</div></div>';
    el.innerHTML = out;
    el.querySelectorAll('[data-hz]').forEach(function (b) { b.onclick = function () { ST.hz = b.dataset.hz; persist(); draw(); side(); }; });
    var an = $q('#csAn'); if (an) an.onclick = function () { window.openDeep(ST.sym); };
    var al = $q('#csAl'); if (al) al.onclick = function () { var r = DP.state.res; if (r && r.sym.replace('/USD', '') === ST.sym && window.__pro) window.__pro.alertsFor(r, r.modes[ST.hz]); else toast('פתח את הניתוח (נתח ושקלל) כדי להגדיר התראות'); };
    var lb = $q('#csLib'); if (lb) lb.onclick = function () { goPage('p-lib'); onEnter('p-lib'); };
  }
  /* ---------- כרטיסי TradingView לנתונים נוספים ---------- */
  function widget(k) {
    ST.w = k; var host = $q('#csW'); if (!host) return; $q('#csTabs').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.w === k); });
    var base = { symbol: ST.sym, width: '100%', colorTheme: 'dark', isTransparent: true, locale: 'he_IL' };
    var cfg = { prof: ['embed-widget-symbol-profile.js', Object.assign({}, base, { height: 480 })], fin: ['embed-widget-financials.js', Object.assign({}, base, { height: 490, displayMode: 'regular', largeChartUrl: '' })], tech: ['embed-widget-technical-analysis.js', Object.assign({}, base, { height: 450, interval: '1D', showIntervalTabs: true })], news: ['embed-widget-timeline.js', Object.assign({}, base, { height: 480, feedMode: 'symbol', displayMode: 'regular' })] }[k];
    host.style.height = (cfg[1].height + 6) + 'px'; tv('csW', cfg[0], cfg[1]);
  }
  /* ---------- בניית העמוד ---------- */
  function build() {
    if ($q('#p-sym')) return; var s = document.createElement('section'); s.className = 'page'; s.id = 'p-sym';
    s.innerHTML = '<div class="cs-top"><div id="csHead" class="cs-headin"></div><div class="cs-mode" id="csMode"><button data-m="mine">הגרף שלי</button><button data-m="tv">TradingView מלא</button></div></div>' +
      '<div class="cs-bar"><div class="cs-tf" id="csTf">' + TF.map(function (x) { return '<button data-iv="' + x[1] + '">' + x[0] + '</button>'; }).join('') + '</div><div class="cs-op" id="csOp">' + OPT.map(function (x) { return '<button data-o="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="cs-grid"><div class="cs-main"><div id="csLeg" class="cs-leg"></div><div id="csChart" class="cs-chart" dir="ltr"></div><div id="csTV" class="cs-chart" style="display:none"></div><div id="csMsg" class="dp-foot"></div></div><aside id="csSide"></aside></div>' +
      '<div class="tabs" id="csTabs" style="margin:12px 0 6px"><button data-w="prof">סקירת חברה</button><button data-w="fin">פיננסים</button><button data-w="tech">ניתוח טכני</button><button data-w="news">חדשות</button></div><div id="csW" class="dp-card" style="min-height:60px"><div class="dp-empty">בחר לשונית כדי לטעון נתוני TradingView</div></div>' +
      '<div class="dp-foot" style="text-align:right">הגרף בנוי על <a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView Lightweight Charts</a>. הנתונים מ-Twelve Data (נרות) ומ-Finnhub (מחיר חי). הכרטיסים שמתחת הם ווידג\'טים של TradingView.</div>';
    document.querySelector('main').appendChild(s);
    $q('#csMode').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; ST.mode = b.dataset.m; persist(); setMode(); };
    $q('#csTf').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; ST.iv = b.dataset.iv; persist(); paintBar(); load(); };
    $q('#csOp').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; ST.opts[b.dataset.o] = ST.opts[b.dataset.o] ? 0 : 1; persist(); paintBar(); draw(); };
    $q('#csTabs').onclick = function (e) { var b = e.target.closest('button'); if (b) widget(b.dataset.w); };
    new ResizeObserver(function () { if (ST.chart) { var el = $q('#csChart'); if (el && el.clientWidth) ST.chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }); } }).observe($q('#csChart'));
  }
  /* מצב TradingView מלא: כל כלי השרטוט והאינדיקטורים של TradingView, בתוך האתר שלך */
  function setMode() {
    var tvm = ST.mode === 'tv'; $q('#csMode').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.m === ST.mode); });
    $q('#csChart').style.display = tvm ? 'none' : ''; $q('#csLeg').style.display = tvm ? 'none' : ''; $q('#csTV').style.display = tvm ? '' : 'none'; $q('.cs-bar').style.display = tvm ? 'none' : '';
    if (tvm) { var st = []; try { st = STUDIES.filter(function (x) { return FIXED_ST.indexOf(x[0]) >= 0 || (S.studies || []).indexOf(x[0]) >= 0; }).map(function (x) { return x[2]; }); } catch (e) { } tv('csTV', 'embed-widget-advanced-chart.js', { autosize: true, symbol: ST.sym === 'BTC' ? 'BITSTAMP:BTCUSD' : ST.sym, interval: 'D', timezone: 'Asia/Jerusalem', theme: 'dark', style: '1', locale: 'he_IL', backgroundColor: '#0b0f16', gridColor: 'rgba(42,49,64,.4)', hide_side_toolbar: false, allow_symbol_change: true, save_image: true, withdateranges: true, details: true, studies: st, support_host: 'https://www.tradingview.com' }); }
    else if (ST.chart) { var el = $q('#csChart'); ST.chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }); }
  }
  function paintBar() { $q('#csTf').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.iv === ST.iv); }); $q('#csOp').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', !!ST.opts[b.dataset.o]); }); }
  function openSym(sym) { ST.sym = String(sym || ST.sym).toUpperCase().replace('/USD', '').replace(/[^A-Z0-9.]/g, '') || 'MU'; ST.w = ''; goPage('p-sym'); onEnter('p-sym'); }
  function enter() { build(); paintBar(); head(); side(); setMode(); if (ST.mode !== 'tv') load(); else side(); var h = $q('#csW'); if (h && ST.w) widget(ST.w); }
  /* מחיר חי: מעדכנים את הנר האחרון */
  setInterval(function () {
    if (!ST.cs || !ST.bars || !$q('#p-sym.on')) return; var q = typeof LIVE !== 'undefined' && LIVE[ST.sym]; if (!q || !q.live || !(q.price > 0)) return; var last = ST.bars[ST.bars.length - 1], t = ST.times[ST.times.length - 1]; if (!last || !t) return;
    var o = Math.min(last.l, q.price), h = Math.max(last.h, q.price); try { ST.cs.update({ time: t, open: last.o, high: h, low: o, close: q.price }); } catch (e) { } var el = $q('#csPx'); if (el) el.textContent = px(q.price);
  }, 1500);
  build();
  var _e = onEnter; onEnter = function (id) { _e(id); if (id === 'p-sym') enter(); };
  /* כפתור "גרף" בשדה החיפוש */
  var qs = $q('#qs'); if (qs && !$q('#qsChart')) { var b = document.createElement('button'); b.type = 'button'; b.id = 'qsChart'; b.className = 'btn ghost'; b.textContent = 'גרף'; b.onclick = function () { var v = $q('#qsIn').value.toUpperCase().replace(/[^A-Z0-9.:\/-]/g, ''); if (!v) { toast('הקלד סימול מניה'); return; } $q('#qsIn').value = ''; openSym(v); }; qs.insertBefore(b, qs.querySelector('button[type="submit"]')); }
  window.openSym = openSym; window.__chart = { state: ST, draw: draw, load: load, source: source };
})();
