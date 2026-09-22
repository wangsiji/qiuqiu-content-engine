#!/usr/bin/env python3
"""从真实语料统计 Voice DNA：句型长度、高频词、标题模式、数字使用密度。
输出事实数据，不靠猜。"""
import re, collections, statistics, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # repo root

# 取近 2 年文章（最能代表现在的声音）
recent = sorted(
    list((ROOT / 'content/公众号/《秋秋很开心》').glob('*.md')) +
    list((ROOT / 'content/公众号/《秋秋在分享》').glob('*.md')),
    key=lambda p: p.name, reverse=True)[:120]
print(f'样本文章数: {len(recent)}')

titles, sentences, openers, closers = [], [], [], []
num_per_article = []

for f in recent:
    p = Path(f)
    t = p.read_text(encoding='utf-8', errors='ignore')
    m = re.search(r'^---\n(.*?)\n---\n', t, re.S)
    if not m: continue
    fm = m.group(1); body = t[m.end():]
    # 标题
    tm = re.search(r'^(?:name|title):\s*"?(.+?)"?\s*$', fm, re.M)
    title = tm.group(1) if tm else p.stem
    # 去掉日期前缀格式的文件名 fallback
    if not tm:
        title = re.sub(r'^\d{8}-', '', p.stem)
    titles.append(title)
    # 正文清洗
    body = re.sub(r'!\[.*?\]\(.*?\)', '', body)          # 图片
    body = re.sub(r'\[.*?\]\(.*?\)', '', body)            # 链接
    body = re.sub(r'[>#*`_\-]', '', body)
    paras = [x.strip() for x in body.split('\n') if len(x.strip()) > 8]
    if not paras: continue
    openers.append(paras[0][:60])
    closers.append(paras[-1][:60])
    # 句子
    sents = [s.strip() for s in re.split(r'[。！？!?\n]', ' '.join(paras)) if len(s.strip()) >= 4]
    sentences.extend(sents)
    # 数字密度
    nums = re.findall(r'\d+(?:\.\d+)?%?', ' '.join(paras))
    num_per_article.append(len(nums) / max(1, len(paras)))

print('\n=== 1. 句子长度（字）===')
lens = [len(s) for s in sentences]
lens.sort()
print(f'  中位数 {statistics.median(lens):.0f} | 均值 {statistics.mean(lens):.1f}')
print(f'  p25={lens[len(lens)//4]}  p75={lens[len(lens)*3//4]}  p90={lens[int(len(lens)*0.9)]}')
short = sum(1 for l in lens if l <= 15)
print(f'  短句(<=15字)占比: {short/len(lens)*100:.0f}%')

print('\n=== 2. 每段数字密度（个/段）===')
print(f'  均值 {statistics.mean(num_per_article):.2f} | 中位 {statistics.median(num_per_article):.2f}')

print('\n=== 3. 标题模式 ===')
pats = collections.Counter()
for t in titles:
    if re.search(r'[！!]', t): pats['带感叹号'] += 1
    if re.search(r'[？?]', t): pats['带问号'] += 1
    if re.search(r'\d', t): pats['带数字'] += 1
    if re.search(r'[｜|]', t): pats['带竖线分隔'] += 1
    if re.search(r'^（\d+/\d+）|^\[\d', t): pats['带序号(1/100)'] += 1
    if re.search(r'篇|攻略|干货|技巧|清单|分享|测评', t): pats['含栏目词'] += 1
for k, v in pats.most_common():
    print(f'  {k}: {v}/{len(titles)} ({v/len(titles)*100:.0f}%)')
print(f'  标题平均长度: {statistics.mean([len(t) for t in titles]):.1f} 字')

print('\n=== 4. 高频词（去停用词后的实词）===')
STOP = set('的了是我你他她我们你们就不都很也还要会能没这个那个什么怎么可以因为所以但是然后就是一段一种一个一下有点非常真的好的话时候现在自己已经还是这样那样以及通过对于关于之乎者也啊吧呢嘛呀哦诶'.strip())
words = collections.Counter()
for s in sentences:
    for tok in re.findall(r'[\u4e00-\u9fff]{2,4}', s):
        if not (set(tok) & STOP):
            words[tok] += 1
for w, c in words.most_common(40):
    print(f'  {w}: {c}', end='  |  ' if c else '')
print()

print('\n=== 5. 开头模式（前 5 条样本）===')
for o in openers[:5]: print('  ', o)
print('\n=== 6. 结尾模式（前 5 条样本）===')
for c in closers[:5]: print('  ', c)
