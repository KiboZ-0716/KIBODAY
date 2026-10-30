# K!B0 每日情报日报

一个把「今天真正值得关注的事」做成日报形态的静态站点，配套一条可复跑的内容管线。
原型与源码见 `../ref/`，需求与方案见 `../docs/KIB0-需求清单与技术方案.md`。

---

## 1. 它是什么

- **不是模板站**：每一期的头条、速览、解读、追踪节点，都是管线跑出来的结构化数据，站点只是渲染器。
- **不是 demo**：管线有真实阶段（抓取 → 归一化去重 → 事件聚类 → 信源核验 → 编排 → 素材处理），
  每个阶段都可单独跑、单独看中间产物。
- **静态交付**：构建产物是纯静态文件，任何 CDN / 静态托管都能跑。除了「深挖」这一处会调用模型，其余页面零网络请求。

## 2. 目录结构

```
kib0/
├── content/                 # 内容源（人工维护 + 抓取落盘）
│   ├── raw/                 # 抓取结果，按日期一份 JSON（20 条/期）
│   ├── briefs/              # 编辑侧配置：主线选谁、深度解读写什么、区域条目
│   ├── storylines.json      # 事件脉络（跨天持续追踪的节点库）
│   ├── prompts/             # 提示词模板（event-report：事件报告；weekly-brief：AI 周报）
│   ├── reports/             # 离线预生成报告（可选，首次打开时直接展示）
│   ├── weekly/              # AI 周报内容，一期一份 JSON（W43、W44…）
│   ├── feeds.json           # RSS 源清单
│   └── images/              # 素材入库（原图 → 自动转 WebP 多尺寸）
├── pipeline/                # 出品管线
│   ├── run.mjs              # 入口：--all / --date=YYYY-MM-DD
│   ├── lib.mjs              # 读写、文本相似度、去重分组等工具
│   ├── sources/             # 抓取适配器：snapshot（落盘快照）、rss
│   └── stages/              # normalize → cluster → verify → compose → assets → topics/report → weekly
├── src/                     # 站点
│   ├── data/                # 数据层：issues/*.json、topics.json、weekly.json 为管线产物，index.ts 提供查询
│   ├── components/          # 版块组件（首页 13 个版块）
│   ├── pages/               # 视图：今日 / 归档 / 专题 / 速览 / 搜索 / 深度解读 / 追踪 / 事件报告 / AI 周报
│   ├── lib/                 # cloud.ts（模型通道）、deepdive.ts（提示词与调用）、hooks、ui
│   └── styles/              # tokens / reset / app / pages / weekly
├── scripts/                 # 工具：配图预处理、内容补丁、CDP 截图、溢出检测、深挖验证
└── public/                  # 静态资源
```

## 3. 一条日报是怎么生成的

```
content/raw/2026-10-30.json          20 条抓取文稿（标题、信源、时间、URL、摘要、实体）
        │
        ├─ normalize   字段归一、时间/信源清洗、抽取归并键 eventKey
        ├─ cluster     按归并键聚合，无键时降级为「实体重合 + 标题相似」双条件
        ├─ verify      信源计数、置信度打分、低于阈值的内容隐藏（不静默发布）
        ├─ compose     选主线、排速览、写解读、挂追踪节点、算可信度评分
        ├─ assets      配图三级降级：原文图 → 授权图库 → 数据卡（永不空图）
        ├─ topics      导出可深挖条目索引（速览 + 地区条目，带同源报道）
        └─ report      离线预生成少量报告，供首次打开时直接展示（可选）
        ▼
src/data/issues/2026-10-30.json      站点消费的结构化一期
        ▼
vite build → dist/                   静态产物，部署即上线
```

每个阶段都可以单独观察，跑完会在终端打印这一期的漏斗：

```
· 2026-10-30  抓取 20 → 去重 19（合并 1）→ 事件 14（隐藏 2）
  写入 src/data/issues/2026-10-30.json  可信度 73
```

## 4. 常用命令

