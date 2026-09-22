import fs from 'node:fs';
import path from 'node:path';
import { GHIBLI_CSS, GHIBLI_SKY, GHIBLI_FOOTER } from './theme.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'content/公众号/outputs/articles_data.json');
const OUT = path.join(import.meta.dirname, '..', 'docs');
const SITE_NAME = '秋秋很开心';

const articles = JSON.parse(fs.readFileSync(DATA, 'utf8'));

const clean = articles
  .filter(a => a && a.title && a.date)
  .map(a => ({
    filename: a.filename || '',
    account: (a.account || '秋秋很开心').trim(),
    title: (a.title || '').trim(),
    date: (a.date || '').slice(0, 10),
    description: (a.description || '').trim(),
    tags: Array.isArray(a.tags) ? a.tags.map(t => t.trim()).filter(Boolean) : [],
    source: a.source || '',
    word_count: Number(a.word_count) || 0,
    pillars: Array.isArray(a.pillars) ? a.pillars : [],
    content_type: Array.isArray(a.content_type) ? a.content_type[0] || '' : (a.content_type || ''),
    content_full: a.content_full || a.content_preview || '',
  }))
  .sort((a, b) => (a.date < b.date ? 1 : -1));

// 从原始 md 补充完整正文（保留图片）
const mdByFile = new Map();
for (const dir of [path.join(ROOT, 'content/公众号/《秋秋很开心》'), path.join(ROOT, 'content/公众号/《秋秋在分享》')]) {
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.md')) mdByFile.set(f, path.join(dir, f));
  }
}
let mdLoaded = 0;
for (const a of clean) {
  const fp = mdByFile.get(a.filename);
  if (!fp) continue;
  const text = fs.readFileSync(fp, 'utf8');
  const m = text.match(/^---[\s\S]*?---\s*([\s\S]*)$/);
  if (m) {
    a.content_full = m[1].trim() || a.content_full;
    mdLoaded++;
  }
}
console.log('md loaded:', mdLoaded, '/', clean.length);

const byYear = {};
for (const a of clean) { const y = a.date.slice(0,4); (byYear[y] ||= []).push(a); }
const years = Object.keys(byYear).sort().reverse();

const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
// 稳定 URL：基于 date + filename 生成，文章内容不变则 URL 永不变（新增文章不影响旧文章 URL）
const hashCode = str => { let h = 0; for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0; return Math.abs(h).toString(36).padStart(4, '0').slice(0, 4); };
const slug = a => { const base = a.date.replace(/-/g, ''); const key = (a.filename || a.source || a.title).replace(/\.md$/, ''); return '/post/' + base + '-' + hashCode(key) + '.html'; };

const CSS = GHIBLI_CSS;
const headerBar = (base = '') => `${GHIBLI_SKY}<header><div class="wrap"><a class="site-logo" href="${base}index.html">${SITE_NAME}</a><nav><a href="${base}about.html" class="nav-hl">我是谁</a><a href="${base}index.html">首页</a><a href="${base}topics.html">主题</a><a href="${base}map.html">内容地图</a><a href="${base}archive.html">全部文章</a><a href="${base}search.html">搜索</a></nav></div></header>`;
const footer = () => '<footer><div class="foot-nav"><a href="about.html">认识秋秋</a><a href="map.html">内容地图</a><a href="archive.html">全部文章</a><a href="opportunity.html">我会继续写什么</a><a href="rss.xml">RSS 订阅</a></div><div class="foot-line">© 2026 秋秋很开心 · 秋秋在分享 · 全部内容为秋秋原创，卡片可跳转公众号原文</div></footer>';
const page = (title, content, desc = '秋秋的个人网站，' + clean.length + ' 篇公众号历史文章存档', base = '', redirect = '') => `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><meta name="description" content="${desc}"><meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:type" content="website"><meta property="og:site_name" content="秋秋很开心"><meta property="og:image" content="https://wangsiji.github.io/qiuqiu-content-engine/og-card.svg"><meta name="twitter:card" content="summary">${redirect ? '<meta http-equiv="refresh" content="0;url=' + redirect + '">' : ''}<style>${CSS}</style></head><body>${headerBar(base)}<main class="wrap">${content}</main>${footer()}</body></html>`;
const hero = () => {
  const pillarSet = new Set(clean.flatMap(a => a.pillars || []));
  const typeSet = new Set(clean.map(a => a.content_type).filter(Boolean));
  return `<div class="hero"><h1>把人生写成一场公开实验</h1><p class="tagline">秋秋的个人网站 · ${clean.length} 篇公众号文章的完整存档</p><div class="stats"><span>${clean.length} 篇文章</span><span>${years.length} 年</span><span>${pillarSet.size} 大主题</span><span>${typeSet.size} 种内容类型</span></div><div class="hero-actions"><a class="btn" href="archive.html">阅读全部文章</a><a class="btn outline" href="map.html">内容地图</a></div></div>`;
}

