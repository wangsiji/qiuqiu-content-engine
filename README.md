# qiuqiu-content-engine

秋秋很开心 / 秋秋在分享 · 公众号历史文章的内容资产库 + 个人网站。

**线上地址**：https://wangsiji.github.io/qiuqiu-content-engine/（GitHub Pages 自动部署）

---

## 项目结构

```
qiuqiu-content-engine/
├── content/
│   ├── 公众号/                 # Markdown 文章库（事实真相源，504 篇）
│   │   ├── 《秋秋很开心》/      # 学习 / 成长 / 好物
│   │   ├── 《秋秋在分享》/      # 财务自由 / 投资 / 旅居
│   │   ├── extract_articles.py # 抽取元数据 + LLM 语义打标（alias 兜底）
│   │   └── outputs/            # 生成：articles_data.json + llm_cache.json
│   ├── drafts/                 # 草稿区（创作中）
│   └── ideas/                  # 选题灵感
├── site/                       # 抓取脚本 + 站点构建脚本
│   ├── fetch_*.mjs             # 抓取新文章（单篇补抓 / 本地轮询）
│   ├── build*.mjs / theme.mjs  # 站点构建（CI / 本地均可跑）
│   └── package.json
├── config/
│   ├── taxonomy.json           # 内容地图：6 大支柱 + 8 内容类型 + aliases
│   ├── site.json               # 站点风格配置
│   └── url_migrations.json
├── content_engine.py           # 本地语义检索（Chroma）index / search / suggest
├── doc/                        # 架构文档：content-model.md · workflows.md
├── tests/                      # 轻量回归测试（python tests/test_extract.py）
├── docs/                       # 构建产物（GitHub Pages 根，勿手工改）
└── .github/workflows/          # CI：自动构建 + 发布
```

## 内容资产层

把 `content/公众号/` 的 504 篇 md 理解成**可检索、可归类的「内容资产库」**，而非一堆文件。三种视角：

- **资产类型**：`config/taxonomy.json` 定义「6 种内容支柱 pillar + 8 种内容类型」，每篇配别名表。
- **自动打标**：`extract_articles.py` 用 **LLM 语义分类**（Deepseek，读标题+正文判断每篇的 pillar / content_type），失败时回退 taxonomy 别名的子串匹配——不改原文件，读取时推导。
- **阅读依据**：`doc/content-model.md` 定义了内容模型与字段口径。

## 页面构成

站点由一个 `site/build.mjs` 生成（单一构建，共享 `site/theme.mjs` 模板），页面：

| 页面 | 内容 |
|---|---|
| `index.html` 首页 | hero + 统计 + 门户卡 + 搜索 + 最新文章 |
| `archive.html` 全部文章 | 全量卡片存档 |
| `topics.html` 按主题 | 6 大主题分栏浏览 |
| `map.html` 内容地图 | 各主题分布 / 交叉关系 / 代表文章 |
| `about.html` 认识秋秋 | 轨迹 / 6 大研究主题 / 年度柱状 / 代表文章 / 标签云 |
| `search.html` + `search.js` | 前端全文过滤（读 `search.json`） |
| `post/*` | 每篇全文页 |

## 抓取链路（两种场景）

| 场景 | 脚本 | 何时用 | 依赖 |
|---|---|---|---|
| **单篇补抓**（按链接补历史） | `site/fetch_by_url.mjs` | 手动补几篇缺的文章 | 一个或多个 mp.weixin.qq.com 链接 |
| **本地服务器轮询**（cron 增量） | `site/fetch_wemp.mjs` + `~/bin/bridge_wechat.sh` | 服务器已配 we-mp-rss 实例，定时入库 | 本地 we-mp-rss 服务：`WEMP_ORIGIN=...` |

> 官方微信读书直连（`fetch_weread_direct.mjs` + CI）已移除；发布由手动补充 + `bridge_wechat.sh`（服务器 cron）统一推进，再经 CI 自动构建。

## 构建 / 更新流程

推送 `content/公众号/**` 或 `site/**` 改动 → GitHub Actions 自动：

```
extract_articles.py → build_all.mjs → docs/ → 提交 + 部署 GitHub Pages
```

全程无需本地操作。**本地手动预览**：

```bash
python3 content/公众号/extract_articles.py   # 生成文章数据
cd site && node build_all.mjs                # 构建到 docs/
```

> 💡 `outputs/llm_cache.json` 已提交进库——CI 无令牌也能复用缓存的 LLM 语义标签，所有文章数据一致。

## 本地语义检索（内容资产库的查询层）

`content_engine.py` 用 Chroma 给 504 篇建语义向量索引，做**按意思搜**而非按关键词搜。想找 FIRE + 经验 + 旅居，直接描述意图即可。

```bash
.venv/bin/python content_engine.py index                                  # 建（或更新）索引
.venv/bin/python content_engine.py search "当年为什么不上班" -n 8          # 语义搜索
.venv/bin/python content_engine.py search "存钱方法" --pillar freedom --type tutorial  # 按主题+类型筛选
.venv/bin/python content_engine.py suggest "退休生活月开销"                # 找历史 + 给新选题
```

- 每篇已自动打 `pillars`(内容支柱) / `content_type`(内容类型) 标签，search 可用 `--pillar`/`--type` 过滤。
- 索引数据在 `data/chroma/`（`.gitignore`，不入库）。
- 首次建环境：`python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`

---

## 开发约定

- **文章真相源** 是 `content/公众号/*.md`，`docs/` 为构建产物不应手工改。
- 新增文章只需加 md 文件，构建/发布由 CI 接管。
- 历史遗留的 wewe-rss 相关脚本（`fetch_wechat.mjs`、`setup-wewe-rss.sh`）因 wewe 转发服务已弃用而移除。
- 维护工作流、rebase 节奏、抓取坑见 `doc/workflows.md`。