#!/usr/bin/env python3
"""初稿自查：拿秋秋真实语料基线量你的草稿。

用法:
    python3 scripts/draft_check.py <草稿.md> [更多草稿.md...]
    python3 scripts/draft_check.py --stdin < draft.md

检查项（阈值来自 scripts/voice_probe.py 对最近 120 篇的实测）:
    句长 / 数字密度 / 标题长度 / AI 味词 / 结尾平台尾巴

退出码 0=通过，1=有超标的检查项（方便接 CI 或 pre-commit）。
"""
from __future__ import annotations

import re
import statistics
import sys
from pathlib import Path

# 基线：跑 scripts/voice_probe.py 可复算
BASE_SENT_MEDIAN = 28          # 句长中位
BASE_SENT_P90 = 55             # 句长 p90
BASE_NUM_PER_PARA = 0.53       # 每段数字个数的均值
BASE_TITLE_LEN = 15.7          # 标题平均字数

AI_SMELL = [
    "首先", "其次", "再次", "最后", "综上所述", "总而言之", "需要注意的是",
    "众所周知", "不难发现", "由此可见", "在这个", "随着.*的发展", "日益",
    "赋能", "抓手", "闭环", "对齐", "颗粒度", "底层逻辑", "打法",
    "让.*成为可能", "为.*保驾护航", "开启.*新篇章",
    "值得注意的是", "换句话说", "总结一下",
]
PLATFORM_TAILS = ["轻点两下取消在看", "点击上方", "关注我", "星标", "在看", "点赞"]

_NUM = re.compile(r"\d+(?:\.\d+)?\s*(?:万|块|元|年|个月|天|小时|分钟|%|％|公里|斤|件|次|篇|岁|倍|套|平米|平)")
_SENT_SPLIT = re.compile(r"[。！？!?；;\n]+")


def strip_markdown(text: str) -> str:
    text = re.sub(r"!\[.*?\]\(.*?\)", "", text)          # 图片
    text = re.sub(r"\[(.*?)\]\(.*?\)", r"\1", text)      # 链接保留文字
    text = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.S)  # frontmatter
    text = re.sub(r"[>#*`_|]", "", text)
    return text


def get_title(path: Path, raw: str) -> str:
    m = re.search(r"^(?:name|title):\s*\"?(.+?)\"?\s*$", raw, re.M)
    if m:
        return m.group(1)
    m = re.search(r"^#\s+(.+?)\s*$", raw, re.M)
    if m:
        return m.group(1)
    return re.sub(r"^\d{8}-", "", path.stem)


def check(raw: str, title: str) -> list[tuple[str, str, str]]:
    """返回 [(状态, 项目, 说明)]，状态 ∈ PASS/WARN/FAIL"""
    body = strip_markdown(raw)
    paras = [p.strip() for p in body.split("\n") if len(p.strip()) > 8]
    sents = [s.strip() for s in _SENT_SPLIT.split(" ".join(paras)) if len(s.strip()) >= 4]
    out = []

    # 1. 句长
    if sents:
        lens = sorted(len(s) for s in sents)
        med = statistics.median(lens)
        p90 = lens[int(len(lens) * 0.9)] if len(lens) >= 10 else lens[-1]
        if med <= BASE_SENT_MEDIAN * 1.3:
            out.append(("PASS", "句长", f"中位 {med:.0f} 字（基线 {BASE_SENT_MEDIAN}）"))
        else:
            out.append(("WARN", "句长", f"中位 {med:.0f} 字，偏长（基线 {BASE_SENT_MEDIAN}）。超过 {BASE_SENT_P90} 字的句子有 "
                                        f"{sum(1 for l in lens if l > BASE_SENT_P90)} 句，建议拆开"))

    # 2. 数字密度
    nums = len(_NUM.findall(" ".join(paras)))
    if paras:
        density = nums / len(paras)
        if density >= BASE_NUM_PER_PARA * 0.6:
            out.append(("PASS", "数字密度", f"{density:.2f} 个/段（基线 {BASE_NUM_PER_PARA}），共 {nums} 个数字"))
        else:
            out.append(("FAIL", "数字密度", f"{density:.2f} 个/段，明显低于基线 {BASE_NUM_PER_PARA}。"
                                            f"秋秋语料约两段一个数字——补真实数字，别编"))

    # 3. 标题
    tl = len(title)
    if abs(tl - BASE_TITLE_LEN) <= 6:
        out.append(("PASS", "标题", f"{tl} 字（基线 {BASE_TITLE_LEN:.0f}）"))
    elif tl > BASE_TITLE_LEN + 6:
        out.append(("WARN", "标题", f"{tl} 字，比基线 {BASE_TITLE_LEN:.0f} 长，考虑砍到 20 字内"))
    else:
        out.append(("WARN", "标题", f"{tl} 字，偏短（基线 {BASE_TITLE_LEN:.0f}），信息量可能不够"))

    # 4. AI 味
    hits = []
    for w in AI_SMELL:
        if re.search(w, raw):
            hits.append(w.rstrip(".*"))
    if not hits:
        out.append(("PASS", "AI 味", "未命中常见 AI 套路词"))
    else:
        out.append(("FAIL", "AI 味", f"命中 {len(hits)} 个：{'、'.join(hits[:8])}"))

    # 5. 平台尾巴（不是秋秋的表达习惯）
    tails = [t for t in PLATFORM_TAILS if t in raw[-400:]]
    if tails:
        out.append(("WARN", "结尾", f"文末有平台尾巴：{'、'.join(tails)}——那是公众号 UI 残留，不是她的表达"))
    else:
        out.append(("PASS", "结尾", "无平台尾巴残留"))

    return out


def main() -> int:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2
    if args[0] == "--stdin":
        targets = [("<stdin>", sys.stdin.read())]
    else:
        targets = []
        for a in args:
            p = Path(a)
            if not p.exists():
                print(f"跳过（不存在）: {a}")
                continue
            targets.append((str(p), p.read_text(encoding="utf-8", errors="ignore")))

    failed = 0
    for name, raw in targets:
        title = get_title(Path(name), raw)
        results = check(raw, title)
        print(f"\n=== {name} ===")
        print(f"标题：{title}\n")
        for status, item, note in results:
            mark = {"PASS": "  ✓", "WARN": "  !", "FAIL": "  ✗"}[status]
            print(f"{mark} {item}：{note}")
            if status == "FAIL":
                failed += 1
    print()
    if failed:
        print(f"有 {failed} 项未达标（FAIL）。上面的 W/! 是提醒，自己判断。")
    else:
        print("全部通过。")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
