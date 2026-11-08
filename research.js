/* מה קורה סביב המניה: חדשות עדכניות, הסקטור, המאקרו, אנליסטים ואירועים קרובים.
   שני מקורות: (1) נתונים קשיחים מ-Finnhub: חברות דומות, השוואת מכפילים וצמיחה, וכותרות של חברות הסקטור.
   (2) מחקר ברשת עם מפתח הבינה: מאקרו, סקטור, חברה, אנליסטים ואירועים, עם קישור לכל פריט. פריט בלי קישור נזרק.
   התוצאה נכנסת גם להחלטה: "חדשות ומאקרו לא נגד הכיוון". */
(function () {
  'use strict';
  var DP = window.__deep, KEY = 'adir-ctx', TTL = 15 * 60e3;
  var $q = function (s) { return document.querySelector(s); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var num = function (n, d) { return n == null || !isFinite(n) ? '–' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }); };
  var cache = {}; try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { }
  var persist = function () { try { var k = Object.keys(cache); if (k.length > 12) k.sort(function (a, b) { return cache[a].t - cache[b].t; }).slice(0, k.length - 12).forEach(function (x) { delete cache[x]; }); localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { } };
  var SYS = 'אתה חוקר שוק הון עבור סוחר ישראלי. תקבל מניה. חפש ברשת מידע עדכני מהימים והשבועות האחרונים ותחזיר: ' +
    '(1) מאקרו שמשפיע על המניה: ריבית ופד, אינפלציה, דולר, תשואות, מכסים, גאופוליטיקה, ויומן אירועים קרוב. ' +
    '(2) הסקטור והענף של המניה: מגמות, מחירים, ביקוש, חדשות של מתחרות ולקוחות. ' +
    '(3) חדשות על החברה עצמה. (4) מהלכי אנליסטים: שדרוג, הורדה, יעדי מחיר. (5) אירועים קרובים: דוח, החלטת רגולטור, כנס, מוצר. (6) פוליטיקה ורגולציה: מה שאמרו נשיא ארה"ב, שרים, חברי קונגרס, הפד, רגולטורים או מנהיגים בעולם, מכסים, סנקציות, חוקים, מכרזים ממשלתיים, כל מה שיכול להזיז את המניה או הסקטור שלה. ' +
    'באנליסטים כלול גם בתי השקעות ובנקים (גולדמן, מורגן סטנלי, JPMorgan, בנק אוף אמריקה, סיטי, UBS, וגם בתי השקעות ישראליים כמו IBI, מיטב, אקסלנס, פסגות). ' +
    'מקורות מועדפים:  reuters.com, bloomberg.com, cnbc.com, investing.com, marketbeat.com, tipranks.com, seekingalpha.com, גלובס, כלכליסט. ' +
    'חוק ברזל: כלול רק מה שמצאת בפועל ועם קישור למקור. אסור להמציא עובדות, מספרים או תאריכים. אם אין מידע בקטגוריה, החזר רשימה ריקה. ' +
    'החזר JSON בלבד, בעברית פשוטה: {"bias":"bullish|bearish|mixed","bias_reason":"משפט אחד: איך החדשות והמאקרו משפיעים על המניה בשבועות הקרובים","macro":[{"point":"","why":"למה זה משפיע על המניה","source":"","url":"","date":"YYYY-MM-DD"}],"sector":[{"point":"","why":"","source":"","url":"","date":""}],"company":[{"point":"","why":"","source":"","url":"","date":""}],"analysts":[{"point":"","why":"","source":"","url":"","date":""}],"events":[{"point":"","why":"","source":"","url":"","date":""}],"politics":[{"point":"","why":"","source":"","url":"","date":""}],"scores":{"macro":-2,"sector":0,"company":1,"politics":null,"analysts":2}}. ציון לכל קטגוריה: מספר שלם מ-2- (מאוד שלילי למניה) עד 2 (מאוד חיובי), 0 ניטרלי, null אם אין מידע. הציון משקף את ההשפעה על המחיר של המניה, לא את הטון של הכתבה. ' +
    'עד 4 פריטים בכל קטגוריה, מהחדש לישן. משפט קצר בכל שדה.';
  var SEC = [['macro', 'מאקרו'], ['sector', 'הסקטור'], ['company', 'החברה'], ['analysts', 'אנליסטים ובתי השקעות'], ['politics', 'פוליטיקה ורגולציה'], ['events', 'אירועים קרובים']];

  function fh(path) { var c = DP.getClient(); return c._json(c.fhBase + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(S.fh), c.fhLimiter); }
  var med = function (a) { a = a.filter(function (x) { return x != null && isFinite(x); }).sort(function (x, y) { return x - y; }); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };

  /* ---------- נתונים קשיחים: חברות דומות וחדשות הסקטור ---------- */
  async function loadPeers(res) {
    if (!S.fh || res.sym.indexOf('/') >= 0) return null;
    var list = await fh('/stock/peers?symbol=' + encodeURIComponent(res.sym)).catch(function () { return []; });
    var peers = (Array.isArray(list) ? list : []).filter(function (t) { return t && t !== res.sym && /^[A-Z.]{1,6}$/.test(t); }).slice(0, 4), rows = [], news = [];
    await Promise.all(peers.map(async function (t) {
      var m = null, p = null; try { m = await fh('/stock/metric?symbol=' + t + '&metric=all'); p = await fh('/stock/profile2?symbol=' + t); } catch (e) { }
      var x = (m && m.metric) || {}, g = function () { for (var i = 0; i < arguments.length; i++) { var v = x[arguments[i]]; if (v != null && isFinite(v)) return v; } return null; };
      rows.push({ sym: t, name: (p && p.name) || '', cap: p && p.marketCapitalization, pe: g('peTTM', 'peBasicExclExtraTTM'), rg: g('revenueGrowthTTMYoy'), nm: g('netProfitMarginTTM'), rs: g('priceRelativeToS&P50013Week'), r13: g('13WeekPriceReturnDaily') });
    }));
    var to = new Date(), from = new Date(to.getTime() - 4 * 864e5), d = function (z) { return z.toISOString().slice(0, 10); };
    await Promise.all(peers.slice(0, 3).map(async function (t) {
      try { var a = await fh('/company-news?symbol=' + t + '&from=' + d(from) + '&to=' + d(to)); (Array.isArray(a) ? a : []).slice(0, 4).forEach(function (n) { if (n.headline && n.url) news.push({ sym: t, headline: n.headline, source: n.source, url: n.url, t: (n.datetime || 0) * 1000, s: AT.data.sentiment((n.headline || '') + ' ' + (n.summary || '')) }); }); } catch (e) { }
    }));
    news.sort(function (a, b) { return b.t - a.t; });
    var mine = res.fund && res.fund.metric || {}, my = { sym: res.sym, name: (res.fund && res.fund.profile && res.fund.profile.name) || res.sym, cap: res.fund && res.fund.profile && res.fund.profile.marketCapitalization, pe: mine.peTTM != null ? mine.peTTM : mine.peBasicExclExtraTTM, rg: mine.revenueGrowthTTMYoy, nm: mine.netProfitMarginTTM, rs: mine['priceRelativeToS&P50013Week'], r13: mine['13WeekPriceReturnDaily'] };
    return { rows: rows.sort(function (a, b) { return (b.cap || 0) - (a.cap || 0); }), me: my, medPE: med(rows.map(function (r) { return r.pe; })), medRG: med(rows.map(function (r) { return r.rg; })), medNM: med(rows.map(function (r) { return r.nm; })), news: news.slice(0, 8) };
  }

  /* ---------- מחקר ברשת ---------- */
  async function loadAI(res, force) {
    if (!aiKey()) return { err: 'למחקר חדשות ומאקרו צריך מפתח בינה (Anthropic או Gemini) בהגדרות.' };
    var hit = cache[res.sym]; if (!force && hit && Date.now() - hit.t < TTL) return hit.data;
    try {
      var prof = res.fund && res.fund.profile || {}, nm = prof.name ? prof.name + ' (' + res.sym + ')' : res.sym;
      var raw = await claude([{ role: 'user', content: 'מניה: ' + nm + (prof.finnhubIndustry ? '. ענף: ' + prof.finnhubIndustry : '') + '. היום: ' + new Date().toISOString().slice(0, 10) + '.' }],
        { system: SYS, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }], max_tokens: 4200, tier: 'smart' });
      var j = parseJSON(raw), out = { bias: ['bullish', 'bearish', 'mixed'].indexOf(j.bias) >= 0 ? j.bias : 'mixed', bias_reason: j.bias_reason || '', t: Date.now() };
      SEC.forEach(function (s) { out[s[0]] = (Array.isArray(j[s[0]]) ? j[s[0]] : []).filter(function (i) { return i && i.point && i.url && /^https?:/.test(i.url); }).slice(0, 4); });
      out.scores = {}; ['macro', 'sector', 'company', 'politics', 'analysts'].forEach(function (c) { var v = j.scores && j.scores[c], has = out[c] && out[c].length; out.scores[c] = has && typeof v === 'number' && isFinite(v) ? Math.max(-2, Math.min(2, v)) : null; });
      cache[res.sym] = { t: Date.now(), data: out }; persist(); return out;
    } catch (e) { return { err: 'המחקר נכשל: ' + e.message }; }
  }

  /* ---------- חיבור להחלטה ---------- */
  function applyGate(res) {
    var ai = res.ctx && res.ctx.ai; if (!ai || ai.err) return;
    Object.keys(res.modes).forEach(function (k) {
      var m = res.modes[k], dir = m.plan ? m.plan.dir : (m.an.combined.score >= 0 ? 'long' : 'short');
      var ok = ai.bias === 'mixed' ? null : (ai.bias === 'bullish') === (dir === 'long');
      var items = m.gates.items.filter(function (x) { return x.label !== 'חדשות ומאקרו לא נגד הכיוון'; });
      items.push({ ok: ok, label: 'חדשות ומאקרו לא נגד הכיוון', detail: (ai.bias === 'bullish' ? 'חיובי' : ai.bias === 'bearish' ? 'שלילי' : 'מעורב') + (ai.bias_reason ? ': ' + ai.bias_reason : '') });
      m.gates.items = items; m.gates.failed = items.filter(function (x) { return x.ok === false; }).length; m.gates.unknown = items.filter(function (x) { return x.ok === null; }).length;
      m.gates.ok = !m.gates.failed && !m.gates.unknown; m.gates.status = m.gates.failed ? 'blocked' : m.gates.unknown ? 'unverified' : 'ready';
    });
  }
  function start(res, force) {
    res.ctx = { status: 'loading', ai: null, peers: null };
    return Promise.all([loadPeers(res).catch(function () { return null; }), loadAI(res, force)]).then(function (r) {
      res.ctx.peers = r[0]; res.ctx.ai = r[1]; res.ctx.status = 'ok'; if (DP.unify) DP.unify(res); applyGate(res); if (DP.state.res === res) DP.repaint();
    });
  }

  /* ---------- תצוגה ---------- */
  function html(r) {
    var c = r.ctx; if (!c) return '';
    var head = '<h3>מה קורה סביב המניה' + (c.status === 'ok' && c.ai && c.ai.t ? ' <small>נכון ל-' + new Date(c.ai.t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) + ' <a href="#" id="ctxRef">רענן</a></small>' : '') + '</h3>';
    if (c.status === 'loading') return '<section class="dp-card" id="dpCtx">' + head + '<div class="dp-skel"><i style="height:90px"></i><i style="height:90px"></i></div><div class="dp-foot">מחפש חדשות, מאקרו וסקטור…</div></section>';
    var ai = c.ai, out = '';
    if (ai && ai.err) out += '<div class="dp-empty">' + esc(ai.err) + '</div>';
    else if (ai) {
      var cls = ai.bias === 'bullish' ? 'on' : ai.bias === 'bearish' ? 'off' : '', lbl = ai.bias === 'bullish' ? 'הקשר חיובי' : ai.bias === 'bearish' ? 'הקשר שלילי' : 'הקשר מעורב';
      out += '<div class="dp-regime ' + cls + '"><i></i><b>' + lbl + '</b><span>' + esc(ai.bias_reason) + '</span></div>';
      SEC.forEach(function (s) {
        var a = ai[s[0]]; if (!a || !a.length) return;
        out += '<h4 class="cx-h">' + s[1] + '</h4>' + a.map(function (i) { return '<div class="cx-i"><b>' + esc(i.point) + '</b>' + (i.why ? '<p>' + esc(i.why) + '</p>' : '') + '<a href="' + esc(i.url) + '" target="_blank" rel="noopener">' + esc(i.source || 'מקור') + (i.date ? ' · ' + esc(i.date) : '') + ' ↗</a></div>'; }).join('');
      });
      if (!SEC.some(function (s) { return ai[s[0]] && ai[s[0]].length; })) out += '<div class="dp-empty">לא נמצאו פריטים מתועדים עם מקור.</div>';
    }
    var pr = c.peers;
    if (pr && pr.rows.length) {
      var cmp = function (a, b, hi) { return a == null || b == null ? '' : (hi ? a > b : a < b) ? ' up' : ' down'; };
      out += '<h4 class="cx-h">מול חברות דומות</h4><div class="cx-t"><div class="cx-r cx-th"><span>חברה</span><span>מכפיל</span><span>צמיחה</span><span>רווחיות</span></div>' +
        [pr.me].concat(pr.rows).map(function (x, i) { return '<div class="cx-r' + (i === 0 ? ' me' : '') + '"><span>' + esc(x.sym) + '</span><span>' + num(x.pe) + '</span><span>' + (x.rg != null ? num(x.rg, 0) + '%' : '–') + '</span><span>' + (x.nm != null ? num(x.nm, 0) + '%' : '–') + '</span></div>'; }).join('') +
        '<div class="cx-r cx-med"><span>חציון</span><span>' + num(pr.medPE) + '</span><span>' + (pr.medRG != null ? num(pr.medRG, 0) + '%' : '–') + '</span><span>' + (pr.medNM != null ? num(pr.medNM, 0) + '%' : '–') + '</span></div></div>' +
        '<div class="dp-foot" style="text-align:right">' + esc(r.sym) + ': מכפיל <b class="' + (pr.me.pe != null && pr.medPE != null ? (pr.me.pe < pr.medPE ? 'up' : 'down') : '') + '">' + num(pr.me.pe) + '</b> מול חציון ' + num(pr.medPE) + ', צמיחה ' + (pr.me.rg != null ? num(pr.me.rg, 0) + '%' : '–') + ' מול ' + (pr.medRG != null ? num(pr.medRG, 0) + '%' : '–') + '.</div>';
    }
    if (pr && pr.news.length) out += '<h4 class="cx-h">כותרות מחברות הסקטור</h4>' + pr.news.map(function (n) { return '<a class="dp-news" href="' + esc(n.url) + '" target="_blank" rel="noopener"><i class="' + (n.s > 0.2 ? 'pos' : n.s < -0.2 ? 'neg' : '') + '"></i><div><b>' + esc(n.headline) + '</b><small>' + esc(n.sym) + ' · ' + esc(n.source || '') + (n.t ? ' · ' + new Date(n.t).toLocaleDateString('he-IL') : '') + '</small></div></a>'; }).join('');
    return '<section class="dp-card" id="dpCtx">' + head + out + '<div class="dp-foot" style="text-align:right;margin-top:8px">המחקר מבוסס על חיפוש ברשת ועלול לטעות. בדוק במקור לפני החלטה. לא ייעוץ השקעות.</div></section>';
  }
  function bind() { var a = $q('#ctxRef'); if (a) a.onclick = function (e) { e.preventDefault(); var r = DP.state.res; if (!r) return; delete cache[r.sym]; start(r, true); DP.repaint(); }; }
  window.DeepCtx = { start: start, html: html, bind: bind, applyGate: applyGate, cache: cache };
})();