// 行内 markdown 渲染（转义后补回强调/链接）
const inline = s => s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]\n]+)\](https?:\/\/[^)\s]+)/g, '<a class="linkout" href="$2" target="_blank" rel="noopener">$1</a>');

const renderMD = md => {
  const htmlLines = [];
  for (const raw of (md || '').split(/\r?\n/)) {
    const t = raw.trim();
    if (!t || t === '---') continue;
    if (t.startsWith('# ')) htmlLines.push('<h3>' + esc(t.slice(2)) + '</h3>');
    else if (t.startsWith('## ')) htmlLines.push('<h3>' + esc(t.slice(3)) + '</h3>');
    else if (t.startsWith('### ')) htmlLines.push('<h4>' + esc(t.slice(4)) + '</h4>');
    else if (t.startsWith('![')) { const m = t.match(/!\[.*?\]\((.*?)\)/); htmlLines.push(m ? '<img loading="lazy" src="' + m[1] + '" alt="">' : ''); }
    else if (t.startsWith('>')) htmlLines.push('<blockquote>' + inline(esc(t.slice(1).trim())) + '</blockquote>');
    else if (t.startsWith('- ') || t.startsWith('* ')) htmlLines.push('<p>· ' + inline(esc(t.slice(2))) + '</p>');
    else htmlLines.push('<p>' + inline(esc(t)) + '</p>');
  }
  return htmlLines.join('\n');
};

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'post'), { recursive: true });

for (const a of clean) a._url = slug(a);

