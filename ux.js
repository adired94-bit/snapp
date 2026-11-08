/* פשטות ונגישות: ארבעה מסכים ברורים (בית, סריקה, ניתוח, תיק), חיפוש מניה אחד בכל עמוד,
   ארבעה כפתורים גדולים בבית, כפתורים גדולים וקריאים, ותוויות לקורא מסך. */
(function () {
  'use strict';
  var $q = function (s) { return document.querySelector(s); };
  var L = { 'p-morning': 'בית', 'p-brief': 'תדריך', 'p-news': 'חדשות', 'p-smart': 'סריקה', 'p-lvl': 'רמות', 'p-mkt': 'שוק', 'p-deep': 'ניתוח', 'p-today': 'גרף', 'p-calc': 'מחשבון', 'p-ai': 'מתמונה', 'p-plan': 'תוכניות', 'p-port': 'פוזיציות', 'p-journal': 'יומן', 'p-weekly': 'סיכום שבועי' };
  var G = { morning: ['p-morning', 'p-brief', 'p-news'], scan: ['p-smart', 'p-lvl', 'p-mkt'], trade: ['p-deep', 'p-today', 'p-calc', 'p-ai', 'p-plan'], port: ['p-port', 'p-journal', 'p-weekly'] };
  var NAV = { morning: 'בית', scan: 'סריקה', trade: 'ניתוח', port: 'תיק' };
  Object.keys(GROUPS).forEach(function (k) { delete GROUPS[k]; });
  Object.keys(PAGE_GROUP).forEach(function (k) { delete PAGE_GROUP[k]; });
  Object.keys(G).forEach(function (g) { GROUPS[g] = G[g].map(function (id) { return [id, L[id]]; }); G[g].forEach(function (id) { PAGE_GROUP[id] = g; }); });
  Object.keys(lastSub).forEach(function (k) { delete lastSub[k]; });

  /* לחיצה על מסך בסרגל תמיד פותחת את הדף הראשון שלו, כך ש"בית" תמיד מציג את הבית */
  navTo = function (g) { var id = GROUPS[g][0][0]; goPage(id); onEnter(id); };
  /* סרגל תחתון: ארבעה כפתורים בסדר העבודה */
  var nav = $q('nav'); if (nav) {
    var by = {}; nav.querySelectorAll('button').forEach(function (b) { by[b.dataset.g] = b; });
    ['journal', 'news'].forEach(function (g) { if (by[g]) by[g].parentNode.removeChild(by[g]); });
    ['morning', 'scan', 'trade', 'port'].forEach(function (g) { var b = by[g]; if (!b) return; nav.appendChild(b); b.lastChild.textContent = NAV[g]; b.setAttribute('aria-label', NAV[g]); });
    nav.setAttribute('aria-label', 'ניווט ראשי');
  }
  var fab = $q('#chatFab'); if (fab) fab.setAttribute('aria-label', 'שאל את היומן');
  var gear = $q('#gearBtn'); if (gear) gear.setAttribute('aria-label', 'הגדרות');

  /* חיפוש מניה אחד, בכל עמוד: מקלידים סימול ומקבלים ניתוח מלא */
  var main = document.querySelector('main'), sub = $q('#subnav');
  if (main && sub && !$q('#qs')) {
    var f = document.createElement('form'); f.id = 'qs'; f.setAttribute('role', 'search');
    f.innerHTML = '<input id="qsIn" list="qsList" dir="ltr" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="סימול מניה לניתוח" placeholder="נתח מניה: הקלד סימול (MU, NVDA…)"><button class="btn" type="submit">נתח</button><datalist id="qsList"></datalist>';
    main.insertBefore(f, sub);
    f.onsubmit = function (e) { e.preventDefault(); var v = $q('#qsIn').value.toUpperCase().replace(/[^A-Z0-9.:\/-]/g, ''); if (!v) { if (typeof toast === 'function') toast('הקלד סימול מניה'); $q('#qsIn').focus(); return; } $q('#qsIn').blur(); window.openDeep(v); $q('#qsIn').value = ''; };
    var fill = function () { var set = {}; try { (D.watch || []).forEach(function (w) { (w.items || []).forEach(function (t) { set[t] = 1; }); }); (D.trades || []).forEach(function (t) { if (t.status !== 'closed') set[t.ticker] = 1; }); } catch (e) { } $q('#qsList').innerHTML = Object.keys(set).slice(0, 60).map(function (t) { return '<option value="' + t + '">'; }).join(''); };
    $q('#qsIn').addEventListener('focus', fill);
  }

  /* בית: ארבע פעולות גדולות במקום פס הקישורים */
  var hj = $q('#homeJump');
  if (hj) {
    hj.className = 'qa-strip'; hj.removeAttribute('style');
    hj.innerHTML = '<button data-go="p-smart"><b>סרוק עכשיו</b><small>המניות הכי מעניינות</small></button><button data-go="p-brief"><b>תדריך בוקר</b><small>שוק, יומן, חדשות, רדאר</small></button><button data-focus="1"><b>נתח מניה</b><small>לונג, שורט או להמתין</small></button><button data-go="p-calc"><b>מחשבון עסקה</b><small>גודל פוזיציה וסטופ</small></button>';
    hj.onclick = function (e) { var b = e.target.closest('button'); if (!b) return; if (b.dataset.go) { goPage(b.dataset.go); onEnter(b.dataset.go); } else { var i = $q('#qsIn'); i.scrollIntoView({ block: 'center' }); i.focus(); } };
  }
  /* גרסאות ישנות של הקישורים בתוך האתר מצביעות לקבוצות שאיחדנו: מוודאים שלא נשאר סימון פעיל על כפתור שנמחק */
  var g0 = PAGE_GROUP[(document.querySelector('section.page.on') || {}).id];
  if (g0) goPage(document.querySelector('section.page.on').id);
})();
