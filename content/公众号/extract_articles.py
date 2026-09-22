#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""批量提取公众号文章元数据和正文内容，输出 JSON 供后续分析。

v2: 读入 config/taxonomy.json，用 aliases 自动给每篇打【内容支柱 pillar】和【内容类型 content_type】标签
    （读取时动态判断，不改动原始 md 文件）。统计增加 pillar / 类型的分布。
"""
import os
import re
import json
import glob
import hashlib
import sys
import urllib.request
import urllib.error
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))
TAXONOMY_PATH = os.path.join(ROOT, "config", "taxonomy.json")
LLM_CACHE_PATH = os.path.join(BASE_DIR, "outputs", "llm_cache.json")
LLM_ENABLED = os.environ.get("QIUQIU_LLM", "1") != "0"
LLM_URL = "https://chatapi.weixin.qq.com/openai/v1/chat/completions"
LLM_MODEL = os.environ.get("QIUQIU_LLM_MODEL", "Deepseek-v4-flash")
LLM_DELAY = float(os.environ.get("QIUQIU_LLM_DELAY", "1.2"))  # 请求间最小间隔, 网关 429 限流
import time as _t

_llm_last_call = 0.0


def _llm_pace():
    """限速两次 LLM 请求间隔，避免网关 429。"""
    global _llm_last_call
    now = _t.time()
    if now - _llm_last_call < LLM_DELAY:
        _t.sleep(LLM_DELAY - (now - _llm_last_call))
    _llm_last_call = _t.time()


def load_taxonomy():
    """读取 config/taxonomy.json 内容地图，返回 (pillars, content_types)。"""
    with open(TAXONOMY_PATH, "r", encoding="utf-8") as f:
        tax = json.load(f)
    return tax.get("pillars", []), tax.get("content_types", [])


# --------------------------- LLM 语义打标 ---------------------------
# ponytail: 单进程 dict 缓存 + json, 够用; 需并发再换 sqlite.

def _llm_token():
    """读 CODING_PLAN_TOKEN（weixin 网关 key）。"""
    for path in (os.path.expanduser("~/.hermes/.env"),):
        try:
            for line in open(path):
                if line.startswith("CODING_PLAN_TOKEN="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
        except OSError:
            pass
    return os.environ.get("CODING_PLAN_TOKEN", "")


def _taxonomy_desc(items, with_aliases):
    parts = []
    for it in items:
        s = it["id"] + "(" + it["name"]
        if it.get("why"):
            s += ":" + it["why"]
        if with_aliases and it.get("aliases"):
            s += "; 相关词:" + "/".join(it["aliases"][:6])
        parts.append(s + ")")
    return "; ".join(parts)


def _llm_classify(pillars, content_types, title, body, cache=None):
    """调 LLM 对单篇分类, 结果缓存于 cache(dict)。成功返回 (pillars_hit,types_hit)。
    任何异常/解析失败返回 None, 由调用方回退到 alias。"""
    if cache is None:
        cache = {}
    key = hashlib.sha1((title + "\n" + body[:300]).encode("utf-8")).hexdigest()
    if key in cache:
        return cache[key]
    valid_p = {p["id"] for p in pillars}
    valid_t = {t["id"] for t in content_types}
    prompt = (
        "你是中文公众号文章内容分类器，只依据正文判断主题，千万不要因为正文提到某些类别词就套标签。\n"
        "可选支柱 pillar（最多3个，按贴切度）:\n" + _taxonomy_desc(pillars, True) + "\n"
        "可选内容类型 content_type（单选最贴切）:\n" + _taxonomy_desc(content_types, False) + "\n\n"
        "标题: " + title + "\n正文开头: " + body[:500] + "\n\n"
        '只输出一行 JSON: {"pillars":["id"...],"content_type":"id"}'
    )
    try:
        for attempt in range(1, 5):
            _llm_pace()
            try:
                req = urllib.request.Request(
                    LLM_URL,
                    data=json.dumps({
                        "model": LLM_MODEL,
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 100, "temperature": 0,
                    }).encode(),
                    headers={"Authorization": "Bearer " + _llm_token(), "Content-Type": "application/json"},
                )
                resp = json.loads(urllib.request.urlopen(req, timeout=60).read())
                break
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < 4:
                    pause = 2 ** attempt * 2  # 4,8,16s
                    print("    [llm 429] " + title[:16] + " 等待 " + str(pause) + "s", file=sys.stderr)
                    _t.sleep(pause)
                    continue
                raise
        else:
            return None
        m = re.search(r"\{.*\}", resp["choices"][0]["message"]["content"], re.DOTALL)
        if not m:
            return None
        data = json.loads(m.group(0))
        ph = [p for p in data.get("pillars", []) if p in valid_p]
        th = [t for t in (data.get("content_type"),) if t in valid_t]
        result = (ph, th)
        if ph:
            cache[key] = result
        return result
    except Exception as e:
        print("    [llm降级] " + title[:20] + ": " + str(e), file=sys.stderr)
        return None


def classify_article(pillars, content_types, title, description, tags, body, cache=None):
    """打标: LLM 优先(成功且非空则用), 否则回退 alias 子串。cache 跨调用复用, 供运行时全局缓存。"""
    if cache is None:
        cache = {}
    if LLM_ENABLED:
        res = _llm_classify(pillars, content_types, title, body, cache)
        if res and res[0]:
            return res
    haystack = " ".join([title, description, " ".join(map(str, tags)), body[:400]])
    return classify_by_alias(pillars, haystack), classify_by_alias(content_types, haystack)


def classify_by_alias(items, haystack):
    """用各 item.aliases 在 haystack 中匹配，返回命中的 id 列表。"""
    hits = []
    for item in items:
        for alias in item.get("aliases", []):
            if alias and alias.lower() in haystack.lower():
                hits.append(item["id"])
                break
    return hits


def parse_front_matter(text):
    """解析 YAML front matter。"""
    meta = {}
    if not text.startswith("---"):
        return meta, text
    end = text.find("---", 3)
    if end == -1:
        return meta, text
    fm = text[3:end].strip()
    body = text[end+3:].strip()
    for line in fm.split("\n"):
        line = line.strip()
        if ":" in line:
            key, _, val = line.partition(":")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key == "tags":
                # 提取 tags 数组
                tags = re.findall(r'"([^"]*)"', val)
                if not tags:
                    tags = re.findall(r"'([^']*)'", val)
                meta[key] = tags
            elif key == "category":
                meta[key] = val
            else:
                meta[key] = val
    return meta, body


def clean_body(body):
    """清理正文，去除图片、链接、格式标记，返回纯文本。"""
    text = re.sub(r'!\[.*?\]\(.*?\)', '', body)
    text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)
    text = re.sub(r'\[([^\[\]]*)\]\([^)]*\)', r'\1', text)
    text = re.sub(r'^#+\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'\*+', '', text)
    text = re.sub(r'_+', '', text)
    text = re.sub(r'^>\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'^[-*+]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\d+\.\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def extract_date_from_filename(filename):
    """从文件名提取日期，如 20230202 -> 2023-02-02。"""
    m = re.match(r'(\d{8})', filename)
    if m:
        try:
            return datetime.strptime(m.group(1), "%Y%m%d").strftime("%Y-%m-%d")
        except Exception:
            pass
    return None


def process_file(filepath, account_name, pillars, content_types, cache=None):
    """处理单篇文章。cache: 传给 classify 的 LLM 结果缓存 dict, 缺省空(不缓存)。"""
    filename = os.path.basename(filepath)
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            raw = f.read()
    except Exception as e:
        print(f"读取失败 {filename}: {e}")
        return None

    meta, body = parse_front_matter(raw)
    clean_text = clean_body(body)
    word_count = len(re.sub(r'\s', '', clean_text))

    # 标题优先用 front matter 的 name，否则用文件名
    title = meta.get("name", "") or (re.sub(r'\.md$', '', re.sub(r'^\d{8}-', '', filename)))
    date = meta.get("published", "") or extract_date_from_filename(filename)
    description = meta.get("description", "")
    tags = meta.get("tags", [])
    source = meta.get("source", "")

    # 用 taxonomy 打标（v3: LLM 语义优先，alias 回退，不改原文件）
    pillars_hit, types_hit = classify_article(
        pillars, content_types, title, description, tags, clean_text, cache)

    return {
        "id": f"qq-{date.replace('-', '') if date else 'nodate'}-{filename.split('-')[-1].replace('.md', '')}",
        "filename": filename,
        "account": account_name,
        "title": title,
        "date": date,
        "description": description,
        "tags": tags,
        "source": source,
        "word_count": word_count,
        "pillars": pillars_hit,      # 自动识别的内容支柱（财务自由/生活方式/...）
        "content_type": types_hit,    # 自动识别的内容类型（知识/经验/故事/...）
        "content_preview": clean_text[:500],
        "content_full": clean_text,
    }


def main():
    pillars, content_types = load_taxonomy()
    pillar_name = {p["id"]: p["name"] for p in pillars}
    type_name = {t["id"]: t["name"] for t in content_types}

    all_articles = []
    cache = {}
    if os.path.exists(LLM_CACHE_PATH):
        try:
            with open(LLM_CACHE_PATH, "r", encoding="utf-8") as f:
                cache = json.load(f)
        except (OSError, ValueError):
            cache = {}
    for folder in ["《秋秋很开心》", "《秋秋在分享》"]:
        folder_path = os.path.join(BASE_DIR, folder)
        account_name = folder.strip("《》")
        files = glob.glob(os.path.join(folder_path, "*.md"))
        print(f"处理 {account_name}: {len(files)} 篇")
        for fp in sorted(files):
            article = process_file(fp, account_name, pillars, content_types, cache)
            if article:
                all_articles.append(article)
    if LLM_ENABLED and cache:
        with open(LLM_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=1)

    # 按日期排序
    all_articles.sort(key=lambda x: x.get("date") or "0000-00-00")

    # 输出完整 JSON
    output_dir = os.path.join(BASE_DIR, "outputs")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "articles_data.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_articles, f, ensure_ascii=False, indent=2)

    # 输出统计摘要
    print(f"\n=== 统计摘要 ===")
    print(f"总文章数: {len(all_articles)}")
    dates = [a["date"] for a in all_articles if a["date"]]
    if dates:
        print(f"时间范围: {min(dates)} ~ {max(dates)}")
    total_words = sum(a["word_count"] for a in all_articles)
    print(f"总字数: {total_words:,}")
    print(f"平均字数: {total_words // len(all_articles):,}")

    # 按公众号统计
    for acc in ["秋秋很开心", "秋秋在分享"]:
        sub = [a for a in all_articles if a["account"] == acc]
        print(f"  {acc}: {len(sub)} 篇, {sum(a['word_count'] for a in sub):,} 字")

    # ---- 新增: pillar 分布 ----
    from collections import Counter
    p_counter = Counter()
    t_counter = Counter()
    for a in all_articles:
        for p in a["pillars"]:
            p_counter[p] += 1
        for t in a["content_type"]:
            t_counter[t] += 1

    if p_counter:
        print("\n=== Pillar 分布 ===")
        for pid, cnt in p_counter.most_common():
            print(f"  {pillar_name.get(pid, pid)}: {cnt} 篇")
    if t_counter:
        print("\n=== 内容类型分布 ===")
        for tid, cnt in t_counter.most_common():
            print(f"  {type_name.get(tid, tid)}: {cnt} 篇")

    print(f"\n数据已保存到: {output_path}")


if __name__ == "__main__":
    main()