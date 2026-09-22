# 历史文章检索参考

本 skill 的内容检索复用 **qiuqiu-content-engine** 的统一 CLI `content_engine.py`（仓库根），不单独维护脚本——单一真相，避免两套检索分叉。

> ⚠️ 2026-09 起检索从「伪向量」改为 **BM25**。原来用 `hashlib.md5(gram)%768` 做"语义向量"，
> 那其实是哈希桶不是语义——搜"香格里拉"会返回"我今天真的太厉害了"。现在按词频打分，
> 中文用 bigram 分词，标题 3 倍加权。**搜不到 = 换个更具体的词，不是换个近义词。**

## 位置

- 索引：engine 仓库 `data/chroma/`（chroma 现在只当元数据/文档存储）——由 `content_engine.py index` 建立
- CLI：`/home/wangsiji/projects/qqhkx/qiuqiu-content-engine/content_engine.py`
- article 真相源：`content/公众号/`（`《秋秋很开心》` + `《秋秋在分享》` 两个子目录）

## 前置：确保索引已建

```bash
cd /home/wangsiji/projects/qqhkx/qiuqiu-content-engine
# 若 data/chroma 不存在或文章有更新：
python3 -m venv .venv 2>/dev/null; .venv/bin/pip install -r requirements.txt -q 2>/dev/null
.venv/bin/python content_engine.py index
```

## 三个命令，按你要干什么选

| 你要干什么 | 命令 |
|---|---|
| **找写过什么**（避免重复、查素材） | `content_engine.py search "大理旅居房租" -n 5` |
| **要动笔了**（整理素材+真实数字） | `content_engine.py brief "大理旅居租房" -n 3` |
| **看存量分布**（找稀缺类型） | `content_engine.py catalog` |

```bash
cd /home/wangsiji/projects/qqhkx/qiuqiu-content-engine
# 检索（相关度越高越靠前）
.venv/bin/python content_engine.py search "退休 旅居 花费" -n 5
# 按支柱/类型过滤：
.venv/bin/python content_engine.py search "AI 提效" --pillar ai --type experience
# 写前提纲（推荐：列出可引用素材+真实数字）
.venv/bin/python content_engine.py brief "旅居开销"
# 查看某主题写过什么
.venv/bin/python content_engine.py suggest "旅居开销"
```

## 输出

CLI 打印：`[标题](obsidian://open?path=...)` + 发布日期 + **相关度（越大越相关）** + pillars + 类型 + description。
全文在 `content/公众号/` 源 md，用 `read_file` 读。

## 写新稿前必做

```bash
python3 scripts/draft_check.py <草稿路径>    # 用量化的语料基线自查，见 SKILL.md 的 Post Check
```

## 已知局限 & 双路径互补

### 搜不到怎么办

BM25 按词频打分，**同义词不会自动扩展**。搜"旅居"和搜"租房"结果不同——这是它的性质不是 bug。

对策：
1. **换个更具体的词**（搜"大理"比搜"旅居生活"准）
2. **组合词**：`search "大理 房租"` 会同时考虑两个词
3. **精确匹配补位**：搜地名/具体数字时用 Hermes 的 `search_files` 直接扫 md 正文

| 路径 | 工具 | 适用场景 |
|------|------|---------|
| BM25 | `content_engine.py search/brief` | 找话题样本、风格参考、可引用的真实数字 |
| 文件系统 | Hermes `search_files` | 精确匹配：某地名/金额出现在哪些文章 |

> 已修的根因：早年的伪向量会命中文末签名模板（"喜欢记得星标"）导致相似度虚高。
> BM25 已无此问题（相关度透明可核对），不必再为此绕路。

## 写稿流程中的位置

```
0a. content_engine.py search → 看写过没、怎么写的、有没有能用到的真实数字
0b. 搜地名/具体事件时 → 补 search_files 精确匹配，读全文
1. 确认阶段 + 选题
2. 如需抓已发布全文 → scripts/clip_qiuqiu_published.py (mptext API)
3. 写初稿
```