```bash
npm install
npm run issue          # 跑全部期次（重新生成 src/data/issues/*.json）
npm run issue:today    # 只跑今天
npm run dev            # 本地开发 http://localhost:5173
npm run build          # 类型检查 + 构建到 dist/
npm run preview        # 预览构建产物 http://localhost:4173
npm run push:content   # 把 src/data 打成内容包上传到云数据库（出刊用，不需重新部署）
```

## 4.1 深挖：点击后实时调模型

每条速览、以及「与你有关」里的每条地区新闻，右/下方都有「深挖」。

**点击 → 进入报告页 → 浏览器直接调用模型 → 流式生成 → 渲染成报告。** 不是构建期预生成，也不是模板拼装。

| 环节 | 实现 |
|---|---|
| 模型通道 | `@tencent-ai/workbuddy-cloud-sdk` 的 `cloud.llm`，免密钥，`publishableKey` 只能在本应用发布域名下使用 |
| 提示词 | `content/prompts/event-report.md`（`event-report` `v1.2`），站点侧与文件保持同一口径 |
| 输入素材 | `src/data/topics.json`：每条可深挖条目的标题、摘要、标签、同源报道列表，由管线生成 |
| 输出 | 三句话结论 / 发生了什么 / 为什么 / 谁受影响 / 还不清楚的部分 / 可核查事实 / 信源侧重 / 待解问题 |
| 缓存 | 生成结果存在本机 `localStorage`，换设备会重新生成；页面标注生成时间与模型名，可随时「重新深挖」 |
| 中止 | 生成中可「停止」，已生成部分不落盘 |

报告页会明确写出当前状态：`正在调用模型深挖 · 已输出 N 字` → `模型实时生成 · 模型名 · 生成时间`；失败时给出可执行的提示（额度、频率、模型不可用），不静默失败。

`content/reports/*.json` 里的离线产出仍然保留，作用是**首次打开时能立刻看到一份现成报告**，页面上标为「构建期预生成 · 可随时重新深挖」。它不是必需项——删掉也能正常深挖，只是首次要等模型几十秒。

模型选择：优先 `hunyuan-chat`（实测中文 JSON 稳定、约 10 秒出完整报告）。`onlyReasoning` 类模型只吐思考过程、不吐正文，已在选型里排除。

## 4.2 AI 周报：站点的第二本刊物

顶栏右侧红色「AI 周报」按钮进入 `#/ai-weekly`（顶栏最显眼的动作位；900px 以下导航让位，这个入口仍保留）。定位是给产品经理与项目经理的行业周报：
一周 3 条深读（事实 / 为什么重要 / 两个角色该做什么 / 本周行动 + 来源），加发布速览、趋势判断、行动清单。

```
content/weekly/2026-W44.json    一期周报（编辑撰写，事实均附公开来源）
        │
        └─ pipeline/stages/weekly.mjs   校验字段 → 按期排序 → 派生统计
        ▼
src/data/weekly.json            current（本期）+ archive（往期列表）+ issues（全部期次）
        ▼
src/pages/WeeklyPage.tsx        #/ai-weekly、#/ai-weekly/:id 两个路由共用
```

写作口径见 `content/prompts/weekly-brief.md`。加一期只要在 `content/weekly/` 放一份同结构 JSON，
重跑 `npm run issue && npm run build`：本期自动变成新的 `current`，旧的进「往期周报」侧栏，不需要改代码。
字段缺失会直接报错（`weekly.mjs` 里逐项校验），不会静默补空。

## 5. 自动更新：内容在云端，站点不用重新部署（2026-10-30 起）

**正式链接（唯一、不再变）**：https://daily-hotspot-brief-88193.app.workbuddy.host/?sharecode=WCAFAHKWMG

**核心机制 —— 内容与版式分离**：站点一次性发布后，页面启动时从**云数据库**读一份「内容包」；每日出刊只是往库里写一行，不重新部署、不换链接。

```
搜索 → content/raw + content/briefs（或 content/weekly）
     → node pipeline/run.mjs --all
     → npm run push:content        # 打成内容包写入云数据库 kib0_content 表
     → 读者刷新即可看到最新一期
```

