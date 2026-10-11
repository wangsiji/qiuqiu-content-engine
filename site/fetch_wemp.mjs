// fetch_wemp.mjs — 从 we-mp-rss 服务器拉取公众号新文章并转 Markdown 入库
// 复用 fetch_wechat.mjs 的 md 清理规则，改从 we-mp-rss 的 /api/v1/wx/articles 拉取
// 用法: WEMP_ORIGIN="http://192.3.16.123:8001" WEMP_USER=admin WEMP_PASS=admin123 node site/fetch_wemp.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ORIGIN = (process.env.WEMP_ORIGIN || '').replace(/\/$/, '');
const USER = process.env.WEMP_USER || 'admin';
const PASS = process.env.WEMP_PASS || 'admin123';
const CONTENT = path.join(ROOT, 'content', '公众号');

// 从微信原始页取真实发布时间：优先 createTime（字符串日期），fallback var ct 时间戳，最后用发布接口时间
// ponytail: 每篇详情后额外一次 mp.weixin fetch。公众号文章一天几篇，可接受；量大再改并发/缓存。
async function fetchRealDate(url, fallbackDate) {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: ac.signal
    });
    clearTimeout(t);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const h = await r.text();
    // 微信发布时间的多种真实格式（按优先级）：
    //   create_time: '2026-09-18 12:36'
    //   createTime = "2026-09-18 12:36"
    //   ct = '1789706202'  （裸 ct，无 var 前缀）
    //   createTime = '1789706202'
    let m1 = h.match(/create_time\s*:\s*["']([0-9]{4}-\d{2}-\d{2}[^"']*)["']/);
    if (m1) return m1[1].slice(0, 10);
    m1 = h.match(/createTime\s*=\s*["']([0-9]{4}-\d{2}-\d{2}[^"']*)["']/);
    if (m1) return m1[1].slice(0, 10);
    const mct = h.match(/createTime\s*=\s*['"]?([0-9]{7,12})['"]?/) || h.match(/ct\s*=\s*['"]?([0-9]{7,12})['"]/);
    if (mct) return unixToDate(Number(mct[1]));
  } catch (e) { /* fallback 到接口时间 */ }
  return fallbackDate;
}

// mp_id -> 文件夹映射（feed.mp_name 判断）；未命中回退《秋秋在分享》
function folderOf(mpId, mpName) {
  const n = String(mpName || '');
  if (n.includes('开心')) return '《秋秋很开心》';
  if (n.includes('分享')) return '《秋秋在分享》';
  // 由 mp_id 前缀补判：用户实际添加的是「秋千不上班」等，归到在分享
  return '《秋秋在分享》';
}

async function getJson(url, token) {
  const r = await fetch(url, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  return r.json();
}

// 清理 HTML -> markdown（与 fetch_wechat.mjs 相同的规则）
function htmlToMd(html) {
  return String(html || '')
    .replace(/<img[^>]+data-src="([^"]+)"[^>]*>/gi, '![]($1)')
    .replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, '![]($1)')
    .replace(/<p[^>]*>/gi, '\n\n').replace(/<\/p>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<section[^>]*>/gi, '\n\n').replace(/<\/section>/gi, '')
    .replace(/<h[1-6][^>]*>/gi, '\n\n## ').replace(/<\/h[1-6]>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n').trim();
}

const known = new Set();
function collect(dir, set) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) collect(p, set);
    else if (f.name.endsWith('.md')) {
      const t = fs.readFileSync(p, 'utf8');
      // 正文为空的占位文件不算"已知"——上游补上正文后要能重新入库补写正文
      if (/^<!--\s*PENDING_BODY\s*-->$/m.test(t)) return;
      const m = t.match(/^source:\s*(.+)$/m);
      if (m) set.add(m[1].trim());
    }
  }
}
collect(path.join(CONTENT, '《秋秋很开心》'), known);
collect(path.join(CONTENT, '《秋秋在分享》'), known);

const unixToDate = (sec) => {
  if (!sec) return null;
  const d = new Date(Number(sec) * 1000);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
};

(async () => {
  if (!ORIGIN) { console.error('请设置 WEMP_ORIGIN'); process.exit(1); }
  // 登录
  const body = new URLSearchParams({ username: USER, password: PASS }).toString();
  const lr = await fetch(ORIGIN + '/api/v1/wx/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!lr.ok) throw new Error('登录失败 ' + lr.status);
  const token = (await lr.json()).data.access_token;

  // 2. 拉文章列表（跨所有公众号）
  const listJson = await getJson(ORIGIN + '/api/v1/wx/articles?limit=100&offset=0', token);
  const list = (listJson.data?.list) || [];

  let added = 0;
  for (const it of list) {
    const link = it.url || '';
    if (!/mp\.weixin\.qq\.com/.test(link) || known.has(link)) continue;
    // 用微信原始页里的 createTime 作真实发布时间；取不到再用接口时间（fallback）
    const date = await fetchRealDate(link, unixToDate(it.publish_time));
    if (!date) continue;
    const title = String(it.title || '').trim();
    if (!title) continue;

    // 3. 取正文
    const detail = await getJson(ORIGIN + '/api/v1/wx/articles/' + it.id + '?content=true', token);
    const html = detail.data?.content || '';
    const bodyMd = htmlToMd(html);

    // 4. 写 md（无正文时写占位文件，不丢文章；上游补正文后会被重新入库覆盖）
    const folder = folderOf(it.mp_id, it.mp_name);
    const dir = path.join(CONTENT, folder);
    fs.mkdirSync(dir, { recursive: true });
    const fname = date.replace(/-/g, '') + '-' + title.replace(/[\\/:*?"<>|]/g, '').slice(0, 80) + '.md';
    const body = bodyMd || '<!-- PENDING_BODY -->\n\n> 正文尚未抓取到，可在微信原文查看。\n\n[阅读原文](' + link + ')';
    const md = '---\ntitle: "' + title.replace(/"/g, '\\"') + '"\nsource: ' + link + '\ndate: ' + date + '\n---\n\n' + body;
    fs.writeFileSync(path.join(dir, fname), md);
    known.add(link);
    added++;
    console.log(bodyMd ? '入库:' : '入库(无正文占位):', folder + '/' + fname);
  }
  console.log('done. added =', added);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });