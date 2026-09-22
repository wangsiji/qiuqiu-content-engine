# 内容模型（Content Model）

> QIUQIU Content Engine 的"内容资产"是什么、长什么样、如何被读取与再造。

## 一条内容资产是什么

在本引擎里，一条内容资产 = **一个 Markdown 文件（原文真相源）+ 可推导的元数据**。
原文永不改动、永不迁移；元数据在读取时用 `content/公众号/extract_articles.py` 即时推导，写入 `outputs/articles_data.json`。

## 文件命名（真值源不变）

```
content/公众号/<号名>/{YYYYMMDD}-{slug}.md
```

- 例：`《秋秋很开心》/20230808-不想上班可以去哪里.md`
- 文件名前 8 位 = 发布日；`slug` 是标题拼音/缩写。
- fen：**不改文件名、不建重复副本**。全部内容以原 md 为准。

## front matter（现状 + 建议）

每篇 md 顶部有 YAML front matter：

```yaml
name: "<标题>"
description: "<摘要/导读>"
category:
  - "[[自媒体：秋秋在分享]]"
source: https://mp.weixin.qq.com/s/...
published: 2023-02-02
tags: ["秋秋/想办法", "秋秋/搞钱", ...]
```

字段口径：
- `name`：标题（与正文 H1 一致）
- `title`：有些篇目是 title（旧格式）。两者取一时以 `name` 优先。
- `published`：发布日 YYYY-MM-DD（缺失时从文件名推）
- `category`：公众号归属（`[[自媒体：秋秋很开心]]` / `[[自媒体：秋秋在分享]]`）
- `source`：原文链接
- `tags`：已有语义标签（`花秋/...`：公众号+二级主题）

## 派生元数据（extract 时打标，不写回文件）

`extract_articles.py` 读 `config/taxonomy.json` 的 `pillars` / `content_types` 的 `aliases`，
在「标题 + 描述 + tags」里匹配，给每篇算产物：

```json
{
  "pillars": ["freedom", "lifestyle"],
  "content_type": ["experience"]
}
```

- `pillars`：内容支柱（财务自由 / 生活方式 / 自我成长 / 读书 / AI与工具 / 好物共享）——可多，但通常 1-2 个。
- `content_type`：内容类型（知识/经验/故事/观点/教程/测评/清单/复盘）。启发式匹配，精度靠 `aliases`；正式判类放 Phase 2（AI）才精确。

## 输出清单

`extract_articles.py` 每次运行：

- `content/公众号/outputs/articles_data.json` — 全量内容清单（500+ 篇，每篇含上表所有字段 + `content_full` 正文）。供站点 build 与语义索引读取。

## 关键克制

- 它是一段「内容资产」，不是「文章」。语义检索（Chroma `content_engine.py`）与未来内容生产都以此清单为底。
- **绝不做**：全量手写 id / relations / performance —— 500+ 篇人肉填充不可行、不可维护。id 由 extract 自动生成，关系留给后续选做。
- **不改原文件**：打标、索引、检索全部「读时推导」，单源、可重复、无污染。