/* אפקטים חיים: מצב השוק בכותרת, הבהוב מחירים, מספרים בתנועה */
(function () {
  'use strict';
  /* מצב שוק (שעון ניו יורק) */
  function sessText() {
    var ph = AT.session.phase(Date.now()), left = ph.left, txt;
    if (ph.key === 'closed') { var mo = AT.session.minutesToOpen(Date.now()); txt = mo != null ? 'פתיחה בעוד ' + Math.floor(mo / 60) + 'ש ' + (mo % 60) + 'ד' : ph.label; }
    else txt = ph.label + (left ? ' · עוד ' + left + 'ד' : '');
    return { cls: ph.entry, txt: txt, title: ph.note };
  }
  function tick() {
    var el = document.getElementById('sess'); if (!el) return;
    var s = sessText(); el.className = s.cls; el.title = s.title; el.lastChild.textContent = s.txt;
  }
  var hs = document.querySelector('header .hs');
  if (hs && !document.getElementById('sess')) {
    var p = document.createElement('div'); p.id = 'sess'; p.innerHTML = '<i></i><span></span>';
    hs.insertBefore(p, hs.firstChild); tick(); setInterval(tick, 30000);
  }
  /* הבהוב כשמחיר משתנה ברשימת המעקב */
  var prev = {};
  function flash() {
    document.querySelectorAll('#wl .wl-row[data-t]').forEach(function (row) {
      var t = row.dataset.t, el = row.querySelector('.px'); if (!el) return;
      var v = parseFloat(el.textContent.replace(/,/g, '')); if (!isFinite(v)) return;
      var o = prev[t]; prev[t] = v;
      if (o != null && v !== o) { var c = v > o ? 'flash-up' : 'flash-down'; el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth; el.classList.add(c); }
    });
  }
  var wl = document.getElementById('wl');
  if (wl) new MutationObserver(function () { requestAnimationFrame(flash); }).observe(wl, { childList: true, subtree: true });
})();
