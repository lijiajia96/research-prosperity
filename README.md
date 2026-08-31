# 科研兴盛度观测站

用年度曲线同时观察全球科研产出、顶刊质量、增长动量与社会关注度，并把绝对扩张、相对竞争力、预测不确定性和科研结构拆开分析。

在线访问：[research-prosperity-pulse.gaocherrr.chatgpt.site](https://research-prosperity-pulse.gaocherrr.chatgpt.site/)

## 运行时截图

### 全球科研领域总览

![全球科研领域综合指数总览](./public/screenshots/global-overview.png)

### 全部指标图表

| 综合指数 | 论文数量 |
| --- | --- |
| ![全球科研领域综合指数](./public/screenshots/prosperity-score.png) | ![全球科研领域顶刊论文数量](./public/screenshots/paper-count.png) |

| 质量 | 增长动量 |
| --- | --- |
| ![全球科研领域高被引论文占比](./public/screenshots/quality-score.png) | ![全球科研领域五年复合增长](./public/screenshots/growth-momentum.png) |

| 社会关注 | 社会增长 |
| --- | --- |
| ![全球科研领域社会关注度](./public/screenshots/social-attention-global.png) | ![全球科研领域社会关注五年增长](./public/screenshots/social-growth.png) |

#### 关注差

![全球科研领域社会关注与科研兴盛度排名差](./public/screenshots/attention-gap.png)

### 子领域与详细视图

| 工程学：论文数量 | 工程学：社会关注 |
| --- | --- |
| ![工程学 16 个子方向的顶刊论文数量趋势](./public/screenshots/engineering-subfields.png) | ![工程学 16 个子方向的社会关注度趋势](./public/screenshots/social-attention.png) |

| 计算机科学子方向 | 兴盛象限与领域详情 |
| --- | --- |
| ![计算机科学 11 个子方向的综合指数](./public/screenshots/computer-subfields.png) | ![计算机科学兴盛象限和领域详情](./public/screenshots/momentum-and-detail.png) |

## 功能概览

- 展示 2000—2026 年科研兴盛度年度曲线，2026 年数据以虚线标识为年内预测。
- 支持综合指数、论文数量、质量、五年增长、社会关注、社会增长与关注差切换。
- 工程学拆分为 16 个子方向，计算机科学也提供更细粒度的子领域视图。
- 单击曲线高亮，双击隐藏；图例中的已隐藏方向可以随时恢复。
- “证据拆解”将固定顶刊池的绝对活动指数与同层级论文份额指数放在同一基线下比较。
- 2026 年点预测同时展示历史波动区间，并给出滚动趋势模型的历史回测 MAPE。
- “结构健康”展示 2025 年主要国家、主要机构、跨国合作广度、有效多样性与集中度。
- 社会关注度以 Wikipedia 浏览份额为长期代理，新闻使用 GDELT 固定时间窗快照；两者均标注覆盖边界。

## 数据与方法

论文产出、引用和结构聚合主要来自 [OpenAlex](https://openalex.org/)。指标按年度聚合，并对不同量纲进行标准化后形成综合指数。绝对活动与同层级份额均以 2016—2019 年均值设为 100。结构快照按作者机构国家与机构 ID 聚合，同一篇跨国或跨机构论文可以进入多个组，不能解释为独占贡献。

近年引用质量存在成熟期，2026 年属于年内数据。点预测按历史同期完成比例校正；页面给出的 10%—90% 区间来自历史滚动趋势误差，是经验波动范围而非统计置信区间。

结构数据可用以下脚本重新聚合（结果会写入站点 JSON，接口响应缓存在 `.cache`）：

```bash
python3 scripts/fetch_structure.py
```

## 本地运行

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```
