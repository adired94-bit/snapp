/* מסך "שוק": ווידג'טים של TradingView לצפייה (סקירה, סורק, מפת חום, יומן כלכלי, חדשות),
   עם גשר לסריקת המניות: מדביקים סימולים ומקבלים לונג / שורט והחלטה. */
(function () {
  'use strict';
  var $q = function (s) { return document.querySelector(s); };
  function build() {
    if ($q('#p-mkt')) return;
    var s2 = document.createElement('section'); s2.className = 'page'; s2.id = 'p-mkt';
    s2.innerHTML = '<div class="tabs" id="mkTabs" style="margin:6px 0 10px"></div><div class="dp-card mk-wrap"><div id="mkBox" class="mk-box"></div></div>' +
      '<div class="dp-card"><h3>נתח מניות מהסורק</h3><textarea id="mkTxt" class="sm-txt" rows="2" dir="ltr" placeholder="הדבק כאן סימולים מהסורק או ממפת החום"></textarea><div class="dp-actions" style="grid-template-columns:1fr"><button class="btn" id="mkGo">נתח</button></div></div>' +
      '<div class="dp-foot" style="text-align:right">הווידג\'טים של TradingView הם לצפייה בלבד, בנתונים מושהים בבורסות רבות. הם נטענים מהשרתים של TradingView.</div>';
    document.querySelector('main').appendChild(s2);
    var W = [['ov', 'סקירה', 'embed-widget-market-overview.js', { colorTheme: 'dark', dateRange: '1D', showChart: true, locale: 'he_IL', width: '100%', height: 560, isTransparent: true, showSymbolLogo: true, showFloatingTooltip: false, tabs: [{ title: 'ארה"ב', symbols: [{ s: 'FOREXCOM:SPXUSD', d: 'S&P 500' }, { s: 'FOREXCOM:NSXUSD', d: 'נאסד"ק 100' }, { s: 'NASDAQ:IXIC', d: 'נאסד"ק קומפוזיט' }, { s: 'FOREXCOM:DJI', d: 'דאו ג\'ונס' }, { s: 'CAPITALCOM:RTY', d: 'ראסל 2000' }, { s: 'CAPITALCOM:VIX', d: 'VIX מדד הפחד' }, { s: 'NASDAQ:SOX', d: 'שבבים SOX' }] }, { title: 'ישראל', symbols: [{ s: 'TASE:TA35', d: 'ת"א 35' }, { s: 'TASE:TA125', d: 'ת"א 125' }, { s: 'TASE:TA90', d: 'ת"א 90' }, { s: 'FX_IDC:USDILS', d: 'דולר/שקל' }] }, { title: 'עולם', symbols: [{ s: 'XETR:DAX', d: 'דאקס' }, { s: 'FTSE:UKX', d: 'פוטסי' }, { s: 'TVC:NI225', d: 'ניקיי' }, { s: 'TVC:HSI', d: 'האנג סנג' }] }, { title: 'מאקרו', symbols: [{ s: 'TVC:DXY', d: 'מדד הדולר' }, { s: 'TVC:US10Y', d: 'תשואה 10 שנים' }, { s: 'TVC:GOLD', d: 'זהב' }, { s: 'TVC:USOIL', d: 'נפט' }, { s: 'BITSTAMP:BTCUSD', d: 'ביטקוין' }, { s: 'BITSTAMP:ETHUSD', d: 'אתריום' }] }] }],
      ['sc', 'סורק', 'embed-widget-screener.js', { width: '100%', height: 600, defaultColumn: 'overview', defaultScreen: 'most_capitalized', market: 'america', showToolbar: true, colorTheme: 'dark', locale: 'he_IL', isTransparent: true }],
      ['hm', 'מפת חום', 'embed-widget-stock-heatmap.js', { exchanges: [], dataSource: 'SPX500', grouping: 'sector', blockSize: 'market_cap_basic', blockColor: 'change', locale: 'he_IL', symbolUrl: '', colorTheme: 'dark', hasTopBar: true, isDataSetEnabled: false, isZoomEnabled: true, hasSymbolTooltip: true, isMonoSize: false, width: '100%', height: 560 }],
      ['ec', 'יומן כלכלי', 'embed-widget-events.js', { colorTheme: 'dark', isTransparent: true, width: '100%', height: 560, locale: 'he_IL', importanceFilter: '0,1', countryFilter: 'us' }],
      ['nw', 'חדשות', 'embed-widget-timeline.js', { feedMode: 'market', market: 'stock', isTransparent: true, displayMode: 'regular', width: '100%', height: 560, colorTheme: 'dark', locale: 'he_IL' }]];
    var cur = null;
    function show(k) { cur = k; var w = W.filter(function (x) { return x[0] === k; })[0]; $q('#mkTabs').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.k === k); }); tv('mkBox', w[2], w[3]); }
    $q('#mkTabs').innerHTML = W.map(function (x) { return '<button data-k="' + x[0] + '">' + x[1] + '</button>'; }).join('');
    $q('#mkTabs').querySelectorAll('button').forEach(function (b) { b.onclick = function () { show(b.dataset.k); }; });
    $q('#mkGo').onclick = function () { var t = (window.__scan ? window.__scan.parseSyms($q('#mkTxt').value) : []); if (!t.length) return toast('הדבק לפחות סימול אחד'); window.runScan(t); };
    window.__mkShow = function () { if (!cur) show('sc'); };
  }
  build();
  GROUPS.scan.splice(0, 0, ['p-mkt', 'שוק']); PAGE_GROUP['p-mkt'] = 'scan';
  var _e = onEnter; onEnter = function (id) { _e(id); if (id === 'p-mkt') window.__mkShow(); };
})();
