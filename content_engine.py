#!/usr/bin/env python3
"""Local semantic search and topic planning for Qiuqiu's content archive."""
from __future__ import annotations

import argparse
import json
import math
import os
import re
from collections import Counter
from pathlib import Path
from urllib.parse import quote

import chromadb
import yaml

# 仓库根 = 本文件所在目录（content_engine.py 位于仓库根）
ROOT = Path(__file__).resolve().parent
ARCHIVE = ROOT / "content" / "公众号"
DATA = ROOT / "data"
COLLECTION = "qiuqiu-wechat"


def client():
    DATA.mkdir(exist_ok=True)
    return chromadb.PersistentClient(path=str(DATA / "chroma"))


def collection():
    return client().get_or_create_collection(
        name=COLLECTION,
        metadata={"description": "秋秋历史公众号文章语义索引"},
    )


def _tokenize(text: str) -> list[str]:
    """中文 bigram + 英数词。中文无空格，bigram 是零依赖的近似分词。"""
    text = re.sub(r"\s+", "", text.lower())
    out = []
    for tok in re.findall(r"[\u4e00-\u9fff]+|[A-Za-z]+|\d+", text):
        if len(tok) == 1 and not re.match(r"[A-Za-z0-9]", tok):
            out.append(tok)
        elif re.search(r"[\u4e00-\u9fff]", tok):
            out += [tok[i : i + 2] for i in range(len(tok) - 1)] or [tok]
        else:
            out.append(tok)
    return out


# ponytail: 先做标题命中加权，标题比正文更能代表主题；后续若需语义扩展再叠 LLM query expansion
_TITLE_BOOST = 3.0


def bm25_scores(query: str, corpus: dict[str, list[str]], **kw) -> list[tuple[str, float]]:
    """corpus: {id: tokens}。返回 [(id, score)] 降序。纯 stdlib BM25。"""
    n = len(corpus)
    if not n:
        return []
    avgdl = sum(len(t) for t in corpus.values()) / n
    df = Counter()
    for toks in corpus.values():
        df.update(set(toks))
    idf = {w: math.log(1 + (n - c + 0.5) / (c + 0.5)) for w, c in df.items()}
    q = _tokenize(query)
    if not q:
        return []
    k1, b = 1.5, 0.75
    out = []
    for cid, toks in corpus.items():
        tf = Counter(toks)
        dl = len(toks) or 1
        score = 0.0
        for w in set(q):
            c = tf.get(w, 0)
            if not c:
                continue
            score += idf.get(w, 0.0) * (c * (k1 + 1)) / (c + k1 * (1 - b + b * dl / avgdl))
        if score > 0:
            out.append((cid, score))
    out.sort(key=lambda x: -x[1])
    return out


def load_corpus() -> dict[str, dict]:
    """从 chromadb 读出全部文档并构建 BM25 语料。缓存到内存避免每次重建。"""
    global _CORPUS_CACHE
    if _CORPUS_CACHE is not None:
        return _CORPUS_CACHE
    res = collection().get(include=["documents", "metadatas"])
    docs = res.get("documents") or []
    metas = res.get("metadatas") or []
    ids = res.get("ids") or []
    corpus = {}
    for i, cid in enumerate(ids):
        title = (metas[i] or {}).get("title") or ""
        body = docs[i] or ""
        corpus[cid] = {
            "tokens": _tokenize(title) * int(_TITLE_BOOST) + _tokenize(body),
            "title": title,
            "meta": metas[i],
            "text": body,
        }
    _CORPUS_CACHE = corpus
    return corpus


_CORPUS_CACHE = None


def parse_note(path: Path):
    text = path.read_text(encoding="utf-8", errors="ignore")
    meta = {}
    body = text
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end >= 0:
            raw_meta = text[4:end]
            try:
                meta = yaml.safe_load(raw_meta) or {}
            except yaml.YAMLError:
                meta = _fallback_meta(raw_meta)
            body = text[end + 5 :]
    title = str(meta.get("name") or _h1(body) or path.stem)
    description = str(meta.get("description") or "")
    tags = meta.get("tags") or []
    if isinstance(tags, str):
        tags = [tags]
    published = str(meta.get("published") or "")
    searchable = "\n".join([title, description, " ".join(map(str, tags)), body])
    return {
        "title": title,
        "description": description,
        "tags": [str(x) for x in tags],
        "published": published,
        "pillars": meta.get("pillars"),
        "content_type": meta.get("content_type"),
        "path": str(path.relative_to(ROOT)),
        "absolute_path": str(path),
        "text": searchable,
    }


