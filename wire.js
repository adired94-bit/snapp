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
  var CH = [['all', 'הכל'], ['il', 'ישראל'], ['us', 'ארה"ב'], ['macro', 'מאקרו ופוליטיקה'], ['an', 'אנליסטים']];
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
    var all = [], parts = await Promise.all(FEEDS.map(function (f) { return pull(f).then(function (a) { return a.slice(0, 25).map(function (i) { return { title: i.title, link: i.link, t: i.t, src: f.n, c: f.c, en: !!f.en && !isHe(i.title) }; }); }); }).concat([finnhub()]));
    parts.forEach(function (a) { all = all.concat(a); });
    var seen = {}, cut = Date.now() - 2 * 864e5;
    ST.items = all.filter(function (i) { if (!i.title || !/^https?:/.test(i.link)) return false; if (i.t && i.t < cut) return false; var k = i.title.toLowerCase().replace(/[^a-z0-9֐-׿]/g, '').slice(0, 60); if (seen[k]) return false; seen[k] = 1; i.en = i.en && !isHe(i.title); return true; })
      .sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
    ST.t = Date.now(); ST.busy = false; paint();
  }
  function paint() {
    var list = ST.items.filter(function (i) { return ST.cat === 'all' || i.c === ST.cat; }), cnt = {}; ST.items.forEach(function (i) { cnt[i.c] = (cnt[i.c] || 0) + 1; });
    var hasEn = list.some(function (i) { return i.en && !ST.tr[i.title]; });
    var chips = '<div class="tabs wire-tabs" style="margin:0 0 6px">' + CH.map(function (c) { return '<button data-wc="' + c[0] + '"' + (ST.cat === c[0] ? ' class="on"' : '') + '>' + c[1] + (c[0] === 'all' ? ' ' + ST.items.length : cnt[c[0]] ? ' ' + cnt[c[0]] : '') + '</button>'; }).join('') + '</div>';
    var tools = '<div class="wire-tools" style="display:flex;gap:10px;font-size:12px;color:var(--ink2);margin:0 2px 4px;align-items:center">' + (ST.t ? '<span>עודכן ' + new Date(ST.t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) + '</span>' : '') + '<a href="#" data-wr>רענן</a>' + (hasEn && typeof aiKey === 'function' && aiKey() ? '<a href="#" data-wt>תרגם לעברית</a>' : '') + '</div>';
    var body = ST.busy && !ST.items.length ? '<div class="empty">טוען חדשות מכל המקורות…</div>' : list.length ? list.slice(0, 80).map(function (i) {
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
    var tr = t.closest('[data-wt]'); if (tr && tr.closest('#rss, #rss2')) { e.preventDefault(); translate(); }
  });
  window.loadRSS = function () { return load(false); };
  window.__wire = { state: ST, load: load, FEEDS: FEEDS };
  document.querySelectorAll('h2').forEach(function (h) { if (/^מהעיתונות/.test(h.textContent.trim())) h.firstChild.textContent = 'חדשות הבורסה '; });
  setInterval(function () { load(false); }, 5 * 60e3); setTimeout(function () { load(false); }, 1200);
})();
