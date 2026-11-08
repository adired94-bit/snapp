/* חדשות הבורסה: זרם אחד של כל מה שקשור לעולם ההון. עיתונות כלכלית בישראל, וול סטריט, מאקרו ופוליטיקה (טראמפ, הפד, מכסים),
   אנליסטים ובתי השקעות, וכל החדשות הכלליות מ-Finnhub. כותרות באנגלית אפשר לתרגם בלחיצה. מתרענן כל 5 דקות. */
(function () {
  'use strict';
  var $q = function (s) { return document.querySelector(s); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var g = function (q, hl) { return 'https://news.google.com/rss/search?q=' + encodeURIComponent(q + ' when:2d') + (hl ? '&hl=iw&gl=IL&ceid=IL:iw' : '&hl=en-US&gl=US&ceid=US:en'); };
  var FEEDS = [
    { n: 'גלובס', c: 'il', u: 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=585' },
    { n: 'כלכליסט', c: 'il', u: 'https://www.calcalist.co.il/GENERALRSS/0,16335,L-3928,00.xml' },
    { n: 'ביזפורטל', c: 'il', u: 'https://www.bizportal.co.il/rss/bizportal-news.xml' },
    { n: 'חדשות הבורסה בישראל', c: 'il', u: g('בורסה OR "ת"א 35" OR מניות OR "שוק ההון"', 1) },
    { n: 'פאנדר', c: 'il', u: g('site:funder.co.il', 1) },
    { n: 'דה מרקר', c: 'il', u: g('site:themarker.com בורסה OR מניות OR שוק ההון', 1) },
    { n: 'מעריב וכלכלה', c: 'il', u: g('site:ice.co.il OR site:mako.co.il OR site:maariv.co.il בורסה OR מניות OR וול סטריט', 1) },
    { n: 'מניות הטכנולוגיה', c: 'us', u: g('מניות הטכנולוגיה OR שבבים OR אנבידיה OR "בינה מלאכותית" בורסה', 1) },
    { n: 'וול סטריט', c: 'us', u: g('וול סטריט OR נאסד"ק OR "S&P 500" OR מניות', 1) },
    { n: 'CNBC', c: 'us', en: 1, u: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
    { n: 'CNBC Investing', c: 'us', en: 1, u: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839069' },
    { n: 'MarketWatch', c: 'us', en: 1, u: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
    { n: 'Yahoo Finance', c: 'us', en: 1, u: 'https://finance.yahoo.com/news/rssindex' },
    { n: 'Seeking Alpha', c: 'us', en: 1, u: 'https://seekingalpha.com/market_currents.xml' },
    { n: 'פוליטיקה ומאקרו', c: 'macro', en: 1, u: g('Trump OR Fed OR Powell OR tariffs OR sanctions stocks market') },
    { n: 'ריבית ותשואות', c: 'macro', en: 1, u: g('Treasury yields OR inflation OR "rate cut" OR "jobs report"') },
    { n: 'אנליסטים', c: 'an', en: 1, u: g('analyst upgrade OR downgrade OR "price target" stock') },
    { n: 'אנליסטים בישראל', c: 'an', u: g('אנליסטים OR "בית השקעות" OR "מחיר יעד" מניה', 1) }];
  var site = function (a) { return a.map(function (d) { return 'site:' + d; }).join(' OR '); };
  var GROUPS = [
    ['il', 'אתרי כלכלה בישראל', 1, ['globes.co.il', 'calcalist.co.il', 'themarker.com', 'bizportal.co.il', 'funder.co.il', 'news1.co.il']],
    ['il', 'עיתונות ישראלית', 1, ['ynet.co.il', 'mako.co.il', 'maariv.co.il', 'israelhayom.co.il', 'walla.co.il', 'davidoff-news.co.il', 'bizzness.co.il']],
    ['il', 'Israel business (English)', 0, ['en.globes.co.il', 'calcalistech.com', 'timesofisrael.com', 'jpost.com', 'haaretz.com']],
    ['us', 'Wall Street', 0, ['reuters.com', 'bloomberg.com', 'wsj.com', 'ft.com', 'barrons.com', 'cnbc.com']],
    ['us', 'Markets', 0, ['marketwatch.com', 'investing.com', 'finance.yahoo.com', 'seekingalpha.com', 'benzinga.com', 'investors.com']],
    ['us', 'Stocks and analysts', 0, ['fool.com', 'tipranks.com', 'zacks.com', 'thestreet.com', 'morningstar.com', 'businessinsider.com', 'forbes.com']],
    ['us', 'Global markets', 0, ['economist.com', 'asia.nikkei.com', 'scmp.com', 'bbc.com', 'theguardian.com', 'aljazeera.com']],
    ['us', 'Crypto', 0, ['coindesk.com', 'cointelegraph.com', 'theblock.co', 'decrypt.co']]];
  GROUPS.forEach(function (x) { FEEDS.push({ n: x[1], c: x[0], en: !x[2], gn: 1, u: g(site(x[3]) + ' (stocks OR market OR shares OR economy' + (x[2] ? ' OR בורסה OR מניות OR כלכלה' : '') + ')', x[2]) }); });
  var CUSTOM = []; try { CUSTOM = JSON.parse(localStorage.getItem('adir-wire-custom') || '[]'); } catch (e) { }
  var feeds = function () { return FEEDS.concat(CUSTOM); };
  var CH = [['all', 'הכל'], ['il', 'ישראל'], ['us', 'ארה"ב והעולם'], ['macro', 'מאקרו ופוליטיקה'], ['an', 'אנליסטים']];
  var ST = { items: [], cat: 'all', t: 0, busy: false, tr: {} }; try { ST.tr = JSON.parse(localStorage.getItem('adir-wire-tr') || '{}'); } catch (e) { }
  var isHe = function (t) { return /[֐-׿]/.test(t); };
  function parseXml(txt, f) {
    var d = new DOMParser().parseFromString(txt, 'text/xml'), out = [];
    d.querySelectorAll('item, entry').forEach(function (it) {
      var tt = it.querySelector('title'), l = it.querySelector('link'), dt = it.querySelector('pubDate, published, updated'), href = l && (l.getAttribute('href') || l.textContent);
      if (tt && href) out.push({ title: tt.textContent.trim(), link: href.trim(), t: dt ? new Date(dt.textContent).getTime() || 0 : 0 });
    }); return out;
  }
  async function pull(f) {
    try { var r = await fetch('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(f.u)), j = await r.json(); if (j && j.items && j.items.length) return j.items.map(function (i) { return { title: i.title, link: i.link, t: new Date((i.pubDate || '').replace(' ', 'T') + (/Z|\+/.test(i.pubDate || '') ? '' : 'Z')).getTime() || 0 }; }); } catch (e) { }
    try { var r2 = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(f.u)); if (r2.ok) return parseXml(await r2.text(), f); } catch (e) { }
    return [];
  }
  async function finnhub() {
    var out = []; if (!S.fh) return out;
    for (var k = 0; k < 2; k++) { var a = await fhGet('news?category=' + (k ? 'merger' : 'general')); (Array.isArray(a) ? a : []).slice(0, 40).forEach(function (n) { if (n.headline && n.url) out.push({ title: n.headline, link: n.url, t: (n.datetime || 0) * 1000, src: n.source || 'Finnhub', c: 'us', en: 1 }); }); }
    return out;
  }
  async function load(force) {
    if (ST.busy || (!force && Date.now() - ST.t < 5 * 60e3)) return; ST.busy = true; paint();
    var all = [], parts = await Promise.all(feeds().map(function (f) { return pull(f).then(function (a) { return a.slice(0, 40).map(function (i) { var ti = i.title, sr = f.n; if (f.gn) { var m = ti.match(/^(.*) - ([^-]{2,40})$/); if (m) { ti = m[1]; sr = m[2]; } } return { title: ti, link: i.link, t: i.t, src: sr, c: f.c, en: !!f.en && !isHe(ti) }; }); }); }).concat([finnhub()]));
    parts.forEach(function (a) { all = all.concat(a); });
    var seen = {}, cut = Date.now() - 2 * 864e5;
    ST.items = all.filter(function (i) { if (!i.title || !/^https?:/.test(i.link)) return false; if (i.t && i.t < cut) return false; var k = i.title.toLowerCase().replace(/[^a-z0-9֐-׿]/g, '').slice(0, 60); if (seen[k]) return false; seen[k] = 1; i.en = i.en && !isHe(i.title); return true; })
      .sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
    ST.t = Date.now(); ST.busy = false; paint(); speakNew();
  }
  function paint() {
    var list = ST.items.filter(function (i) { return ST.cat === 'all' || i.c === ST.cat; }), cnt = {}; ST.items.forEach(function (i) { cnt[i.c] = (cnt[i.c] || 0) + 1; });
    var hasEn = list.some(function (i) { return i.en && !ST.tr[i.title]; });
    var chips = '<div class="tabs wire-tabs" style="margin:0 0 6px">' + CH.map(function (c) { return '<button data-wc="' + c[0] + '"' + (ST.cat === c[0] ? ' class="on"' : '') + '>' + c[1] + (c[0] === 'all' ? ' ' + ST.items.length : cnt[c[0]] ? ' ' + cnt[c[0]] : '') + '</button>'; }).join('') + '</div>';
    var tools = '<div class="wire-tools" style="display:flex;gap:10px;font-size:12px;color:var(--ink2);margin:0 2px 4px;align-items:center">' + (ST.t ? '<span>עודכן ' + new Date(ST.t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) + '</span>' : '') + '<a href="#" data-wr>רענן</a><a href="#" data-wq>' + (S.squawk ? 'קריין: פועל' : 'קריין חדשות') + '</a><a href="#" data-wa>הוסף אתר</a><span>' + feeds().length + ' מקורות</span>' + (hasEn && typeof aiKey === 'function' && aiKey() ? '<a href="#" data-wt>תרגם לעברית</a>' : '') + '</div>';
    var body = ST.busy && !ST.items.length ? '<div class="empty">טוען חדשות מכל המקורות…</div>' : list.length ? list.slice(0, 120).map(function (i) {
      var ttl = ST.tr[i.title] || i.title; return '<div class="ni" style="padding:8px 4px"><div class="top"><span>' + esc(i.src) + (i.t ? ' · ' + new Date(i.t).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '') + '</span></div><a href="' + esc(i.link) + '" target="_blank" rel="noopener" style="font-size:14px;color:var(--ink);margin-top:2px"' + (i.en && !ST.tr[i.title] ? ' dir="ltr"' : '') + '>' + esc(ttl) + '</a></div>'; }).join('') : '<div class="empty">לא הצלחתי למשוך חדשות כרגע. נסה לרענן.</div>';
    ['#rss', '#rss2'].forEach(function (s) { var el = $q(s); if (el) el.innerHTML = chips + tools + body; });
    var tm = $q('#rssTime'), tm2 = $q('#rssTime2'); [tm, tm2].forEach(function (e) { if (e && ST.t) e.textContent = new Date(ST.t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); });
  }
  async function translate() {
    var todo = ST.items.filter(function (i) { return i.en && !ST.tr[i.title] && (ST.cat === 'all' || i.c === ST.cat); }).slice(0, 40); if (!todo.length) return;
    var el = $q('[data-wt]'); if (el) el.textContent = 'מתרגם…';
    try {
      var raw = await claude([{ role: 'user', content: JSON.stringify(todo.map(function (i) { return i.title; })) }], { system: 'תרגם כל כותרת חדשות פיננסית לעברית פשוטה וקצרה. החזר JSON בלבד: מערך מחרוזות באותו סדר ובאותו אורך. אל תוסיף מידע.', max_tokens: 3500, tier: 'cheap' });
      var a = parseJSON(raw); if (Array.isArray(a) && a.length === todo.length) { todo.forEach(function (i, k) { if (a[k] && typeof a[k] === 'string') ST.tr[i.title] = a[k]; }); try { localStorage.setItem('adir-wire-tr', JSON.stringify(ST.tr)); } catch (e) { } }
    } catch (e) { if (typeof toast === 'function') toast('התרגום נכשל: ' + e.message); }
    paint();
  }
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t.closest) return;
    var b = t.closest('[data-wc]'); if (b && b.closest('#rss, #rss2')) { ST.cat = b.dataset.wc; paint(); return; }
    var r = t.closest('[data-wr]'); if (r && r.closest('#rss, #rss2')) { e.preventDefault(); load(true); return; }
    var sq = t.closest('[data-wq]'); if (sq && sq.closest('#rss, #rss2')) { e.preventDefault(); S.squawk = !S.squawk; saveS(); ST.spoken = Date.now(); paint(); if (S.squawk && typeof toast === 'function') toast('הקריין יקריא כותרות חשובות חדשות: מאקרו, אנליסטים והמניות שלך'); return; }
    var ad = t.closest('[data-wa]'); if (ad && ad.closest('#rss, #rss2')) { e.preventDefault(); addSite(); return; }
    var tr = t.closest('[data-wt]'); if (tr && tr.closest('#rss, #rss2')) { e.preventDefault(); translate(); }
  });
  function speakNew() {
    if (!S.squawk || typeof speechSynthesis === 'undefined') return; var since = ST.spoken || 0, mine = {};
    try { (D.watch || []).forEach(function (w) { (w.items || []).forEach(function (t) { mine[t] = 1; }); }); (D.trades || []).forEach(function (t) { if (t.status !== 'closed') mine[t.ticker] = 1; }); } catch (e) { }
    var imp = /Fed|Powell|tariff|inflation|CPI|jobs|rate cut|Trump|upgrade|downgrade|פד|ריבית|אינפלציה|מכס|שדרוג|הורדת/i;
    var fresh = ST.items.filter(function (i) { return i.t > since && (i.c === 'macro' || i.c === 'an' || imp.test(i.title) || Object.keys(mine).some(function (k) { return k.length >= 3 && new RegExp('(^|[^A-Za-z])' + k + '([^A-Za-z]|$)').test(i.title); })); }).slice(0, 3);
    ST.spoken = Date.now();
    fresh.forEach(function (i) { var tx = ST.tr[i.title] || i.title, u = new SpeechSynthesisUtterance(tx); u.lang = /[֐-׿]/.test(tx) ? 'he-IL' : 'en-US'; speechSynthesis.speak(u); });
  }
  window.loadRSS = function () { return load(false); };
  function addSite() {
    var v = (prompt('כתובת אתר (למשל bizportal.co.il) או כתובת RSS:') || '').trim(); if (!v) return;
    var dom = /^https?:\/\/[^\/]+\/?$/.test(v) || !/^https?:/.test(v), h = v.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''), il = /\.co\.il$|\.org\.il$|themarker|calcalist/.test(h);
    CUSTOM.push({ n: dom ? h : v.replace(/^https?:\/\//, '').slice(0, 30), c: il ? 'il' : 'us', en: !il, gn: dom, u: dom ? g('site:' + h, il) : v });
    try { localStorage.setItem('adir-wire-custom', JSON.stringify(CUSTOM)); } catch (e) { } load(true);
  }
  window.__wire = { speakNew: speakNew, state: ST, load: load, FEEDS: FEEDS, feeds: feeds, add: function (x) { CUSTOM.push(x); load(true); } };
  document.querySelectorAll('h2').forEach(function (h) { if (/^מהעיתונות/.test(h.textContent.trim())) h.firstChild.textContent = 'חדשות הבורסה '; });
  setInterval(function () { load(false); }, 5 * 60e3); setTimeout(function () { load(false); }, 1200);
})();