def _fallback_meta(raw: str):
    """Read the simple frontmatter fields used in this vault when YAML is lenient."""
    meta = {}
    for key in ("name", "description", "source", "published"):
        m = re.search(rf"^{key}:\s*[\"]?(.*?)[\"]?\s*$", raw, re.M)
        if m:
            meta[key] = m.group(1).replace('\\[', '[').replace('\\]', ']')
    m = re.search(r"^tags:\s*\[(.*?)\]\s*$", raw, re.M)
    if m:
        meta["tags"] = re.findall(r"[\"']([^\"']+)[\"']|([^,\s]+)", m.group(1))
        meta["tags"] = [a or b for a, b in meta["tags"]]
    return meta


def _h1(body):
    m = re.search(r"^#\s+(.+?)\s*$", body, re.M)
    return m.group(1).strip() if m else ""


def obsidian_link(path: str):
    return f"obsidian://open?path={quote(str((ROOT / path).resolve()))}"


def index():
    notes = [parse_note(p) for p in sorted(ARCHIVE.rglob("*.md"))]
    # 从 extract 产物补齐 pillars / content_type（这两个字段在 md 里没有，是 extract 打标出来的）
    derived = load_derived_meta()
    for n in notes:
        # key 用文件名（extract 输出以 filename 记录）
        d = derived.get(n["path"].split("/")[-1])
        if d:
            n["pillars"] = d["pillars"]
            n["content_type"] = d["content_type"]
    try:
        client().delete_collection(COLLECTION)
    except Exception:
        pass
    col = collection()
    if notes:
        # BM25 检索不再用 embedding，但 chromadb 要求 embeddings 参数 → 传单位占位向量
        # ponytail: chromadb 已退化为纯元数据存储，若后续嫌它重可直接换成 JSON 落盘
        col.upsert(
            ids=[n["path"] for n in notes],
            documents=[n["text"] for n in notes],
            embeddings=[[0.0] * 8 for _ in notes],
            metadatas=[serialize_meta(n) for n in notes],
        )
    global _CORPUS_CACHE
    _CORPUS_CACHE = None  # 索引变了要失效
    print(f"已索引 {len(notes)} 篇文章（BM25 语料）：{DATA / 'chroma'}")


def serialize_meta(n):
    """chromadb metadata 只接受标量/字符串，list 序列化成逗号串。"""
    def flat(v):
        if isinstance(v, list):
            return ",".join(map(str, v))
        return v or ""
    return {k: flat(n[k]) for k in ("title", "description", "published", "pillars", "content_type", "path", "absolute_path")}


def load_derived_meta():
    """从 extract_articles.py 的输出读取每篇的 pillars/content_type（按 path 映射）。"""
    try:
        with open(ARCHIVE / "outputs" / "articles_data.json", encoding="utf-8") as f:
            rows = json.load(f)
    except Exception:
        return {}
    out = {}
    for r in rows:
        out[r.get("path_rel") or r.get("filename")] = {
            "pillars": r.get("pillars") or [],
            "content_type": (r.get("content_type") or [None])[0] if isinstance(r.get("content_type"), list) else r.get("content_type"),
        }
    return out


def search(query: str, limit: int = 8, pillar: str | None = None, ctype: str | None = None):
    corpus = load_corpus()
    if not corpus:
        print("语料为空。请先运行：content_engine.py index")
        return []
    ranked = bm25_scores(query, {k: v["tokens"] for k, v in corpus.items()})
    rows = []
    for cid, score in ranked:
        m = corpus[cid]["meta"]
        if pillar and pillar not in (m.get("pillars") or "").split(","):
            continue
        if ctype and m.get("content_type") != ctype:
            continue
        rows.append((m, score))
        if len(rows) >= limit:
            break
    if not rows:
        print("没有找到匹配文章。请换更具体的关键词（BM25 按词频打分，太泛的词区分度低）。")
        return []
    for i, (meta, score) in enumerate(rows, 1):
        print(f"{i}. [{meta['title']}]({obsidian_link(meta['path'])})")
        print(f"   {meta.get('published','')} · 相关度 {score:.1f} · pillars:{meta.get('pillars','')} · 类型:{meta.get('content_type','')}")
        if meta.get("description"):
            print(f"   {meta['description']}")
    return [m for m, _ in rows]


