/* אמינות סנכרון המפתחות בין מכשירים.
   1) תיעוד תוצאת כל קריאה לענן (סטטוס והודעה), כדי שכשל לא יהיה שקט.
   2) אימות: אחרי שמירת הכספת קוראים אותה בחזרה מהענן ומוודאים שהיא שם.
   3) בקשת קוד אוטומטית: יש מפתחות במכשיר ואין כספת בענן, למשל כי המפתחות הוזנו לפני שהכספת נוספה.
   4) מכשיר חדש בלי כספת בענן מקבל הסבר ברור במקום חלון מפתחות "סתם".
   5) כפתור "בדיקת סנכרון ענן" בהגדרות. */
(function () {
  'use strict';
  var $q = function (s) { return document.querySelector(s); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var LAST = { get: null, put: null, vault: null };
  function hint(st, msg) {
    if (st === 401 || st === 403) return 'ההרשאות ב-Supabase חוסמות את הפעולה (RLS או מפתח לא תקין).';
    if (st === 404) return 'הטבלה trading_journal לא קיימת ב-Supabase.';
    if (st === 0 || st == null) return 'אין חיבור לענן: חסימת רשת, VPN או חסם פרסומות. (' + (msg || '') + ')';
    return 'הענן החזיר ' + st + (msg ? ': ' + String(msg).slice(0, 100) : '');
  }
  var tell = function (r) { return r && r.ok ? 'תקין' : hint(r && r.status, r && r.msg); };

  /* ---------- קריאה וכתיבה עם תיעוד ---------- */
  sbGet = async function () {
    if (!SB) return null;
    try {
      var r = await fetch(SUPABASE_URL + '/rest/v1/trading_journal?id=eq.' + ROW_ID + '&select=data', { headers: sbHeaders });
      LAST.get = { ok: r.ok, status: r.status };
      if (!r.ok) { LAST.get.msg = (await r.text().catch(function () { return ''; })).slice(0, 200); return null; }
      var rows = await r.json(); LAST.get.rows = rows.length; return rows[0] ? rows[0].data : null;
    } catch (e) { LAST.get = { ok: false, status: 0, msg: e.message }; return null; }
  };
  sbPut = async function (d) {
    if (!SB) { LAST.put = { ok: false, status: 0, msg: 'Supabase לא מוגדר' }; return false; }
    try {
      var r = await fetch(SUPABASE_URL + '/rest/v1/trading_journal', { method: 'POST', headers: Object.assign({}, sbHeaders, { Prefer: 'resolution=merge-duplicates' }), body: JSON.stringify({ id: ROW_ID, data: d, updated_at: new Date().toISOString() }) });
      LAST.put = { ok: r.ok, status: r.status }; if (!r.ok) LAST.put.msg = (await r.text().catch(function () { return ''; })).slice(0, 200); return r.ok;
    } catch (e) { LAST.put = { ok: false, status: 0, msg: e.message }; return false; }
  };

  /* ---------- שמירת כספת עם אימות ---------- */
  vaultSync = async function (quiet) {
    if (!S.vp || !D || !SB) return false;
    try {
      D.vault = await vaultSeal(S.vp);
      await save();
      if (!LAST.put || !LAST.put.ok) { LAST.vault = { ok: false, why: 'כתיבה: ' + tell(LAST.put) }; if (!quiet) toast('הכספת לא נשמרה בענן. ' + tell(LAST.put)); return false; }
      var back = await sbGet();
      var ok = !!(back && back.vault && back.vault.at === D.vault.at);
      LAST.vault = ok ? { ok: true, at: D.vault.at } : { ok: false, why: back ? 'נשמר אבל הכספת לא חזרה בקריאה' : 'קריאה: ' + tell(LAST.get) };
      if (!quiet) toast(ok ? '✓ המפתחות שמורים בענן ואומתו. במכשיר אחר יתבקש רק הקוד' : 'לא הצלחתי לאמת את הכספת בענן. ' + LAST.vault.why);
      return ok;
    } catch (e) { LAST.vault = { ok: false, why: e.message }; if (!quiet) toast('סנכרון המפתחות נכשל: ' + e.message); return false; }
  };

  /* ---------- בקשת קוד אוטומטית ---------- */
  function offer() {
    if (!D || !SB || $q('#wiz') || $q('#syncOffer')) return;
    var hasKeys = !!(S.anth || S.gem || S.td || S.fh);
    if (!hasKeys || D.vault) return;
    if (S.vp) { vaultSync(true).then(function (ok) { if (!ok) toast('הכספת לא נשמרה בענן. פתח הגדרות ← בדיקת סנכרון ענן'); }); return; }
    if (S.vpAsk && Date.now() - S.vpAsk < 3 * 864e5) return;
    var box = document.createElement('div'); box.className = 'modal on'; box.id = 'syncOffer';
    box.innerHTML = '<div class="box"><h3>🔐 המפתחות שלך לא מסונכרנים</h3><div class="hint" style="margin-bottom:10px">המפתחות שמורים רק במכשיר הזה, ולכן בכל מחשב אחר תתבקש להזין אותם מחדש. בחר קוד קצר (לפחות 6 תווים). המפתחות יוצפנו ויישמרו בענן, ובמכשיר אחר תצטרך להקליד רק את הקוד.</div><div class="set"><label>קוד סנכרון</label><input id="soCode" type="text" autocomplete="off" autocapitalize="off" placeholder="למשל abc123x1"><button class="btn" id="soOk" style="margin-top:14px">שמור וסנכרן</button><button class="btn ghost" id="soNo" style="margin-top:8px">לא עכשיו</button></div></div>';
    document.body.appendChild(box);
    $q('#soNo').onclick = function () { S.vpAsk = Date.now(); saveS(); box.remove(); };
    $q('#soOk').onclick = async function () {
      var v = $q('#soCode').value.trim(); if (v.length < 6) return toast('קוד סנכרון: לפחות 6 תווים');
      S.vp = v; saveS(); loadSettingsUI(); box.remove(); await vaultSync(false);
    };
  }

  /* ---------- מכשיר חדש בלי כספת: הסבר ---------- */
  var _fr = firstRun;
  firstRun = function (manual) {
    _fr(manual);
    var w = $q('#wiz'); if (!w || w.querySelector('#wizAlert') || (D && D.vault)) return;
    var why = function () { return !SB ? 'הסנכרון לענן לא מוגדר.' : LAST.get && !LAST.get.ok ? 'הענן לא ענה: ' + tell(LAST.get) : 'לא נמצאה כספת מפתחות בענן.'; };
    var tail = ' אם כבר הגדרת קוד במכשיר אחר, פתח שם ⚙️ הגדרות ← "בדיקת סנכרון ענן" וודא שהכספת נשמרה.';
    w.querySelector('.box').insertAdjacentHTML('afterbegin', '<div id="wizAlert" class="dp-flag warn" style="margin-bottom:10px">' + esc(why()) + tail + '</div>');
    /* הקריאה הראשונה בעת הטעינה קדמה לקובץ הזה ולכן לא תועדה. בודקים שוב כדי לדעת את הסיבה האמיתית */
    if (!LAST.get && SB) sbGet().then(function (data) { var a = $q('#wizAlert'); if (!a) return; if (data && data.vault) { a.textContent = 'נמצאה כספת בענן. רענן את הדף כדי להזין את הקוד.'; return; } a.textContent = why() + tail; });
  };

  /* ---------- בדיקת סנכרון בהגדרות ---------- */
  async function check() {
    var box = $q('#syncChk'); box.innerHTML = '<div class="dp-foot">בודק…</div>';
    var rows = [], add = function (ok, t, d) { rows.push('<li class="' + (ok === true ? 'ok' : ok === false ? 'no' : 'un') + '"><i>' + (ok === true ? '✓' : ok === false ? '✕' : '!') + '</i><div>' + esc(t) + (d ? '<small>' + esc(d) + '</small>' : '') + '</div></li>'); };
    if (!SB) { add(false, 'חיבור לענן', 'Supabase לא מוגדר'); box.innerHTML = '<ul class="dp-gates">' + rows.join('') + '</ul>'; return; }
    var data = await sbGet();
    add(!!(LAST.get && LAST.get.ok), 'חיבור לענן (קריאה)', tell(LAST.get));
    if (LAST.get && LAST.get.ok) {
      add(LAST.get.rows > 0, 'יש יומן בענן', LAST.get.rows > 0 ? 'נמצא' : 'עוד לא נשמר כלום בענן');
      add(!!(data && data.vault), 'כספת מפתחות בענן', data && data.vault ? 'נשמרה ב-' + new Date(data.vault.at).toLocaleString('he-IL') : 'לא נמצאה. לחץ "שמור כספת עכשיו"');
    }
    add(S.vp ? true : null, 'קוד סנכרון במכשיר הזה', S.vp ? 'מוגדר' : 'לא מוגדר. הזן קוד למעלה ושמור הגדרות');
    box.innerHTML = '<ul class="dp-gates">' + rows.join('') + '</ul>';
  }
  function injectSettings() {
    var v = $q('#sVp'); if (!v || $q('#syncChkW')) return;
    var h = v.nextElementSibling; var w = document.createElement('div'); w.id = 'syncChkW'; w.style.margin = '8px 0 4px';
    w.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost small" id="syncChkGo">☁️ בדיקת סנכרון ענן</button><button class="btn small" id="syncNow">שמור כספת עכשיו</button></div><div id="syncChk" style="margin-top:10px"></div>';
    (h || v).insertAdjacentElement('afterend', w);
    $q('#syncChkGo').onclick = check;
    $q('#syncNow').onclick = async function () { var cv = $q('#sVp').value.trim(); if (cv.length >= 6) { S.vp = cv; saveS(); } if (!S.vp || S.vp.length < 6) return toast('הזן קוד סנכרון (6 תווים לפחות) ושמור הגדרות'); var ok = await vaultSync(false); await check(); return ok; };
  }
  injectSettings();
  var wait = setInterval(function () { if (typeof D !== 'undefined' && D) { clearInterval(wait); setTimeout(offer, 3500); } }, 400);
  window.__sync = { LAST: LAST, offer: offer, check: check, hint: hint };
})();
