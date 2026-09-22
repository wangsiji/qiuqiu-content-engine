// 全站单一构建入口：node build.mjs（在 site/ 下执行）
// 取代旧 9 脚本链（build3/make_topics/build_about/build_extra/build_intel/build_onboard/build_atoms/add_redirects/linkcheck）。
// 统一从 articles_data + taxonomy 派生所有页面，共享 SHELL 模板，不再对已生成 HTML 做字符串手术。
import fs from 'node:fs';
import path from 'node:path';
import { SHELL } from './theme.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'content/公众号/outputs/articles_data.json');
const TAX   = path.join(ROOT, 'config/taxonomy.json');
const OUT   = path.join(ROOT, 'docs');
const BASE  = 'https://wangsiji.github.io/qiuqiu-content-engine';
const SITE  = '秋秋很开心';

const articles = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const tax      = JSON.parse(fs.readFileSync(TAX, 'utf8'));

/* ---------------- 工具 ---------------- */
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const hashCode = str => { let h = 0; for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0; return Math.abs(h).toString(36).padStart(4,'0').slice(0,4); };
const slug = a => { const base = a.date.replace(/-/g,''); const key = (a.filename || a.source || a.title).replace(/\.md$/,''); return '/post/' + base + '-' + hashCode(key) + '.html'; };
const monthsAgo = d => { const y = Number(d.slice(0,4)), m = Number(d.slice(5,7)); return (new Date().getFullYear() - y) * 12 + (new Date().getMonth()+1 - m); };
const inline = s => s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]\n]+)\](https?:\/\/[^)\s]+)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
const renderMD = md => {
  const out = [];
  for (const raw of (md || '').split(/\r?\n/)) {
    const t = raw.trim();
    if (!t || t === '---') continue;
    if (t.startsWith('# ') || t.startsWith('## ')) out.push('<h3>'+esc(t.replace(/^#+ /,''))+'</h3>');
    else if (t.startsWith('### ')) out.push('<h4>'+esc(t.slice(4))+'</h4>');
    else if (t.startsWith('![')) { const m = t.match(/!\[.*?\]\((.*?)\)/); out.push(m ? '<img loading="lazy" src="'+m[1]+'" alt="">' : ''); }
    else if (t.startsWith('>')) out.push('<blockquote>'+inline(esc(t.slice(1).trim()))+'</blockquote>');
    else if (t.startsWith('- ') || t.startsWith('* ')) out.push('<p>· '+inline(esc(t.slice(2)))+'</p>');
    else out.push('<p>'+inline(esc(t))+'</p>');
  }
  return out.join('\n');
};

/* ---------------- 数据规范化 ---------------- */
const clean = articles
  .filter(a => a && a.title && a.date)
  .map(a => ({
    filename:     a.filename || '',
    account:      (a.account || '秋秋很开心').trim(),
    title:        (a.title || '').trim(),
    date:         (a.date || '').slice(0,10),
    description:  (a.description || '').trim(),
    tags:         (Array.isArray(a.tags) ? a.tags.map(t => String(t).trim().split('/').pop()).filter(Boolean) : []),
    source:       a.source || '',
    word_count:   Number(a.word_count) || 0,
    pillars:      Array.isArray(a.pillars) ? a.pillars : [],
    content_type: Array.isArray(a.content_type) ? a.content_type[0] || '' : (a.content_type || ''),
    content_full: a.content_full || a.content_preview || '',
  }))
  .sort((a, b) => (a.date < b.date ? 1 : -1));

const mdByFile = new Map();
for (const dir of [path.join(ROOT,'content/公众号/《秋秋很开心》'), path.join(ROOT,'content/公众号/《秋秋在分享》')]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.md')) mdByFile.set(f, path.join(dir, f));
}
let mdLoaded = 0;
for (const a of clean) {
  const fp = mdByFile.get(a.filename);
  if (!fp) continue;
  const text = fs.readFileSync(fp, 'utf8');
  const m = text.match(/^---[\s\S]*?---\s*([\s\S]*)$/);
  if (m) { a.content_full = m[1].trim() || a.content_full; mdLoaded++; }
}
console.log('md loaded:', mdLoaded, '/', clean.length);

const years = [...new Set(clean.map(a => a.date.slice(0,4)))].sort().reverse();

/* ---------------- 卡片 & 页面 ---------------- */
const card = (a, base = '') => {
  const href = a.source || (base + a._url.replace(/^\//, ''));
  return `<a class="card" href="${href}" target="_blank" rel="noopener"><div class="card-meta"><time>${a.date}</time><span class="acct">${esc(a.account)}</span></div><h3>${esc(a.title)}</h3><p>${esc(a.description.slice(0,90))}</p><div class="tags">${a.tags.slice(0,3).map(t=>'<span>'+esc(t)+'</span>').join('')}</div></a>`;
};

// 文章页
fs.rmSync(path.join(OUT, 'post'), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'post'), { recursive: true });
for (const a of clean) a._url = slug(a);
for (const a of clean) {
  const srcFooter = a.source
    ? `<div class="post-footer"><a href="${esc(a.source)}" target="_blank" rel="noopener">在公众号阅读原文</a></div>`
    : '<div class="post-footer">本文为站内原创存档，无公众号原文链接</div>';
  const body = `<article class="post"><a class="back" href="../index.html">← 返回首页</a><h1 class="post-title">${esc(a.title)}</h1><div class="post-meta"><time>${a.date}</time> · ${esc(a.account)} · ${a.word_count} 字 · 约${Math.max(1, Math.round(a.word_count/400))} 分钟阅读</div><p class="post-desc">${esc(a.description)}</p><div class="post-body">${renderMD(a.content_full)}</div>${srcFooter}</article>`;
  fs.writeFileSync(path.join(OUT, a._url.replace(/^\//, '')), SHELL({ title: a.title + ' · ' + SITE, desc: a.description, base: '../', body }));
}
for (let i = 0; i < clean.length; i++) {
  const a = clean[i], prev = clean[i-1], next = clean[i+1];
  const fn = path.join(OUT, a._url.replace(/^\//, ''));
  let h; try { h = fs.readFileSync(fn, 'utf8'); } catch (e) { continue; }
  const nav = `<nav class="post-nav"><div>${prev ? '<a href="'+prev._url.split('/').pop()+'">← '+esc(prev.title)+'</a>' : '<span class="cursor">已经是第一篇</span>'}</div><div class="right">${next ? '<a href="'+next._url.split('/').pop()+'">'+esc(next.title)+' →</a>' : '<span class="cursor">已经是最新一篇</span>'}</div></nav>`;
  h = h.replace('<div class="post-footer">', nav + '<div class="post-footer">');
  fs.writeFileSync(fn, h);
}
console.log('articles:', clean.length);
fs.writeFileSync(path.join(OUT, 'urls.json'), JSON.stringify(clean.map(a => ({ filename: a.filename, url: a._url }))));

// 首页
const hero = () => {
  const pillars = new Set(clean.flatMap(a => a.pillars));
  const types = new Set(clean.map(a => a.content_type).filter(Boolean));
  return `<div class="hero"><h1>把人生写成一场公开实验</h1><p class="tagline">秋秋的个人网站 · ${clean.length} 篇文章的完整存档</p><div class="stats"><span>${clean.length} 篇文章</span><span>${years.length} 年</span><span>${pillars.size} 大主题</span><span>${types.size} 种内容类型</span></div><div class="hero-actions"><a class="btn" href="archive.html">阅读全部文章</a><a class="btn outline" href="about.html">认识秋秋</a></div></div>`;
};
const portalGrid = [
  ['map.html', '🗺️', '内容地图', '这些年我写了哪些主题'],
  ['topics.html','🏷️', '按主题浏览', '换个方式看内容'],
  ['archive.html','📚', '全部文章', '全部篇存档'],
  ['about.html','🙋', '我是谁', '一条普通人的自由轨迹'],
].map(([href, ic, t, d]) => `<a class="portal" href="${href}"><div class="p-ic">${ic}</div><div class="p-t"><div class="p-h">${t}</div><div class="p-d">${d}</div></div></a>`).join('');
const portalCss = `<style>.portal-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;margin:34px 0 10px}.portal{display:flex;gap:12px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 16px;transition:.15s}.portal:hover{border-color:var(--ink);box-shadow:var(--shadow);transform:translateY(-1px)}.p-ic{font-size:20px}.p-h{font-size:15px;font-weight:700}.p-d{font-size:12px;color:var(--ink-3);margin-top:1px}</style>`;
const searchForm = `<form class="searchbar" action="search.html" method="get"><input type="search" name="q" placeholder="搜索 ${clean.length} 篇文章：读书 / 大理 / 理财 / AI…"><button type="submit">搜索</button></form>`;
const recent = `<div class="yhead">最新发表</div><div class="grid">${clean.slice(0,12).map(card).join('')}</div><div style="text-align:center;margin:6px 0 44px"><a class="btn outline" href="archive.html">查看全部文章 →</a></div>`;
fs.writeFileSync(path.join(OUT, 'index.html'), SHELL({
  title: '秋秋的个人网站', desc: '秋秋的个人网站，'+clean.length+' 篇公众号历史文章存档', active: 'index.html',
  body: hero() + portalCss + `<div class="portal-grid">${portalGrid}</div>` + searchForm + recent
}));

// 归档
fs.writeFileSync(path.join(OUT, 'archive.html'), SHELL({
  title: '全部文章 · '+SITE, desc: '全部 '+clean.length+' 篇文章', active: 'archive.html',
  body: `<div class="yhead">全部文章 · ${clean.length} 篇</div><div class="grid">${clean.map(card).join('')}</div>`
}));

// 主题页
const TOPICS = (tax.pillars || []).map(p => ({ name: p.name, why: p.why || '', match: p.aliases || [] }));
const urlByFile = new Map(clean.map(a => [a.filename, a._url]));
const topicsBody = TOPICS.map(tp => {
  const posts = clean.filter(p => p.tags.some(t => tp.match.includes(t) || tp.match.some(m => t.includes(m))));
  const cards = posts.slice(0,6).map(a => card({ ...a, _url: urlByFile.get(a.filename) || '' })).join('');
  const more = posts.length > 6 ? `<p class="more-link"><a href="search.html?q=${encodeURIComponent(tp.match[0] || tp.name)}">查看全部 ${posts.length} 篇 →</a></p>` : '';
  return `<div class="yhead">${tp.name} · ${posts.length} 篇</div><div class="grid">${cards || '<p style="color:var(--ink-3);font-size:13px">暂无文章</p>'}</div>${more}`;
}).join('');
fs.writeFileSync(path.join(OUT, 'topics.html'), SHELL({
  title: '按主题 · '+SITE, desc: '换个方式，看秋秋写了什么', active: 'topics.html',
  body: `<div class="hero"><h1>按主题浏览</h1><p class="tagline">换个方式，看秋秋写了什么</p></div>` + topicsBody
}));

// 认识秋秋（about）
const tagCount = {};
for (const a of clean) for (const t of a.tags) tagCount[t] = (tagCount[t]||0)+1;
const topTags = Object.entries(tagCount).sort((x,y)=>y[1]-x[1]).slice(0,24);
const maxTag = topTags[0] ? topTags[0][1] : 1;
const wordsHtml = topTags.map(([w,n]) => '<a class="word" style="font-size:'+Math.round(12+n/maxTag*12)+'px" href="search.html?q='+encodeURIComponent(w)+'" title="'+n+' 篇">'+esc(w)+'</a>').join('');
const topicsAbout = [
  ['财务自由','不是为了躺平，而是为了拥有选择生活的自由','#c65d4b'],
  ['生活方式','普通家庭怎么过得舒服又体面，是我一直在试的事','#7c5cff'],
  ['自我成长','把心理学用在解剖自己，记录真实的改变','#4f8f5f'],
  ['AI 与工具','普通人的 AI 用法：让工具省时间，而不是炫技','#5b8db8'],
  ['读书','读过的书，变成用得上的思考和方法','#c2852f'],
  ['好物分享','认真用过、认真测评，才敢分享','#c76f9e'],
].map(([na,wh,col]) => '<div class="it"><span class="dot" style="background:'+col+'"></span><div><div class="name">'+na+'</div><div class="why">'+wh+'</div></div></div>').join('');
const acc = {};
for (const a of clean) { const k = a.account; acc[k] = (acc[k]||0)+1; }
const accsHtml = Object.keys(acc).sort().map(a => '<div class="acc"><b>'+esc(a)+'</b><span>'+acc[a]+' 篇</span></div>').join('');
// 年度柱状
const byYearCount = {};
for (const a of clean) { const y = a.date.slice(0,4); if (y) byYearCount[y] = (byYearCount[y]||0)+1; }
const ySort = Object.keys(byYearCount).sort();
const yMax = Math.max(...ySort.map(y=>byYearCount[y]));
const chartHtml = ySort.map(y => '<div class="c"><div class="cv">'+byYearCount[y]+'</div><div class="bar" style="height:'+Math.round(byYearCount[y]/yMax*110)+'px"></div><div class="cy">'+y+'</div></div>').join('');
const tl = [
  ['2018-2021','效率工具期','写App、笔记、工具测评。'],
  ['2022','退休元年','26岁带250万宣布退休。'],
  ['2023','FIRE体系化','财富篇/心态篇/未来篇。'],
  ['2024-2025','全家FIRE','生娃、家庭账本。'],
  ['2025-至今','旅居中国','威海→海南→大理，骑行800km。'],
].map(s => '<div class="tl"><div class="ty">'+s[0]+'</div><div class="tt">'+s[1]+'</div><div class="td">'+s[2]+'</div></div>').join('');
const reads5 = [
  ['01','认识我','26岁，我打算正式退休了！','普通人也能谈自由','https://mp.weixin.qq.com/s/se7lRTlnpzbPMXOqDGWP1g'],
  ['02','我的选择','小城市45-60万真的足够Fire(退休)耶！','便宜不等于将就','https://mp.weixin.qq.com/s/Eevz9jGj-JLerisrbKZ39A'],
  ['03','我的状态','退休3个月，收入10万块。','摊开现金流','https://mp.weixin.qq.com/s/xtRGUi5Gy5guFRsWXsE-w'],
  ['04','我的方法','不上班三年，我是如何省钱/花钱的？','错峰套利','https://mp.weixin.qq.com/s/zAhsojID9jD2Z9LEQvrzA'],
  ['05','现在我做什么','退休3年，我的资产翻倍了','金钱/身体/能力','https://mp.weixin.qq.com/s/ZpNhg8KI6EhxX0iqyD8Eqg'],
].map(r => '<a class="read" href="'+r[4]+'" target="_blank" rel="noopener"><span class="no">'+r[0]+'</span><span class="tag">'+r[1]+'</span><span class="t">'+r[2]+'</span><span class="w">'+r[3]+'</span></a>').join('');
const aboutBody =
  `<div class="ab-hero"><div class="eyebrow">认识秋秋 · QIUQUQU</div><h1>一个普通人的自由生活实验</h1><p class="sub">96年 · 24岁裸辞 · 26岁退休 · 带娃旅居中国</p><p class="quote">「我无法给出建议，我先给出经历。」</p><a class="btn" href="#story">从我的故事开始 ↓</a></div>
  <section class="sec"><h2>我的轨迹</h2><div class="story-line">2018 开始写作 <i></i> 北漂编导 <i></i> 24岁裸辞 <i></i> 26岁退休 <i></i> 30岁旅居中国 <i></i> 2026 一起把人生过成实验</div><div class="accs">`+accsHtml+`</div></section>
  <section class="sec"><h2>我在长期研究这 6 件事</h2><div class="topics">`+topicsAbout+`</div></section>
  <section class="sec"><h2>我一路写了什么</h2><div class="chart">`+chartHtml+`</div><div class="tls">`+tl+`</div></section>
  <section class="sec"><h2>第一次认识我，从这 5 篇开始</h2><div class="reads">`+reads5+`</div></section>
  <section class="sec"><h2>我反复谈论的词</h2><div class="cloud">`+wordsHtml+`</div></section>`;
fs.writeFileSync(path.join(OUT, 'about.html'), SHELL({
  title: '认识秋秋 · '+SITE, desc: '秋秋的个人主页：一个普通人的自由生活实验', active: 'about.html', redirect: false, body: aboutBody
}));

// 内容地图（map）
const assigned = clean.map(a => ({ ...a, topics: TOPICS.filter(t => a.tags.some(tag => t.match.includes(tag) || t.match.some(m => tag.includes(m)))).map(t => t.name) }));
const topicStats = TOPICS.map(tp => {
  const posts = assigned.filter(a => a.topics.includes(tp.name));
  const recent = posts.filter(a => monthsAgo(a.date) <= 24).length;
  return { name: tp.name, count: posts.length, recent, latest: posts.length ? posts[0].date : null,
    avgWc: posts.length ? Math.round(posts.reduce((s,a)=>s+a.word_count,0)/posts.length) : 0,
    topTitles: posts.slice(0,5).map(a=>a.title) };
});
const maxN = Math.max(1, ...topicStats.map(t=>t.count));
const bar = (n,max) => '<div class="bar"><i style="width:'+Math.round(n/(max||1)*100)+'%"></i></div>';
const dashCards = topicStats.map(t => '<div class="tp"><h3>'+esc(t.name)+'</h3><div class="cnt">'+t.count+' 篇 · 最新 '+esc(t.latest)+'</div>'+bar(t.count,maxN)+'<div class="meta">均长 '+t.avgWc+' 字 · 近2年 '+t.recent+' 篇</div><details><summary>代表文章</summary>'+t.topTitles.map(x=>'<div class="tl">· '+esc(x)+'</div>').join('')+'</details></div>').join('');
const pairs = [];
for (let i = 0; i < TOPICS.length; i++) for (let j = i+1; j < TOPICS.length; j++) {
  const both = assigned.filter(a => a.topics.includes(TOPICS[i].name) && a.topics.includes(TOPICS[j].name));
  if (both.length >= 2) pairs.push({ t1: TOPICS[i].name, t2: TOPICS[j].name, count: both.length, latest: both[0].date });
}
pairs.sort((a,b)=>b.count-a.count);
const maxP = pairs.length ? pairs[0].count : 1;
const crossHtml = pairs.slice(0,6).map(p => '<div class="tp"><h3>'+esc(p.t1)+' × '+esc(p.t2)+'</h3><div class="cnt">'+p.count+' 篇 · 最近 '+esc(p.latest)+'</div>'+bar(p.count,maxP)+'</div>').join('');
const mapBody = `<div class="yhead">主题总览</div><div class="map-grid">${dashCards}</div>` +
  (pairs.length ? `<div class="yhead">主题交叉（已有内容）</div><div class="map-grid">${crossHtml}</div>` : '');
fs.writeFileSync(path.join(OUT, 'map.html'), SHELL({ title: '内容地图 · '+SITE, desc: clean.length+' 篇文章的分布与交叉', active: 'map.html', body: mapBody }));

// 搜索页 + search.json（契约：docs/search.js 读 search.json：title/date/account/tags/source/pillars/content_type）
const sr = clean.map(a => ({
  title: a.title, date: a.date, account: a.account,
  tags: a.tags.slice(0,3),
  source: a.source,
  pillars: a.pillars.map(x => x.charAt(0).toUpperCase() + x.slice(1)),
  content_type: a.content_type,
}));
// search.js 用 PNG 字段名映射，注意大小写
fs.writeFileSync(path.join(OUT, 'search.json'), JSON.stringify(sr));
const searchBody = `<div class="hero"><h1>搜索文章</h1><p class="tagline">标题、标签、账号、日期…</p></div><div class="searchbar"><input id="sq" type="search" placeholder="搜索 ${clean.length} 篇文章…" autofocus></div><div id="results"><p class="search-hint">加载中…</p></div><script src="search.js"></`+`script>`;
fs.writeFileSync(path.join(OUT, 'search.html'), SHELL({ title: '搜索 · '+SITE, desc: '搜索秋秋的公众号历史文章', active: 'search.html', body: searchBody }));

// 404
fs.writeFileSync(path.join(OUT, '404.html'), SHELL({ title: '页面未找到 · '+SITE, desc: '404', body: '<div class="hero" style="padding-top:80px"><h1>404</h1><p class="tagline">这个页面不存在或已迁移</p><div class="hero-actions"><a class="btn" href="index.html">返回首页</a></div></div>' }));

// 旧 URL 重定向（来自 config/url_migrations.json）
const mig = {};
try { Object.assign(mig, JSON.parse(fs.readFileSync(path.join(ROOT,'config/url_migrations.json'),'utf8'))); } catch (e) {}
const newUrlSet = new Set(clean.map(a => a._url.replace(/^\//,'')));
for (const [oldRel, newRel] of Object.entries(mig)) {
  if (!newRel || !newUrlSet.has(newRel.replace(/^\//,''))) continue;
  if (newUrlSet.has(oldRel.replace(/^\//,''))) continue;
  const redir = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0;url='+newRel.replace(/^\//,'')+'"><title>跳转中 · 秋秋</title></head><body style="font-family:sans-serif;padding:60px;text-align:center"><p>文章已迁移</p><a href="'+newRel.replace(/^\//,'')+'" style="color:#7c5cff;font-weight:700">点击进入 →</a></body></html>';
  const redirPath = path.join(OUT, oldRel.replace(/^\//,''));
  fs.mkdirSync(path.dirname(redirPath), { recursive: true });
  fs.writeFileSync(redirPath, redir);
}

// SEO：sitemap / robots / rss
const pages = ['/','/topics.html','/map.html','/archive.html','/about.html','/search.html'];
const smUrl = p => '<url><loc>'+BASE+p+'</loc></url>';
const sitemap = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">'+pages.map(smUrl).join('')+clean.map(a=>smUrl(a._url)).join('')+'</urlset>';
fs.writeFileSync(path.join(OUT,'sitemap.xml'), sitemap);
fs.writeFileSync(path.join(OUT,'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: '+BASE+'/sitemap.xml\n');
const rssItems = clean.slice(0,20).map(a => '<item><title>'+esc(a.title)+'</title><link>'+BASE+a._url+'</link><description>'+esc(a.description.slice(0,200))+'</description><pubDate>'+new Date(a.date+'T00:00:00Z').toUTCString()+'</pubDate></item>').join('');
fs.writeFileSync(path.join(OUT,'rss.xml'), '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>'+SITE+'</title><link>'+BASE+'/</link><description>秋秋的个人网站</description>'+rssItems+'</channel></rss>');

console.log('✅ 全站构建完成：', clean.length, '篇 /', Object.keys(byYearCount).length, '年');