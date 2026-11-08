/* מגבלת קצב אחת לכל הקריאות ל-Twelve Data (התוכנית החינמית: 8 קרדיטים בדקה). קודם כל חלק מהאתר פנה לספק בלי תיאום
   (מחירי גיבוי, גרפים, סריקה), ולכן הניתוח נתקל בשגיאה 429. עכשיו כל הקריאות עוברות דרך אותו שער, וקריאה של כמה
   סימולים בבת אחת נספרת כקרדיט לכל סימול. */
(function () {
  'use strict';
  var orig = window.fetch.bind(window); window.__origFetch = orig;
  function L(max, win) { this.max = max; this.win = win; this.q = []; this.now = function () { return Date.now(); }; this.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); }; }
  L.prototype.acquire = function () {
    var self = this;
    return (function loop() {
      var t = self.now(); self.q = self.q.filter(function (x) { return t - x < self.win; });
      if (self.q.length < self.max) { self.q.push(t); return Promise.resolve(); }
      return self.sleep(self.win - (t - self.q[0]) + 5).then(loop);
    })();
  };
  var td = new L(7, 60e3), fh = new L(50, 60e3); window.__tdLimiter = td; window.__fhLimiter = fh;
  window.fetch = function (u, init) {
    var url = typeof u === 'string' ? u : (u && u.url) || '';
    if (url.indexOf('api.twelvedata.com') < 0) return orig(u, init);
    var m = /[?&]symbol=([^&]+)/.exec(url), n = 1; if (m && /\/(quote|price)\b/.test(url)) n = Math.max(1, decodeURIComponent(m[1]).split(',').length);
    var p = Promise.resolve(); for (var i = 0; i < n; i++) p = p.then(function () { return td.acquire(); });
    return p.then(function () { return orig(u, init); }).then(function (r) { if (r.status === 429) { td.q = []; for (var k = 0; k < td.max; k++) td.q.push(Date.now()); } return r; });
  };
})();
