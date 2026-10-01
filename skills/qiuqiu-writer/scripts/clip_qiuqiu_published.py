#!/usr/bin/env python3
"""
clip_qiuqiu_published.py — 抓取「秋秋很开心」已发表文章成稿，存入初稿目录。

用法：
  python3 clip_qiuqiu_published.py <文章URL> [--name 自定义文件名]

流程：
  1. 走 down.mptext.top API（/download?format=html 抓正文，游客可用）
  2. 走 /download?format=json 拿 metadata（标题等）
  3. 清洗 HTML → 干净 Markdown 正文
  4. 按三段式（初稿/AI智能总结/成稿）写入
     00-LLM-WiKi/Outputs/秋秋很开心初稿/<name>.md

注意：
  - 这是 wsj-clip 提取流程的「成稿专用变体」，落点为初稿目录而非 Raw/
  - 初稿/AI 智能总结 两节留空，待人工填写
  - wsj-clip 为手写 skill，本脚本不修改它，仅复用其 API 与清洗逻辑
"""
import sys
import os
import re
import html
import json
import urllib.request
import urllib.parse
import argparse

API_BASE = "https://down.mptext.top/api/public/v1/download"
OUT_DIR = os.path.expanduser(
    "~/Obsidian/wsj-second-brain/00-LLM-WiKi/Outputs/秋秋很开心初稿"
)

def fetch(url: str, fmt: str) -> str:
    api_url = f"{API_BASE}?url={urllib.parse.quote(url)}&format={fmt}"
    req = urllib.request.Request(api_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="ignore")

def clean_html_to_md(html_text: str) -> str:
    """清洗 mptext html 输出 → 干净 Markdown 正文（基于 wsj-clip 清理规则）"""
    txt = re.sub(r"<script[\s\S]*?</script>", "", html_text)
    txt = re.sub(r"<style[\s\S]*?</style>", "", txt)
    txt = re.sub(r"<[^>]+>", "\n", txt)
    txt = html.unescape(txt)
    lines = [l.strip() for l in txt.splitlines()]

    # 找正文起点（图：@秋秋）
    start = 0
    for i, l in enumerate(lines):
        if l.startswith("图：@秋秋"):
            start = i
            break
    body = lines[start:]

    # 去噪音行
    noise = {
        "原创", "去阅读", "在小说阅读器中沉浸阅读", "点击关注",
        "赞", "分享", "在看", "朋友，TA也想看", "修改于",
    }
    cleaned = []
    prev_blank = False
    for l in body:
        if l in noise:
            prev_blank = True  # 跳过噪音后允许一个空行
            continue
        if l == "":
            if prev_blank:
                continue
            prev_blank = True
        else:
            prev_blank = False
        cleaned.append(l)

    text = "\n".join(cleaned).strip()

    # 截断尾部组件（"分享"/"朋友"之后）
    for marker in ["\n“分享”", "\n朋友，TA也想看", "\n修改于"]:
        idx = text.find(marker)
        if idx > 0:
            text = text[:idx].strip()
            break
    return text

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url", help="公众号文章链接")
    ap.add_argument("--name", help="自定义文件名（不含.md）", default=None)
    args = ap.parse_args()

    print(f"→ 抓取: {args.url}")
    # 1. 正文 html
    try:
        html_text = fetch(args.url, "html")
    except Exception as e:
        print(f"❌ HTML 抓取失败: {e}")
        sys.exit(1)

    # 2. metadata json（标题）
    title = ""
    try:
        meta = json.loads(fetch(args.url, "json"))
        title = meta.get("title", "")
    except Exception:
        pass  # json 可能无关键，忽略

    # 3. 清洗
    pub_body = clean_html_to_md(html_text)
    if not pub_body:
        print("❌ 正文为空，抓取可能失败")
        sys.exit(1)
    print(f"✅ 正文 {len(pub_body)} 字" + (f" | 标题: {title}" if title else ""))

    # 4. 文件名
    if args.name:
        name = args.name
    else:
        # 从 URL 提取防伪串作默认名，避免中文标题文件系统问题
        m = re.search(r"/([A-Za-z0-9_-]{10,})", args.url)
        name = f"秋秋很开心_成稿_{m.group(1) if m else 'untitled'}"
    if not name.startswith("秋秋很开心_"):
        name = f"秋秋很开心_{name}"

    # 5. 写文件（三段式）
    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f"{name}.md")
    if os.path.exists(out_path):
        print(f"⚠️ 已存在，跳过: {out_path}")
        sys.exit(0)

    content = f"""---
name: {name}
description: 图：@秋秋
category:
  - "[[自媒体：秋秋很开心]]"
tags: [秋秋很开心, 成稿]
click:
url: {args.url}
published:
---

## 初稿

> 待填写（草稿底稿）

---

## AI 智能总结

> 待填写（成稿要点提炼）

---

## 成稿

{pub_body}

"""
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"✅ 已保存: {out_path}")

if __name__ == "__main__":
    main()