const safeHref = (a, base) => a.source ? a.source : (base + a._url.replace(/^\//, ''));
const card = (a, base='') => `<a class="card" href="${safeHref(a, base)}" target="_blank" rel="noopener"><div class="card-meta"><time>${a.date}</time><span class="acct">${esc(a.account)}</span></div><h3>${esc(a.title)}</h3><p>${esc(a.description.slice(0,90))}</p><div class="tags">${a.tags.slice(0,3).map(t=>'<span>'+esc(t.split('/').pop())+'</span>').join('')}</div></a>`;

for (const a of clean) {
  const jumpTip = a.source ? `<div class="jump-banner"><p>本文正在跳转到公众号原文…</p><a class="btn" href="${esc(a.source)}" target="_blank" rel="noopener">如果未自动跳转，请点击这里</a></div>` : '';
  const srcFooter = a.source ? `<div class="post-footer"><a href="${esc(a.source)}" target="_blank" rel="noopener">在公众号阅读原文</a></div>` : `<div class="post-footer"><span style="color:#9b9083;font-size:13px;">本文为站内原创存档，无公众号原文链接</span></div>`;
  const body = `<article class="post">${jumpTip}<a class="back" href="../index.html">← 返回首页</a><h1 class="post-title">${esc(a.title)}</h1><div class="post-meta"><time>${a.date}</time> · ${esc(a.account)} · ${a.word_count} 字 · 约${Math.max(1, Math.round(a.word_count / 400))} 分钟阅读</div><p class="post-desc">${esc(a.description)}</p><div class="post-body">${renderMD(a.content_full)}</div>${srcFooter}</article>`;
  fs.writeFileSync(path.join(OUT, a._url.replace(/^\//, '')), page(a.title + ' · ' + SITE_NAME, body, a.description, '../', a.source));
}
// 上一篇/下一篇（时间倒序，为相邻文章补充导航）
for (let i = 0; i < clean.length; i++) {
  const a = clean[i];
  const prev = i > 0 ? clean[i - 1] : null;
  const next = i < clean.length - 1 ? clean[i + 1] : null;
  const fn = path.join(OUT, a._url.replace(/^\//, ''));
  let h = fs.readFileSync(fn, 'utf8');
  const nav = `<nav class="post-nav"><div class="post-nav-item">${prev ? '<a href="' + prev._url.split('/').pop() + '">← ' + esc(prev.title) + '</a>' : '<span>已经是第一篇</span>'}</div><div class="post-nav-item right">${next ? '<a href="' + next._url.split('/').pop() + '">' + esc(next.title) + ' →</a>' : '<span>已经是最新一篇</span>'}</div></nav>`;
  h = h.replace('<div class="post-footer">', nav + '<div class="post-footer">');
  fs.writeFileSync(fn, h);
}
fs.writeFileSync(path.join(OUT, 'urls.json'), JSON.stringify(clean.map(a => ({ filename: a.filename, url: a._url }))));

const recentCards = clean.slice(0, 12).map(card).join('');
const portalCards = [
  ['map.html','🗺️','内容地图','看看这些年我到底写了什么主题'],
  ['timeline.html','📅','时间线','从 2018 到 2026 的内容演化'],
  ['opportunity.html','💡','选题机会','我还没写透的几个问题'],
  ['workbench.html','🎯','选题工作台','今天值得写什么 · 内容配比'],
  ['potential.html','🔄','多平台改写','把好文章改到别的平台'],
  ['archive.html','📚','全部文章','全部篇存档'],
].map(([href,ic,title,desc]) => `<a class="portal" href="${href}"><div class="p-ic">${ic}</div><div class="p-txt"><div class="p-h">${title}</div><div class="p-d">${desc}</div></div></a>`).join('');
const recentSection = `<h2 class="year-head">最新发表</h2><div class="grid">${recentCards}</div><div style="text-align:center;margin:26px 0 40px"><a class="btn outline" href="archive.html">查看全部文章 →</a></div>`;
const idxHtml = page('秋秋的个人网站', hero() + `<div class="portal-grid">${portalCards}</div>` + recentSection);
fs.writeFileSync(path.join(OUT, 'index.html'), idxHtml.replace('</style>', '<style>.portal-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin:8px 0 6px}.portal{display:flex;gap:14px;align-items:center;background:var(--paper);border:1.5px solid var(--line);border-radius:18px 10px 18px 10px;padding:15px 18px;transition:.25s}.portal:hover{transform:translateY(-3px);border-color:var(--green);box-shadow:var(--shadow)}.p-ic{font-size:24px;line-height:1}.p-h{font-size:15px;font-weight:800;color:var(--green-deep)}.p-d{font-size:12.5px;color:var(--brown);margin-top:2px}</style>'));
fs.writeFileSync(path.join(OUT, 'archive.html'), page('全部文章 · ' + SITE_NAME, hero() + '<div class="grid">' + clean.map(card).join('') + '</div>'));
fs.writeFileSync(path.join(OUT, 'about.html'), page('关于 · ' + SITE_NAME, '<div class="hero"><h1>关于</h1><p class="tagline">这里是秋秋。公众号「秋秋很开心」「秋秋在分享」，用文字记录学习、读书、旅行和日子。</p></div>'));


// SEO: sitemap / robots / RSS
const baseUrl = 'https://wangsiji.github.io/qiuqiu-content-engine';
const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${baseUrl}/</loc></url><url><loc>${baseUrl}/topics.html</loc></url><url><loc>${baseUrl}/map.html</loc></url><url><loc>${baseUrl}/opportunity.html</loc></url><url><loc>${baseUrl}/atoms.html</loc></url><url><loc>${baseUrl}/archive.html</loc></url><url><loc>${baseUrl}/about.html</loc></url>${clean.map(a => '<url><loc>' + baseUrl + a._url + '</loc></url>').join('')}</urlset>`;
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sitemap);
fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: ' + baseUrl + '/sitemap.xml\n');
const rssItems = clean.slice(0, 20).map(a => `<item><title>${esc(a.title)}</title><link>${baseUrl}${a._url}</link><description>${esc(a.description.slice(0, 200))}</description><pubDate>${new Date(a.date + 'T00:00:00Z').toUTCString()}</pubDate></item>`).join('');
const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${SITE_NAME}</title><link>${baseUrl}/</link><description>秋秋的个人网站</description>${rssItems}</channel></rss>`;
fs.writeFileSync(path.join(OUT, 'rss.xml'), rss);

console.log('DONE', clean.length, 'posts');
