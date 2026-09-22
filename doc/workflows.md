# 内容运营工作流（Workflows）

> 从"新增一篇文章"到"网站上线"的完整链路。全部脚本作用于 `content/公众号/`，**原始 md 永不被改写**。

## 一、新增/补抓 1 篇文章

```bash
# 方式 A：直接写 md（人工创作）
#   content/公众号/<号名>/<YYYYMMDD>-<slug>.md  —— 手写即可，无需其他操作

# 方式 B：按公众号链接补抓（有 mp 链接时）
node site/fetch_by_url.mjs "https://mp.weixin.qq.com/s/XXXXX"

# 方式 C：本地服务器轮询（日常增量，全自动，无需操作）
crontab: 5 1 * * * ~/bin/bridge_wechat.sh   # 每天凌晨 1 点拉一次 + 提交
```

写好后：

```bash
git add content/公众号/ && git commit  # CI 自动构建发布
```

## 2. 重新生成内容清单（自动打标）

```bash
python3 content/公众号/extract_articles.py
# 产出: content/公众号/outputs/articles_data.json
# 每篇含: id / title / date / description / tags / source / word_count /
#         pillars(内容支柱) / content_type(内容类型) / content_preview / content_full
```

清单由 CI 每次自动重跑，本地不必手动。

## 3. 全站构建（本地预览）

```bash
python3 content/公众号/extract_articles.py   # 先出清单
cd site && node build_all.mjs                 # 生成 docs/（GitHub Pages 根）
```

build_all 依次跑：build3(首页/文章页) → build_about → make_topics(主题页) → build_extra(搜索/存档) → build_intel(内容地图/选题机会) → build_onboard → build_atoms → linkcheck → add_redirects。

## 4. 语义检索（按意思找历史内容）

```bash
.venv/bin/python content_engine.py index                    # 建/更新向量索引
.venv/bin/python content_engine.py search "当年为什么不上班" -n 8
.venv/bin/python content_engine.py suggest "退休生活月开销"
```

无 `.venv`：`python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`

> 每次都 index 一次即可覆盖更新（幂等）。新入库文章后重跑 `index`，让向量库跟上；`.gitignore` 不入库，换机需重建。

## 5. 内容地图 / 选题机会（自动分析 500+ 篇）

- 内容地图页 `docs/map.html`：500+ 篇按 6 大主题 pillar 分布 + 交叉 + 代表文章
- 选题机会页 `docs/opportunity.html`：自动给出 6 类选题（深耕/交叉空白/上升/沉寂回温/类型缺口/时间重写）
- 均由 `site/build_intel.mjs` 从 `config/taxonomy.json` + 内容清单生成

## 常用目录速记

| 用途 | 路径 |
|---|---|
| 文章原料 | `content/公众号/《秋秋在分享》/`、`《秋秋很开心》/` |
| 草稿 | `content/drafts/` |
| 选题灵感 | `content/ideas/` |
| 内容地图/taxonomy 唯一真 | `config/taxonomy.json` |
| 内容清单（生成） | `content/公众号/outputs/articles_data.json` |
| 站点产物 | `docs/`（勿手改） |
| 架构文档 | `doc/content-model.md` |

## 关键铁律

- **不裸 commit**：别 `git add -A`。按 path 限定提交（否则会把 docs/ 或其它夹带进来）。远端有 CI 自动 commit，push 前先 `git fetch`。
- **不改源代码文件**：所有打标/索引是"读时推导"，原始 md 是唯一真相。
- **build away from docs 产物**：本地 build 会生成 docs/，提交前 `git checkout -- docs/ 还原`（CI 会重新生成）。