def suggest(topic: str, limit: int = 5):
    """基于真实检索结果给选题参考。排期这种每周固定的事交给 cron/人，不在这里编。"""
    print(f"# 秋秋选题助手：{topic}\n")
    corpus = load_corpus()
    ranked = bm25_scores(topic, {k: v["tokens"] for k, v in corpus.items()})[:limit]
    if not ranked:
        print("没找到可参考的历史文章，换个更具体的说法试试。\n")
        return
    print("## 历史可参考（越靠前越相关）\n")
    for cid, score in ranked:
        m = corpus[cid]["meta"]
        desc = (m.get("description") or "").strip()
        print(f"- [{m['title']}]({obsidian_link(m['path'])}) — 相关度 {score:.1f}")
        print(f"  {m.get('published','')} · {m.get('pillars','')} · {m.get('content_type','')}")
        if desc:
            print(f"  {desc[:120]}")
    print("\n## 写之前先确认\n")
    print("1. 上面最相关的 1-2 篇，这次的**新角度**是什么？（不能是同样的经历重讲）")
    print("2. 有没有可落到纸上的**具体数字**？（存款额、月支出、天数、价格）")
    print("3. 这次要给读者的**一句话结论**是什么？")


def catalog():
    """盘点内容资产：按支柱/类型统计存量，帮内容生产看可复用资源。"""
    from collections import Counter
    col = collection()
    metas = col.get(include=["metadatas"])["metadatas"]
    p_c = Counter()
    t_c = Counter()
    n = 0
    for m in metas:
        for p in (m.get("pillars") or "").split(","):
            if p:
                p_c[p] += 1
        ct = m.get("content_type") or ""
        if ct:
            t_c[ct] += 1
        n += 1
    PILLAR_NAME = {"freedom": "财务自由", "lifestyle": "生活方式", "growth": "自我成长", "reading": "读书", "ai": "AI与工具", "geek": "好物分享"}
    TYPE_NAME = {"knowledge": "知识型", "experience": "经验型", "story": "故事型", "opinion": "观点型", "tutorial": "教程型", "review": "测评型", "list": "清单型", "reflection": "复盘型"}
    print(f"=== 内容资产台账（{n} 篇）===\n")
    print("[内容支柱分]")
    for pid, cnt in p_c.most_common():
        print(f"  {PILLAR_NAME.get(pid, pid)}: {cnt} 篇")
    print("\n[内容类型分]")
    for tid, cnt in t_c.most_common():
        print(f"  {TYPE_NAME.get(tid, tid)}: {cnt} 篇")
    print("\n提示：search 支持 --pillar 与 --type 过滤某个组合的内容，便于找材料复用。")


def main():
    parser = argparse.ArgumentParser(description="qiuqiu-content-engine")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("index", help="建立或更新本地向量索引")
    sub.add_parser("catalog", help="盘点内容资产（按支柱/类型统计存量）")
    s = sub.add_parser("search", help="搜索历史公众号文章")
    s.add_argument("query")
    s.add_argument("-n", "--limit", type=int, default=8)
    s.add_argument("--pillar", "--p", help="按内容支柱过滤，如 freedom/lifestyle/growth/reading/ai/geek")
    s.add_argument("--type", "--t", help="按内容类型过滤，如 knowledge/experience/story/opinion/tutorial/review/list/reflection")
    a = sub.add_parser("suggest", help="根据历史内容生成选题与排期建议")
    a.add_argument("topic")
    a.add_argument("-n", "--limit", type=int, default=5)
    args = parser.parse_args()
    {"index": index,
     "catalog": catalog,
     "search": lambda: search(args.query, args.limit, args.pillar, args.type),
     "suggest": lambda: suggest(args.topic, args.limit)}[args.command]()


if __name__ == "__main__":
    main()
