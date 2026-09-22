import fs from 'node:fs';
import path from 'node:path';
const OUT = path.join(import.meta.dirname, '..', 'docs');
const DATA = path.join(OUT, '..', 'content/公众号/outputs/articles_data.json');
const RAW = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const TOTAL = RAW.length; // 全部文章数（含无公众号源的文章）
const clean = RAW
  .filter(a => a && a.title && a.date)
  .map(a => ({
    title: (a.title||'').trim(),
    date: (a.date||'').slice(0,10),
    account: (a.account||'').trim(),
    tags: (Array.isArray(a.tags)?a.tags.map(t=>t.trim()).filter(Boolean):[]).map(t=>t.includes('/')?t.split('/').pop():t).slice(0,3),
    source: a.source||'',
    pillars: Array.isArray(a.pillars)?a.pillars.map(x=>x.charAt(0).toUpperCase()+x.slice(1)):[],
    content_type: Array.isArray(a.content_type)?a.content_type[0]:''
  }))
  .filter(a => a.title && a.source)
  .sort((a,b)=> a.date < b.date ? 1 : -1);
const esc = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const SITE = 'https://wangsiji.github.io/qiuqiu-content-engine';
const EXTRA_CSS = '.searchbar{display:flex;justify-content:center;gap:10px;margin:28px 0 6px;} .searchbar input{width:min(480px,100%);padding:12px 20px;border:1px solid #e7dcc4;border-radius:99px;font-size:15px;background:#fffdf9;outline:none;box-sizing:border-box;} .searchbar input:focus{border-color:#d2593a;} .searchbar button{background:#b8482c;color:#fff;border:none;border-radius:99px;padding:0 24px;font-size:15px;cursor:pointer;} .searchbar button:hover{opacity:.88;} .search-hint{font-size:13px;color:#9b9088;text-align:center;margin:12px 0 0;} ';
const PAGES = ['index.html','topics.html','archive.html','about.html','404.html'];
const POSTS = fs.readdirSync(path.join(OUT,'post')).filter(f=>f.endsWith('.html'));
// 先生成 search.html（基于首页模板）
const home = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const skyMatch = home.match(/<div class="sky">[\s\S]*?<\/header>/);
const header = skyMatch ? skyMatch[0] : home.match(/<header>[\s\S]*?<\/header>/)[0];
const footer = home.match(/<footer>[\s\S]*?<\/footer>/)[0];
const cssBlock = home.match(/<style>[\s\S]*?<\/style>/)[0];
const searchHtml = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>搜索 · 秋秋很开心</title><meta name="description" content="搜索秋秋的公众号历史文章">' + cssBlock.replace('</style>', EXTRA_CSS + '</style>') + '<link rel="icon" href="favicon.svg" type="image/svg+xml"></head><body>' + header.replace('<a href="about.html">关于</a>', '<a href="about.html">关于</a><a href="search.html">搜索</a>') + '<main class="wrap"><h2 class="year-head">搜索文章</h2><div class="searchbar"><input id="sq" type="search" placeholder="搜索标题、标签、账号、日期…" autofocus></div><div id="results"><p class="search-hint">加载中…</p></div><script src="search.js"></' + 'script></main>' + footer + '</body></html>';
fs.writeFileSync(path.join(OUT, 'search.html'), searchHtml);
fs.writeFileSync(path.join(OUT, 'search.json'), JSON.stringify(clean));
// 其它页面补 favicon / css / 导航
const patchHtml = (fn, base) => {
  let h = fs.readFileSync(fn, 'utf8');
  if (!h.includes('rel="icon"')) h = h.replace('<meta property="og:site_name" content="秋秋很开心">', '<meta property="og:site_name" content="秋秋很开心"><link rel="icon" href="' + base + 'favicon.svg" type="image/svg+xml">');
  if (!h.includes('.searchbar')) h = h.replace('</style>', EXTRA_CSS + '</style>');
  if (!h.includes('href="' + base + 'search.html"')) h = h.replace('<a href="' + base + 'about.html">关于</a>', '<a href="' + base + 'about.html">关于</a><a href="' + base + 'search.html">搜索</a>');
  fs.writeFileSync(fn, h);
};
PAGES.forEach(fn => patchHtml(path.join(OUT, fn), ''));
POSTS.forEach(fn => patchHtml(path.join(OUT, 'post', fn), '../'));
// 首页 hero 加搜索框
{
  const idx = path.join(OUT, 'index.html');
  let h = fs.readFileSync(idx, 'utf8');
  if (!h.includes('id="sq"')) {
    h = h.replace('</div><h2 class="year-head">',
      '</div><form class="searchbar" action="search.html" method="get"><input type="search" name="q" placeholder="搜索 ' + TOTAL + ' 篇文章：读书 / 大理 / 理财 / AI…"><button type="submit">搜索</button></form><h2 class="year-head">');
    fs.writeFileSync(idx, h);
  }
}
// rss 直链原文
const rss = '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>秋秋很开心</title><link>' + SITE + '/</link><description>秋秋的个人网站</description>' + clean.slice(0,20).map(a => '<item><title>' + esc(a.title) + '</title><link>' + esc(a.source) + '</link><description>' + esc((a.tags||[]).join('，')) + '</description><pubDate>' + new Date(a.date + 'T00:00:00Z').toUTCString() + '</pubDate></item>').join('') + '</channel></rss>';
fs.writeFileSync(path.join(OUT, 'rss.xml'), rss);
// sitemap 加 search
const sm = fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8');
if (!sm.includes('/search.html')) fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sm.replace('</urlset>', '<url><loc>' + SITE + '/search.html</loc></url></urlset>'));
console.log('extra done, posts:', clean.length);

await import('./inject_filter.mjs').catch(e => console.error('inject fail:', e.message));
