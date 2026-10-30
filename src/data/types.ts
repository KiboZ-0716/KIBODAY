/**
 * 站点消费的数据契约。
 * 生产端是 pipeline/（抓取 → 去重 → 聚类 → 核验 → 编排 → 素材），
 * 站点只读产物，不参与任何内容计算。
 */

export type Tag =
  | '国内'
  | '国际'
  | '经济'
  | '能源'
  | '气候'
  | '科技'
  | '民生'
  | '公共安全'
  | '交通'
  | '产业'

export interface Brief {
  id: string
  time: string
  tag: Tag
  title: string
  source: string
  sources: number
  summary: string
  url: string
}

/** 事件报告：深挖产出。deep = 按提示词模板生成；outline = 尚无完整报告时的基础版 */
export interface Report {
  id: string
  level: 'deep' | 'outline'
  issueNo: number
  date: string
  title: string
  tag: string
  summary: string
  /** 结论先行：三句话讲清这件事 */
  bottomLine: string[]
  sections: { heading: string; paragraphs: string[] }[]
  facts: string[]
  stances: { source: string; point: string }[]
  openQuestions: string[]
  sources: { name: string; time: string; url: string }[]
  generatedWith: {
    level: 'deep' | 'outline'
    promptId: string
    promptVersion: string
    model: string
    generatedAt: string
    note: string
  }
}

export interface SourceRef {
  name: string
  stance: string
  time: string
  verified: boolean
}

/** 可深挖的条目：速览条目或「与你有关」的地区条目 */
export interface Topic {
  id: string
  kind: 'brief' | 'regional'
  issueNo: number
  date: string
  time: string
  tag: string
  title: string
  summary: string
  url: string
  sourceCount: number
  city?: string
  /** 同源报道，作为模型输入素材 */
  reports: { name: string; time: string; title: string; summary: string; url: string }[]
}

/** 模型产出的报告正文 */
export interface DeepReport {
  bottomLine: string[]
  sections: { heading: string; paragraphs: string[] }[]
  facts: string[]
  stances: { source: string; point: string }[]
  openQuestions: string[]
}

/** 报告页实际渲染的对象：正文 + 生成元信息 */
export interface GeneratedReport {
  body: DeepReport
  model: string
  generatedAt: string
  /** model = 本次/此前由模型实时生成；preset = 构建期预生成，可随时重新深挖 */
  from: 'model' | 'preset'
}

export interface SourceBadge {
  initial: string
  name: string
}

export type SideCard =
  | {
      kind: 'image'
      image: string
      credit: string
      label: string
      title: string
      body: string
      readMin: number
      to: string
    }
  | {
      kind: 'data'
      label: string
      caption: string
      big: string
      unit: string
      title: string
      bars: number[]
      footnote: string
      to: string
    }
  | {
      kind: 'quote'
      label: string
      quote: string
      cite: string
    }

export interface Metric {
  value: string
  label: string
}

export interface Analysis {
  articleId: string
  label: string
  topic: string
  title: string
  body: string
  metrics: Metric[]
  takeaway: {
    title: string
    body: string
    points: string[]
  }
  /** 深度解读正文：结论之外的分节论证，替代「原文全文」 */
  sections: {
    heading: string
    paragraphs: string[]
    list?: string[]
  }[]
  /** 数字与出处，逐条可回溯 */
  citations: { label: string; value: string; source: string }[]
}

export interface Trend {
  title: string
  body: string
  momentum: 'up' | 'steady' | 'down'
  score: number
}

export interface TimelineNode {
  time: string
  title: string
  body: string
}

export interface Storyline {
  id: string
  topic: string
  title: string
  summary: string
  image: string | null
  credit: string
  nodes: TimelineNode[]
}

export interface Issue {
  no: number
  date: string
  weekday: string
  window: string
  generatedAt: string
  headline: string
  stats: {
    fetched: number
    events: number
    merged: number
    hidden: number
  }
  synthesis: string
  lead: {
    kicker: string[]
    title: string
    dek: string
    image: string | null
    credit: string
    sources: SourceBadge[]
    verified: boolean
    sourceCount: number
    storylineId: string | null
    href: string | null
  }
  cards: SideCard[]
  briefs: Brief[]
  analysis: Analysis
  storylineId: string | null
  currentNode: number
  trends: Trend[]
  sources: SourceRef[]
  quality: {
    score: number
    items: { label: string; value: string; warn?: boolean }[]
    note: string
  }
  regional: {
    default: string
    cities: {
      city: string
      items: {
        id: string
        tag: string
        title: string
        source: string
        relTime: string
        summary: string
      }[]
    }[]
  }
}

export interface StorylineWithIssues extends Storyline {
  issueNos: number[]
  latestNo: number
}

/* ---------- AI 周报（第二本刊物） ---------- */

export interface WeeklySource {
  name: string
  date: string
  url: string
}

export interface WeeklyDeepDive {
  no: string
  category: string
  title: string
  fact: string
  analysis: string
  pm: string
  project: string
  action: string
  sources: WeeklySource[]
}

export interface WeeklyShip {
  name: string
  category: string
  meaning: string
  heat: string
}

export interface WeeklyTrend {
  title: string
  body: string
}

export interface WeeklyIssue {
  id: string
  no: number
  label: string
  period: string
  publishedAt: string
  headline: string
  thesis: string
  overview: {
    copy: string
    chips: string[]
    takeaway: string
    numbers: { value: string; label: string }[]
  }
  deepDives: WeeklyDeepDive[]
  shipList: WeeklyShip[]
  trends: WeeklyTrend[]
  checklists: { pm: string[]; project: string[] }
  method: string
  sources: WeeklySource[]
  stats?: { deepDives: number; ships: number; trends: number; sources: number }
}

export interface WeeklyArchiveItem {
  id: string
  no: number
  label: string
  period: string
  headline: string
  publishedAt: string
  isCurrent: boolean
  to: string
}

export interface WeeklyData {
  title: string
  tagline: string
  cadence: string
  promptPath: string
  generatedAt: string
  current: WeeklyIssue
  archive: WeeklyArchiveItem[]
  issues: WeeklyIssue[]
}

/** 云端内容包：每日管线产出的全站数据，页面启动时拉取后整体替换本地数据集 */
export interface ContentBundle {
  version: number
  generatedAt: string
  issues: Issue[]
  storylines: Storyline[]
  topics: Topic[]
  weekly: WeeklyData
  reports: Report[]
}
