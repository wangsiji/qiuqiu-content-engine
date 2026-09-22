---
name: qiuqiu-writer
description: 公众号内容创作：当用户要求给「秋秋很开心」(妻视角) 或「思吉」(个人号) 写公众号内容时使用——覆盖选题、初稿、humanizer 去 AI 痕、实拍配图、md2wechat 发布全流程。秋秋起草→老婆润色，用户幕后不出台前。
version: 2.0.0
author: siji
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [wechat, content, writing, qiuqiu]
    category: content
---

# 秋秋内容创作 Skill v2（路由版）

> 本文件只做**路由 + 最高优先级规则**。所有细节在 `references/`，按需读取，不堆在这里。
> 设计哲学：把"1000 行经验"压缩成"200 行执行规则 + references 知识库"。

## 黄金 10 条（每次生成前默念）

1. 秋秋永远第一人称，绝不编造经历
2. 不确定的人物数据**禁止补全**（秋秋 vs 大老王严格区分）
3. 每个观点落到生活场景，不飘理论
4. 每段跟具体数字，全局至少一个"让人停下来"的震撼数字
5. AI 直接说，不包装不回避
6. 少讲大道理，多讲体验
7. 不写课程目录式分点（"方向有三个：一、二、三"）
8. 标题先定再写
9. 配图必须真实（小黑风格，地点驱动）
10. 结尾像朋友聊天（收尾三层：总结框 → 星标签名 → 转发指令）

## Rule Priority（规则冲突时听谁的）

| 优先级 | 层 | 说明 |
|--------|----|------|
| **P0** | 人设真实性 | 秋秋是谁、不许编造经历/数据。最高优先级 |
| **P1** | 已发布规律 | 老婆最终修改版本优先于任何通用规则 |
| **P2** | 文章目标 | 读者获得价值 > 作者表达欲 |
| **P3** | 写作技巧 | 数字、结构、标题、语气 |
| **P4** | 格式偏好 | markdown、emoji、排版 |

> 冲突示例：规则"不要大纲化"(P4) vs "概念文章用 1/2/3 分节"(P3) → 听 P3，概念类可编号，叙事类不编。

## Task Router（先分类再执行）

```
用户需求
  ↓ 是什么任务？
  A 选题  → 分支0（见 references/writing-rules.md 选题段）
  B 新写  → 路径A（写前必做→结构→初稿→配图→自查）
  C 修改  → 路径B（已有文章？编辑模式，不重新选题/搜素材/人设校准）
  D 润色  → 去 AI 味 + 语气校准（references/qiuqiu-mindset.md）
  E 标题  → 先定标题（references/article-patterns.md）
  F 配图  → 实拍规则（references/image-rules.md）
  G 发布  → md2wechat 发布优化
  H 抓成稿 → references/published-clip.md（走 mptext API，落初稿目录，三段式）
```

> **关键**：用户说"优化这篇文章"→ 检测已有文章 → 进 **C 编辑模式**，跳过选题/搜素材/人设校准。
> 用户说"抓这篇成稿/把某篇秋秋文章存进来"→ 进 **H**，跑 `scripts/clip_qiuqiu_published.py`，不进 Raw/（Raw 是 wsj-clip 普通剪藏落点）。

## 输入输出协议

**输入**（agent 先确认，缺则问）：
```
task:   write | edit | idea | image
topic:  主题
audience: 读者（秋秋粉/小白/同行）
goal:   这篇要解决什么
source_material: 已有素材/文章路径
tone:   秋秋 / 思吉
```

**输出**（写文章时固定结构）：
1. 标题候选 ×5
2. 核心角度（一句话）
3. 正文
4. 配图位置标注
5. 发布检查清单

## Pre-flight Check（生成前）

- [ ] 我知道文章目标（P2）
- [ ] 我知道读者是谁
- [ ] 我知道秋秋身份（P0，未编造经历）
- [ ] 找到至少 1 个真实数字
- [ ] 找到 1 个真实经历/场景
- [ ] 标题已定

## Post Check（生成后）

**先跑脚本，再人工过清单**（脚本能量化的别靠肉眼）：

```bash
cd ~/projects/qqhkx/qiuqiu-content-engine
python3 scripts/draft_check.py <草稿路径>     # 或 --stdin 接管道
```

它会用真实语料基线量：句长中位（基线 28）/ 每段数字个数（基线 0.53）/ 标题字数（基线 15.7）/ AI 套路词 / 公众号平台尾巴。**FAIL 项必须改，WARN 自己判断。**

然后人工确认脚本量不了的：

- [ ] AI 味清除（humanizer 化）— 脚本只能抓套路词，读一遍是否像人说话
- [ ] 有数字、有具体场景 — 脚本能数密度，但数字**是不是真的**只能你确认
- [ ] 配图位置标注、真实图
- [ ] 收尾三层结构完整
- [ ] 没踩 Never Do 列表

## Never Do（禁止行为）

- ❌ 编造秋秋经历 / 数据
- ❌ 把大老王经历（跑步成绩/编程/AI开发）写成秋秋
- ❌ 写课程销售感（"方向有三个：一、二、三"）
- ❌ 写 AI 行业新闻稿（堆参数无观点）
- ❌ 使用：赋能、闭环、底层逻辑、降维打击、抓手、沉淀（AI 黑话）
- ❌ 没有数字的空泛描述（"很多人""一般来说"）

## 引用导航（按需 read_file）

| 文件 | 内容 | 何时读 |
|------|------|--------|
| `references/qiuqiu-mindset.md` | 秋秋思维 OS（健康>生活>价值、心智模型、表达 DNA） | 人设校准/润色 |
| `references/writing-rules.md` | 写作规则全集（选题/数字/语气/分节/收尾）+ 执行流程分支 | 写任何内容前 |
| `references/article-patterns.md` | 文章结构模板（概念展开/叙事/钩子） | 新写/标题 |
| `references/ai-tool-comparison.md` | AI 工具对比/推荐类写法 | 写 AI 工具文 |
| `references/ai-daily-narrative-pattern.md` | AI 改变日常叙事（BEFORE/AFTER 反差法） | 写 AI 叙事文 |
| `references/image-rules.md` | 配图规则（小黑风格、地点驱动、实拍） | 配图 |
| `references/restart-template.md` | 重启/回归文模板 | 写回归类 |
| `references/vector-search.md` | 向量库辅助写作命令 | 选题/搜数字前 |
| `references/writing-samples.md` | 已发布文章样本（语气校准） | 仿写/润色 |
| `references/mistakes.md` | 踩坑记录（RULE 化，可执行） | 写前避坑 |
| `references/editorial-history.md` | 编辑修改历史（老婆改了什么） | 理解 P1 规律 |
| `references/published-clip.md` | 成稿抓取流程（mptext API + 三段式落初稿目录） | 抓已发表文章（任务 H） |

## 执行流程（概要）

1. **Router** 分类任务（A-H）
2. **Pre-flight** 确认输入齐
3. 按路径读对应 reference（如 B 新写 → writing-rules + article-patterns）
4. 生成（黄金 10 条 + Rule Priority 贯穿）
5. **Post Check** 自查
6. 输出固定结构
