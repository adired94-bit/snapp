/* הפס הרץ: המניות הכי מעניינות ומדוברות היום. נבנה מהתנועה בפועל (שינוי יומי וגאפ) של מניות נזילות מכל הסקטורים,
   בתוספת הבחירות של הסריקה האחרונה. מתעדכן כל 20 דקות. בלי מפתח Finnhub: רשימת ברירת מחדל של המניות המדוברות. */
(function () {
  'use strict';
  var KEY = 'adir-hot', TTL = 20 * 60e3, DEF = ['NVDA', 'TSLA', 'AAPL', 'AMD', 'PLTR', 'MSTR', 'COIN', 'META', 'AMZN', 'MSFT', 'GOOGL', 'AVGO', 'MU', 'NFLX', 'SMCI'];
  var cache = null; try { cache = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { }
  function universe() { var sec = (window.__scan && window.__scan.SECTORS) || [], out = []; sec.forEach(function (g) { g.syms.slice(0, 4).forEach(function (s) { out.push(s); }); }); return out; }
  function fh(path) { var c = window.__deep.getClient(); return c._json(c.fhBase + path + '&token=' + encodeURIComponent(S.fh), c.fhLimiter); }
  function scanPicks() { try { var r = window.__scan.state.report || JSON.parse(localStorage.getItem('adir-scan3') || 'null'); var a = (r && (r.picks || r.rows || r.top)) || []; return a.map(function (x) { return x.sym; }).filter(Boolean).slice(0, 6); } catch (e) { return []; } }
  function list() { var base = cache && cache.syms && cache.syms.length ? cache.syms : DEF, p = scanPicks(); return Array.from(new Set(p.concat(base))).slice(0, 18); }
  var busy = false;
  async function refresh(force) {
    if (busy || !S.fh) return; if (!force && cache && Date.now() - cache.t < TTL) return; busy = true;
    try {
      var u = universe(), rows = [];
      for (var i = 0; i < u.length; i++) {
        try { var q = await fh('/quote?symbol=' + encodeURIComponent(u[i])); if (q && q.c > 0) { var gap = q.pc > 0 && q.o > 0 ? (q.o / q.pc - 1) * 100 : 0; rows.push({ s: u[i], i: Math.abs(q.dp || 0) * 6 + Math.abs(gap) * 3, c: q.c, dp: q.dp, gap: gap }); } }
        catch (e) { if (/401|403/.test(e.message)) break; }
      }
      if (rows.length >= 8) { rows.sort(function (a, b) { return b.i - a.i; }); cache = { t: Date.now(), syms: rows.slice(0, 14).map(function (r) { return r.s; }), rows: rows.slice(0, 20) }; try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { } try { loadTape(); } catch (e2) { } }
    } finally { busy = false; }
  }
  window.__hot = { movers: function () { return (cache && cache.rows) || []; }, list: list, refresh: refresh, DEF: DEF };
  setTimeout(function () { try { loadTape(); } catch (e) { } }, 300);
  setTimeout(refresh, 2500); setInterval(refresh, TTL);
})();
