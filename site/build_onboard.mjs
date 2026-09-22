// 首页双路引导 + 内容地图时间演化 + 选题机会去后台感（在 build3 / build_intel 之后执行）
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(import.meta.dirname, '..', 'docs');

// 1) 首页 hero：两个 CTA + 引导条
const idx = path.join(OUT, 'index.html');
let ih = fs.readFileSync(idx, 'utf8');
if (!ih.includes('ob-title')) {
  // 主按钮序列改为：认识秋秋(主) + 探索我的内容(outline)
  ih = ih.replace(
    '<a class="btn" href="archive.html">阅读全部文章</a><a class="btn outline" href="about.html">认识秋秋</a>',
    '<a class="btn" href="about.html">🙋 认识秋秋</a><a class="btn outline" href="archive.html">📚 探索我的内容</a>'
  );
  // 在 hero 结束后插入引导条（两条路）
  const onboard = '<div class="onboard"><div class="ob-title">欢迎 👋 第一次来，有两条路</div><div class="ob-row"><a class="ob-card" href="about.html"><div class="ob-h">认识秋秋</div><div class="ob-d">看看我为什么写这些东西</div></a><a class="ob-card" href="map.html"><div class="ob-h">探索我的内容</div><div class="ob-d">502 + 篇文章，看看这些年我到底写了什么</div></a></div></div>';
  ih = ih.replace('<form class="searchbar"', onboard + '<form class="searchbar"');
  // 首页「今日值得写」：读 intel.json 展示 Top 3 选题（工作台式体验）
  try {
    const intel = JSON.parse(fs.readFileSync(path.join(OUT, 'intel.json'), 'utf8'));
    // 今日值得写优先给「差异化」机会（交叉/类型缺口/时间重写），而非前三条深耕
    const pri = ['gap','type','evolve','trend','revive'];
    const top = [...intel.opps.sort((a,b)=> pri.indexOf(b.level)-pri.indexOf(a.level))].slice(0,3);
    const doRow = '<div class="ob-title">📌 今日值得写</div>' + top.map(o =>
      '<a class="ob-card" href="opportunity.html"><div class="ob-h">' + o.name + '</div><div class="ob-d">' + o.title + '</div></a>'
    ).join('');
    const doBlock = '<div class="onboard" style="margin-top:0"><div class="welcome">今天值得写什么？</div><div class="ob-row">' + doRow + '</div></div>';
    ih = ih.replace('<form class="searchbar"', doBlock + '<form class="searchbar"');
    console.log('home today-picks injected: ' + top.length);
  } catch (e) { console.log('intel.json missing, skip today picks', e.message); }
  // CSS 追加
  const obCss = '<style>.onboard{background:rgba(255,253,246,.78);border:1.5px dashed var(--line);border-radius:18px;padding:18px 20px;margin:24px auto 10px;max-width:620px}.onboard .welcome{font-size:14px;font-weight:800;color:var(--green-deep);margin-bottom:12px}.onboard .ob-row{display:flex;gap:12px;flex-wrap:wrap}.onboard .ob-card{flex:1;min-width:220px;background:var(--paper);border:1.5px solid var(--line);border-radius:14px;padding:11px 14px;transition:.15s;display:block}.onboard .ob-card:hover{border-color:var(--green);transform:translateY(-2px)}.onboard .ob-h{font-size:14px;font-weight:800;color:var(--ink)}.onboard .ob-d{font-size:12px;color:var(--brown);margin-top:3px;line-height:1.5}</style>';
  ih = ih.replace('</style>', obCss);
  fs.writeFileSync(idx, ih);
  console.log('home onboard injected');
} else console.log('home onboard already')

// 2) 内容地图：时间演化段
const mp = path.join(OUT, 'map.html');
let mh = fs.readFileSync(mp, 'utf8');
if (!mh.includes('演化')) {

const eras = '<div class="era-line"><div class="era-item"><div class="ey">2018</div><div class="ed">开始记录生活 · 效率工具</div></div><div class="era-item"><div class="ey">2020</div><div class="ed">开始思考自由与成长</div></div><div class="era-item"><div class="ey">2022</div><div class="ed">裸辞 / 退休 / 开始 FIRE 主题</div></div><div class="era-item"><div class="ey">2024</div><div class="ed">生娃 / 全家 FIRE / 账本</div></div><div class="era-item"><div class="ey">2026</div><div class="ed">旅居中国 / AI 与工具 / 内容系统</div></div></div>';
  mh = mh.replace('<h2 class="yhead">主题总览</h2>', '<h2 class="yhead">这些年的演变</h2>' + eras + '<h2 class="yhead">主题总览</h2>');
  mh = mh.replace('</style>', '<style>.era-line{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px}.era-item{flex:1;min-width:140px;background:var(--paper);border:1.5px solid var(--line);border-radius:12px;padding:10px 12px;border-top:4px solid var(--terracotta)}.era-item .ey{font-size:16px;font-weight:800;color:var(--green-deep)}.era-item .ed{font-size:12px;color:var(--brown);margin-top:3px;line-height:1.5}</style>');
  fs.writeFileSync(mp, mh);
  console.log('map eras added');
} else console.log('map eras already');

// 3) 选题机会：去后台感
const op = path.join(OUT, 'opportunity.html');
let oh = fs.readFileSync(op, 'utf8');
if (!oh.includes('还没写透')) {
  oh = oh.replace('<h1>选题机会</h1><p class="tagline">从 502 篇历史里找「值得写但还没写」的切入点</p>',
    '<h1>我还没写透的几个问题</h1><p class="tagline">从过去 502 篇里，找到「值得继续写」的线索 —— 一个正在持续思考的人</p>');
  fs.writeFileSync(op, oh);
  console.log('opportunity reworded');
} else console.log('opportunity already');

// 4) 全站 OG 统一：缺 og:image 的页面注入分享卡（与 build3 一致）
const OG_META = '<meta property="og:site_name" content="秋秋很开心"><meta property="og:type" content="website"><meta property="og:image" content="https://wangsiji.github.io/qiuqiu-content-engine/og-card.svg"><meta name="twitter:card" content="summary">';
for (const fn of fs.readdirSync(OUT)) {
  if (!fn.endsWith('.html')) continue;
  const p = path.join(OUT, fn);
  let h = fs.readFileSync(p, 'utf8');
  if (h.includes('og:image')) continue;
  if (h.includes('<meta property="og:site_name"')) {
    h = h.replace('<meta property="og:site_name" content="秋秋很开心">', '<meta property="og:site_name" content="秋秋很开心">' + OG_META, 1);
  } else if (h.includes('</title>')) {
    h = h.replace('</title>', '</title>' + OG_META, 1);
  } else continue;
  fs.writeFileSync(p, h);
  console.log('og added:', fn);
}
console.log('og unified');