- **云数据库**：应用 `wbapp_U6IarWrMqRm6vY3hw9TgUI` 的库，表 `kib0_content`（`id='bundle'`，`payload` 为整站数据 JSONB）。公开读；写入用 `publishableKey` 以服务端身份调用（无 Origin 头，已实测 201）。
- **前端**：`src/lib/livecontent.ts` 启动时拉取（2.5 秒超时），云端数据更新才覆盖，`src/data/index.ts` 用活绑定整体替换数据集。构建期数据是兜底。
- **`?debug` 参数**：页面右下角显示「内容来源：云端内容包 / 构建期数据 + 日期」，用于现场确认云端是否生效。
- **定时任务**：「KIB0 日报·每天 8:30」与「KIB0 AI周报·每周五 8:30」，工作目录 `/workspace/kib0/kib0`，均由云端调度执行，关机照常出刊。任务只生成内容并上传，**不做构建、不做发布**。
- **何时才需要重新部署**：改页面版式、组件、样式或逻辑时。内容更新永远不需要。
- **同步约定（重要）**：本地与云端是两份代码。任何代码改动都要重新打包上传覆盖云端，否则云端一直用旧代码：

```bash
python scripts/pack-source.py            # 生成 个人作品/kib0-source.zip（已排除依赖与产物）
# 在 App 端上传该 zip，解压覆盖 /workspace/kib0/kib0
```

- **失败不影响线上**：任务报错就停在原地，线上保持上一期内容，不会出现半成品。
- **云服务凭据与域名绑定**：服务端按 Origin 精确校验，同一把 `publishableKey` 换域名会返回 `403 access_denied`。所以域名不能换；`src/lib/cloud.ts` 按 `location.host` 维护多套配置，旧域名那套已配好。
- 老的三条任务（指向旧项目 `daily-hotspot-report`，会覆盖同一链接）已全部暂停，勿再启用。

## 5.1 本机流程（备查）

1. 把当天抓取结果落到 `content/raw/YYYY-MM-DD.json`（真实抓取走 `pipeline/sources/rss.mjs`，
   接自己的抓取器只需按同结构输出）；
2. 在 `content/briefs/YYYY-MM-DD.json` 里定主线、写解读、选区域条目；
3. `npm run issue:today && npm run build`，产物即新一期；
4. 部署 `dist/`。

期号、日期、统计数字全部由数据推导，不写死。连续性由 `storylines.json` 的节点推进保证——
今天的主线明天自动变成「已过去的节点」，不需手工改站点。

## 6. 设计口径（与原型一致的部分）

| 项 | 口径 |
|---|---|
| 版式 | 与原型 1:1：报头、状态条、研判条、头条、速览、深度解读、持续追踪、区域、归档、页脚，共 13 个版块 |
| 最小字号 | 原型 8px 小字提到 10px。1440 屏上 8px 中文实际不可读 |
| 配色 | 纸白 `#F4F1EA` / 墨黑 `#111` / 酸性黄 `#D8FF00` / 报红 `#E23A2E` |
| 字体 | Noto Serif SC（标题）+ Noto Sans SC（正文），本地自托管，不依赖 Google Fonts |
| 响应式 | 1440 / 1024 / 760 三档；760 以下单列堆叠 |
| 路由 | HashRouter，静态托管不需要 rewrite 规则，任何 CDN 都不会 404 |

## 7. 已知边界

- 起量只看两期（NO.001 / NO.002）。归档、搜索、专题都有内容可走通，但历史厚度不足。
- AI 周报目前两期（W43 / W44），事实取自公开报道并逐条附链接；往期侧栏随期数累积，不做占位假数据。
- `content/raw/` 里是离线快照，不是实时抓取；接真实源需要配 `feeds.json` 并补一个抓取器。
- 配图中 3 张为示意图（`credit` 已标注为素材库），其余为原文配图与授权图库。
- 追踪列表存在浏览器 localStorage，换设备不同步——这是刻意的：不引入账号体系。
