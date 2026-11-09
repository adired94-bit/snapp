/* מושך פידי RSS בצד השרת (בלי חסימות CORS ובלי שירותי צד שלישי מוגבלים) ומחזיר JSON.
   מותר רק לדומיינים של אתרי חדשות וכלכלה ידועים, כדי שזה לא יהיה פרוקסי פתוח. עד 6 פידים בבקשה. */
const ALLOW = ['globes.co.il', 'calcalist.co.il', 'bizportal.co.il', 'themarker.com', 'news.google.com', 'cnbc.com', 'dowjones.io', 'yahoo.com', 'seekingalpha.com', 'marketwatch.com', 'investing.com', 'reuters.com', 'benzinga.com', 'ynet.co.il', 'mako.co.il', 'maariv.co.il', 'israelhayom.co.il', 'funder.co.il', 'coindesk.com', 'cointelegraph.com'];
const ok = (h) => ALLOW.some((d) => h === d || h.endsWith('.' + d));
const dec = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').trim();
const tag = (x, t) => { const m = new RegExp('<' + t + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + t + '>', 'i').exec(x); return m ? dec(m[1]) : ''; };
function parse(xml) {
  const out = [], re = /<(item|entry)[\s>][\s\S]*?<\/\1>/gi; let m;
  while ((m = re.exec(xml)) && out.length < 60) {
    const b = m[0], title = tag(b, 'title'); let link = tag(b, 'link');
    if (!link) { const h = /<link[^>]*href=["']([^"']+)["']/i.exec(b); link = h ? h[1] : ''; }
    const d = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'), t = d ? Date.parse(d) : NaN;
    if (title && /^https?:/.test(link)) out.push({ title, link, t: isFinite(t) ? t : 0 });
  }
  return out;
}
async function one(u) {
  let host; try { host = new URL(u).hostname; } catch (e) { return { u, err: 'bad url', items: [] }; }
  if (!/^https:/.test(u) || !ok(host)) return { u, err: 'domain not allowed', items: [] };
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(u, { signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; TradingJournalFeed/1.0)', accept: 'application/rss+xml, application/xml, text/xml, */*' }, redirect: 'follow' });
    if (!r.ok) return { u, err: 'http ' + r.status, items: [] };
    return { u, items: parse(await r.text()) };
  } catch (e) { return { u, err: String(e.message || e), items: [] }; } finally { clearTimeout(to); }
}
exports.parse = parse; exports.ALLOW = ALLOW;
exports.handler = async (event) => {
  const q = event.multiValueQueryStringParameters || {}, urls = (q.u || []).slice(0, 6);
  if (!urls.length) return { statusCode: 400, body: JSON.stringify({ error: 'missing u' }) };
  const feeds = await Promise.all(urls.map(one));
  return { statusCode: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=120', 'access-control-allow-origin': '*' }, body: JSON.stringify({ feeds }) };
};
